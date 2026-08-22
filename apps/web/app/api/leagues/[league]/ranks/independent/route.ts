import { notFound, ok, guard } from '@/lib/server/respond'
import { intQuery, routeParam } from '@/lib/server/request'
import { resolveLeagueId } from '@/lib/server/queries/leagues'
import { getIndependentLadder, getIndependentTiers, getTierLadder } from '@/lib/server/queries/ladders'

/**
 * GET /api/leagues/{league}/ranks/independent[?tier=N] — 무소속 래더.
 *
 * `tier`가 없으면 **Tier를 무시한 무소속 전체 래더**를 준다.
 * `tier=N`이면 그 Tier 안의 순위만 준다.
 *
 * Tier는 운영자가 정한 값을 읽기만 한다. rating으로 자동 승강하지 않는다 (D-104).
 */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const leagueId = await resolveLeagueId(await routeParam(context, 'league'))
    if (!leagueId) return notFound('리그를 찾을 수 없습니다')

    const tier = intQuery(request, 'tier', 0)
    const rows = tier > 0 ? await getTierLadder(leagueId, tier) : await getIndependentLadder(leagueId)
    return ok({ tiers: await getIndependentTiers(leagueId), tier: tier > 0 ? tier : null, rows })
  })
}
