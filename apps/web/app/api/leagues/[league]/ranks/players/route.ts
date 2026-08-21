import { PAGE_SIZE } from '@sacloud/contract'
import { notFound, okPage, guard } from '@/lib/server/respond'
import { pageParams, routeParam } from '@/lib/server/request'
import { getPlayerRanks, resolveLeagueId } from '@/lib/server/queries/leagues'

/**
 * GET /api/leagues/{leagueId}/ranks/players — 개인랭킹
 *
 * 계약은 이 자리를 **리그 ID**로 적지만 화면은 **슬러그**를 넘긴다.
 * `resolveLeagueId`가 둘 다 받는다. 랭킹은 20건 단위.
 */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const leagueId = await resolveLeagueId(await routeParam(context, 'league'))
    if (!leagueId) return notFound('리그를 찾을 수 없습니다')
    const { cursor, size } = pageParams(request, PAGE_SIZE.RANK)
    const page = await getPlayerRanks(leagueId, cursor, size)
    return page ? okPage(page) : notFound('리그를 찾을 수 없습니다')
  })
}
