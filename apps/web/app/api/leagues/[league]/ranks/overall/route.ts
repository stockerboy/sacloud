import { notFound, okPublic, guard } from '@/lib/server/respond'
import { intQuery, routeParam } from '@/lib/server/request'
import { resolveLeagueId } from '@/lib/server/queries/leagues'
import { getOverallClanLadder } from '@/lib/server/queries/ladders'

/**
 * 상위 N건만 받을 때의 상한.
 *
 * `limit` 은 화면이 보내는 값이라 그대로 믿지 않는다. 음수·0·거대한 수가 오면
 * 「없는 것」으로 떨어뜨려 전체를 준다 — 전체가 곧 이 엔드포인트의 원래 동작이다.
 */
const MAX_LIMIT = 100

/**
 * GET /api/leagues/{league}/ranks/overall[?limit=N] — 전체 통합 클랜 래더.
 *
 * 1부·2부·무소속을 **전부 섞어서** rating 순으로만 정렬한다.
 * 부리그도 Tier도 보정값이 아니다 — 2부가 1부 위에 오는 것은 정상이다 (D-104).
 * 승강 판단에는 이 래더를 쓰지 않는다. 승강은 부리그 standings 기준이다.
 *
 * ── `limit` 은 2026-09-01 에 붙였다
 *   메인 신전 히어로가 **IPL 1등 한 곳**을 그린다. 43건을 전부 내려 화면에서 최대값을
 *   고르는 방식은 쓰지 않는다 (D-238 의 교훈 — 「작으니까 괜찮겠지」가 쌓여 운영이 죽었다).
 *   `limit` 이 없으면 예전 그대로 전부 준다.
 *
 * ── 캐시
 *   랭킹은 로그인과 무관하다. 다른 랭킹(`ranks/clans`)과 같이 엣지가 대신 답한다 (D-223).
 *   **원래는 캐시 머리말이 없었다** — 아무도 부르지 않는 라우트였기 때문이다.
 *   이제 메인이 부르므로 붙인다.
 */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const leagueId = await resolveLeagueId(await routeParam(context, 'league'))
    if (!leagueId) return notFound('리그를 찾을 수 없습니다')

    const raw = intQuery(request, 'limit', 0)
    const limit = raw > 0 && raw <= MAX_LIMIT ? raw : undefined

    return okPublic(await getOverallClanLadder(leagueId, limit))
  })
}
