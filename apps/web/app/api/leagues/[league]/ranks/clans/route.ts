import { PAGE_SIZE } from '@sacloud/contract'
import { notFound, okPage, guard } from '@/lib/server/respond'
import { intQuery, pageParams, routeParam } from '@/lib/server/request'
import { getClanRanks, resolveLeagueId } from '@/lib/server/queries/leagues'

/**
 * GET /api/leagues/{leagueId}/ranks/clans?division=N — 클랜랭킹
 *
 * 계약은 이 자리를 **리그 ID**로 적지만, 화면은 **슬러그**를 넣어 호출한다.
 * `resolveLeagueId`가 둘 다 받는다 (`queries/leagues.ts` 주석 참조).
 * 랭킹은 20건 단위 (원본 관측값).
 */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const leagueId = await resolveLeagueId(await routeParam(context, 'league'))
    if (!leagueId) return notFound('리그를 찾을 수 없습니다')
    const division = intQuery(request, 'division', 1)
    const { cursor, size } = pageParams(request, PAGE_SIZE.RANK)
    const page = await getClanRanks(leagueId, division, cursor, size)
    return page ? okPage(page) : notFound('리그를 찾을 수 없습니다')
  })
}
