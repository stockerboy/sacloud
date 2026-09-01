import { guardPublic, notFound, okPublic } from '@/lib/server/respond'
import { query, routeParam } from '@/lib/server/request'
import { getMatch, resolveLeagueId } from '@/lib/server/queries/matches'

/**
 * GET /api/leagues/{leagueId}/matches/{matchId}?league_clan_id= — 경기 상세
 *
 * `league_clan_id`는 어느 기록실에서 아코디언을 펼쳤는지를 알려준다.
 * 상대 클랜 소속 플레이어의 딜량·헤드샷을 `알수없음`으로 지우는 데 쓴다
 * (`docs/DECISIONS.md` D-004 — 원본 URL에는 없는 값이라 `[자체 설계]`).
 * 없으면 red 쪽을 기본으로 본다.
 *
 * 계약상 `[league]`는 리그 ID지만, 화면은 리그 슬러그로 부른다(Mock도 둘 다 받는다).
 */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guardPublic(request, 600, async () => {
    const leagueId = await resolveLeagueId(await routeParam(context, 'league'))
    if (!leagueId) return notFound('리그를 찾을 수 없습니다')
    const matchId = await routeParam(context, 'matchId')
    const match = await getMatch(leagueId, matchId, query(request, 'league_clan_id'))
    /* 기록 등급(기본 300초) — 끝난 경기다. 다만 수집이 라인업을 뒤에 채우므로 길게 잡지 않는다 (D-240) */
    return match ? okPublic(match) : notFound('경기를 찾을 수 없습니다')
  })
}
