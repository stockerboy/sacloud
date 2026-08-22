import { badRequest, forbidden, guard, ok } from '@/lib/server/respond'
import { jsonBody, routeParam } from '@/lib/server/request'
import { requireAdmin } from '@/lib/server/session'
import { writeAudit } from '@/lib/server/admin/audit'
import { previewSeasonStart, startSeason } from '@sacloud/db/ops'

/**
 * POST /api/admin/seasons/{league}/start — 새 시즌 시작.
 *
 * `{ "confirm": false }`(기본)면 **미리보기만** 한다.
 * 실제 시작은 승강과 전원 점수 초기화를 동반하므로 `confirm: true`가 있어야 실행된다.
 *
 * 날짜·배포로 자동 시작되는 경로는 **어디에도 없다** (D-077).
 */
export async function POST(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const league = await routeParam(context, 'league')
    const body = (await jsonBody(request).catch(() => ({}))) as {
      confirm?: boolean
      startedAt?: string
      skipPromotion?: boolean
    }

    const preview = await previewSeasonStart(league)
    if (!preview.ok) return badRequest(preview.reason)
    if (!body.confirm) return ok({ preview, executed: false })

    const startedAt = body.startedAt ? new Date(body.startedAt) : undefined
    if (startedAt && Number.isNaN(startedAt.getTime())) {
      return badRequest('startedAt 날짜를 해석할 수 없습니다')
    }

    const result = await startSeason({
      leagueSlug: league,
      startedAt,
      skipPromotion: body.skipPromotion,
    })
    if (!result.ok) return badRequest(result.reason)

    await writeAudit({
      user: admin,
      action: 'season.start',
      targetType: 'league',
      targetId: league,
      before: preview,
      after: result,
    })
    return ok({ preview, executed: true, result })
  })
}
