import { guardPublic, notFound, okPublic } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { resolveLeagueId } from '@/lib/server/queries/leagues'
import { leagueTopAxes } from '@/lib/server/queries/topAxes'

/**
 * GET /api/leagues/{leagueId}/top-axes — ★부문별 1위★ (2026-09-12 사장님)
 *
 * 여섯 축 + 싸움을 무기로 나눈 일곱 줄. 홈 검색창 밑 판이 쓴다.
 * 로그인과 무관한 값이라 엣지가 대신 답한다 (D-223).
 */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guardPublic(request, 600, async () => {
    const leagueId = await resolveLeagueId(await routeParam(context, 'league'))
    if (!leagueId) return notFound('리그를 찾을 수 없습니다')
    return okPublic(await leagueTopAxes(leagueId))
  })
}
