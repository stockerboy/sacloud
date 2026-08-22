import { notFound, ok, guard } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { resolveLeagueId } from '@/lib/server/queries/leagues'
import { getOverallClanLadder } from '@/lib/server/queries/ladders'

/**
 * GET /api/leagues/{league}/ranks/overall — 전체 통합 클랜 래더.
 *
 * 1부·2부·무소속을 **전부 섞어서** rating 순으로만 정렬한다.
 * 부리그도 Tier도 보정값이 아니다 — 2부가 1부 위에 오는 것은 정상이다 (D-104).
 * 승강 판단에는 이 래더를 쓰지 않는다. 승강은 부리그 standings 기준이다.
 */
export async function GET(_request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const leagueId = await resolveLeagueId(await routeParam(context, 'league'))
    if (!leagueId) return notFound('리그를 찾을 수 없습니다')
    return ok(await getOverallClanLadder(leagueId))
  })
}
