import { guardPublic, notFound, okPublic } from '@/lib/server/respond'
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
  return guardPublic(request, 600, async () => {
    const leagueId = await resolveLeagueId(await routeParam(context, 'league'))
    if (!leagueId) return notFound('리그를 찾을 수 없습니다')

    const tier = intQuery(request, 'tier', 0)
    const rows = tier > 0 ? await getTierLadder(leagueId, tier) : await getIndependentLadder(leagueId)
    /* 기록 등급(기본 300초) — 랭킹이다. 다른 랭킹 라우트와 같은 등급으로 맞춘다 (D-240) */
    return okPublic({ tiers: await getIndependentTiers(leagueId), tier: tier > 0 ? tier : null, rows })
  })
}
