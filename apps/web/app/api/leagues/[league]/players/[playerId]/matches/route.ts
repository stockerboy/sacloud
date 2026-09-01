import { PAGE_SIZE } from '@sacloud/contract'
import { guardPublic, notFound, okPagePublic } from '@/lib/server/respond'
import { pageParams, routeParam } from '@/lib/server/request'
import { getLeaguePlayerMatches, resolveLeagueId } from '@/lib/server/queries/matches'

/**
 * GET /api/leagues/{leagueId}/players/{playerId}/matches — 개인 기록실 매치 목록 (커서)
 *
 * 계약은 이 자리를 `:leagueId`로 쓰지만, 화면은 URL의 리그 슬러그를 그대로 넣어 부른다.
 * Mock 핸들러도 둘 다 받으므로(`resolveLeagueId`) 실제 API도 같게 맞춘다.
 */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guardPublic(request, 600, async () => {
    const leagueId = await resolveLeagueId(await routeParam(context, 'league'))
    if (!leagueId) return notFound('리그를 찾을 수 없습니다')
    const playerId = await routeParam(context, 'playerId')
    const { cursor, size } = pageParams(request, PAGE_SIZE.DEFAULT)
    const page = await getLeaguePlayerMatches(leagueId, playerId, cursor, size)
    /* 기록 등급(기본 300초) — 끝난 경기 목록이다 (D-240) */
    return page ? okPagePublic(page) : notFound('리그 플레이어를 찾을 수 없습니다')
  })
}
