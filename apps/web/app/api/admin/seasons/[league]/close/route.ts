import { badRequest, forbidden, guard, ok } from '@/lib/server/respond'
import { jsonBody, routeParam } from '@/lib/server/request'
import { requireAdmin } from '@/lib/server/session'
import { writeAudit } from '@/lib/server/admin/audit'
import { closeSeason, previewSeasonClose } from '@sacloud/db/ops'

/**
 * POST /api/admin/seasons/{league}/close — 시즌 종료.
 *
 * `{ "confirm": false }`(기본)면 **미리보기만** 한다. 실제로 닫으려면 `confirm: true`가 필요하다.
 * 되돌리기 어려운 작업이라 확인 없이 실행하지 않는다 (정책 24).
 */
export async function POST(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const league = await routeParam(context, 'league')
    const body = (await jsonBody(request).catch(() => ({}))) as {
      confirm?: boolean
      endedAt?: string
    }

    const preview = await previewSeasonClose(league)
    if (!preview.ok) return badRequest(preview.reason)
    if (!body.confirm) return ok({ preview, executed: false })

    const endedAt = body.endedAt ? new Date(body.endedAt) : undefined
    if (endedAt && Number.isNaN(endedAt.getTime())) {
      return badRequest('endedAt 날짜를 해석할 수 없습니다')
    }

    const result = await closeSeason({ leagueSlug: league, endedAt })
    if (!result.ok) return badRequest(result.reason)

    await writeAudit({
      user: admin,
      action: 'season.close',
      targetType: 'league',
      targetId: league,
      before: preview,
      after: result,
    })
    return ok({ preview, executed: true, result })
  })
}
