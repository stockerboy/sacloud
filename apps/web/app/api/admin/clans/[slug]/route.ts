import { badRequest, forbidden, guard, notFound, ok } from '@/lib/server/respond'
import { jsonBody, routeParam } from '@/lib/server/request'
import { requireAdmin } from '@/lib/server/session'
import { adminClanDetail } from '@/lib/server/admin/queries'
import { writeAudit } from '@/lib/server/admin/audit'
import { updateClan } from '@sacloud/db/ops'

/** GET /api/admin/clans/{slug} — 클랜 상세 (로스터·별칭·리그 소속 포함) */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const slug = await routeParam(context, 'slug')
    const clan = await adminClanDetail(slug)
    return clan ? ok(clan) : notFound('클랜을 찾을 수 없습니다')
  })
}

/**
 * PATCH /api/admin/clans/{slug} — 이름·구분·티어·활성 변경.
 *
 * 무소속 티어는 **자동으로 바뀌지 않는다.** 여기서 운영자가 직접 정한다 (정책 3).
 */
export async function PATCH(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const slug = await routeParam(context, 'slug')
    const body = (await jsonBody(request)) as {
      name?: string
      category?: string
      tier?: number | null
      active?: boolean
    }

    try {
      const result = await updateClan(slug, body)
      if (!result) return notFound('클랜을 찾을 수 없습니다')
      await writeAudit({
        user: admin,
        action: 'clan.update',
        targetType: 'clan',
        targetId: slug,
        before: result.before,
        after: result.after,
      })
      return ok(result.after)
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : '변경할 수 없습니다')
    }
  })
}
