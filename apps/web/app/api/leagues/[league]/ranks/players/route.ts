import { PAGE_SIZE, parseRankWeapon } from '@sacloud/contract'
import { notFound, okPage, guard } from '@/lib/server/respond'
import { pageParams, query, routeParam } from '@/lib/server/request'
import { getPlayerRanks, resolveLeagueId } from '@/lib/server/queries/leagues'
import { getPlayerRanksByWeapon } from '@/lib/server/queries/rankings'

/**
 * GET /api/leagues/{leagueId}/ranks/players — 개인랭킹
 *
 * 계약은 이 자리를 **리그 ID**로 적지만 화면은 **슬러그**를 넘긴다.
 * `resolveLeagueId`가 둘 다 받는다. 랭킹은 20건 단위.
 *
 * `weapon=all|sniper|rifle` 로 무기 축을 고른다 (D-169, 원본에 없는 신규 기능).
 * 파라미터가 없거나 모르는 값이면 `all` — **기존 동작 그대로**다.
 * 통합은 기존 `getPlayerRanks`를 그대로 부른다. 무기 축을 더해도 통합 래더는 바뀌지 않는다.
 */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const leagueId = await resolveLeagueId(await routeParam(context, 'league'))
    if (!leagueId) return notFound('리그를 찾을 수 없습니다')
    const { cursor, size } = pageParams(request, PAGE_SIZE.RANK)
    const weapon = parseRankWeapon(query(request, 'weapon'))
    const page =
      weapon === 'all'
        ? await getPlayerRanks(leagueId, cursor, size)
        : await getPlayerRanksByWeapon(leagueId, weapon, cursor, size)
    return page ? okPage(page) : notFound('리그를 찾을 수 없습니다')
  })
}
