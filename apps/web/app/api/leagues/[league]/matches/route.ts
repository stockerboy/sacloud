import { PAGE_SIZE } from '@sacloud/contract'
import { guardPublic, notFound, okPagePublic } from '@/lib/server/respond'
import { pageParams, routeParam } from '@/lib/server/request'
import { getLeagueMatches, resolveLeagueId } from '@/lib/server/queries/matches'

/**
 * `GET /api/leagues/{leagueId}/matches` — **리그 전체 매치 목록** (커서 · O-015).
 *
 * ══ 왜 생겼나 ══
 *
 * 선수별 · 클랜별 · 단건은 있었는데 **리그 전체가 없었다.**
 * 그래서 **닉네임도 클랜명도 모르는 사람은 이 사이트에서 볼 게 하나도 없었다.**
 *
 * ══ 계약의 `:leagueId` 자리 ══
 *
 * 화면은 URL 의 리그 **슬러그**를 그대로 넣어 부른다. 옆 경로들(`players/…/matches` 등)이
 * 이미 그렇게 하고 있어서 `resolveLeagueId` 로 둘 다 받는다. 규칙을 갈라 두지 않는다.
 *
 * ══ 캐시 ══
 *
 * `okPagePublic` — 기록 등급(기본 300초)이다. **끝난 경기 목록이라 자주 바뀌지 않는다.**
 * 이걸 안 쓰면 엣지 캐시를 못 받고, 그러면 공개일에 첫 화면이 그대로 DB 로 간다.
 */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guardPublic(request, 600, async () => {
    const leagueId = await resolveLeagueId(await routeParam(context, 'league'))
    if (!leagueId) return notFound('리그를 찾을 수 없습니다')
    const { cursor, size } = pageParams(request, PAGE_SIZE.DEFAULT)
    return okPagePublic(await getLeagueMatches(leagueId, cursor, size))
  })
}
