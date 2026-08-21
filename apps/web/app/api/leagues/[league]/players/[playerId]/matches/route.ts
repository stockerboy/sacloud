import { PAGE_SIZE } from '@sacloud/contract'
import { guard, notFound, okPage } from '@/lib/server/respond'
import { pageParams, routeParam } from '@/lib/server/request'
import { getLeaguePlayerMatches, resolveLeagueId } from '@/lib/server/queries/matches'

/**
 * GET /api/leagues/{leagueId}/players/{playerId}/matches — 개인 기록실 매치 목록 (커서)
 *
 * 계약은 이 자리를 `:leagueId`로 쓰지만, 화면은 URL의 리그 슬러그를 그대로 넣어 부른다.
 * Mock 핸들러도 둘 다 받으므로(`resolveLeagueId`) 실제 API도 같게 맞춘다.
 */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const leagueId = await resolveLeagueId(await routeParam(context, 'league'))
    if (!leagueId) return notFound('리그를 찾을 수 없습니다')
    const playerId = await routeParam(context, 'playerId')
    const { cursor, size } = pageParams(request, PAGE_SIZE.DEFAULT)
    const page = await getLeaguePlayerMatches(leagueId, playerId, cursor, size)
    return page ? okPage(page) : notFound('리그 플레이어를 찾을 수 없습니다')
  })
}
