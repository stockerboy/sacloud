import { badRequest, forbidden, guard, notFound, ok } from '@/lib/server/respond'
import { jsonBody, routeParam } from '@/lib/server/request'
import { requireAdmin } from '@/lib/server/session'
import { writeAudit } from '@/lib/server/admin/audit'
import { setLeagueDivision } from '@sacloud/db/ops'

/**
 * PUT /api/admin/clans/{slug}/division — 공식리그 부리그 설정.
 *
 * **division은 rating 공식에 들어가지 않는다** (D-059). 시즌 소속 상태일 뿐이다.
 * 잘못 들어간 소속을 여기서 고친다.
 */
export async function PUT(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const clanSlug = await routeParam(context, 'slug')
    const body = (await jsonBody(request)) as { leagueSlug?: string; division?: number }
    if (!body.leagueSlug || !body.division) return badRequest('leagueSlug와 division이 필요합니다')

    try {
      const result = await setLeagueDivision({
        leagueSlug: body.leagueSlug,
        clanSlug,
        division: body.division,
      })
      if (!result) return notFound('리그 또는 클랜을 찾을 수 없습니다')
      await writeAudit({
        user: admin,
        action: 'clan.division',
        targetType: 'clan',
        targetId: clanSlug,
        before: result.before,
        after: result.after,
        note: body.leagueSlug,
      })
      return ok(result.after)
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : '변경할 수 없습니다')
    }
  })
}
