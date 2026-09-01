import { guardPublic, notFound, okPublic } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { getLeaguePlayerDetail } from '@/lib/server/queries/records'

/**
 * GET /api/leagues/{leagueSlug}/players/{playerId} — 리그 내 플레이어 상세 (기록실 상단 요약 포함)
 *
 * 여기서 `[league]`는 계약상 **리그 슬러그**다.
 * (바로 아래 `matches`는 계약상 `:leagueId`라 해석이 다르다 — 핸들러마다 계약대로 읽는다.)
 */
export async function GET(_request: Request, context: { params: Promise<Record<string, string>> }) {
  return guardPublic('/api/leagues/[league]/players/[playerId]', 600, async () => {
    const leagueSlug = await routeParam(context, 'league')
    const playerId = await routeParam(context, 'playerId')
    const detail = await getLeaguePlayerDetail(leagueSlug, playerId)
    /*
     * 로그인과 무관한 공개 값이라 엣지가 대신 답한다 (D-223 · D-230 후속).
     *
     * ⚠ 이 화면이 **운영에서 500 이었다.** 육각형 백분위가 「그 리그 같은 무기 선수
     *   전원의 분포」를 요구해서, 열산(20만 경기) 상위 선수가 11~17초 걸려 죽었다.
     *   인덱스로 대부분 살렸지만 **콜드 첫 요청은 여전히 무겁다** — 그 한 번을
     *   엣지가 덮는다. 같은 선수를 두 번째 보는 사람은 함수를 안 깨운다.
     */
    return detail ? okPublic(detail) : notFound('리그 플레이어를 찾을 수 없습니다')
  })
}
