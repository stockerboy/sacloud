import { notFound, ok, guard } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { getLeague } from '@/lib/server/queries/leagues'

/**
 * GET /api/leagues/{leagueSlug} — 리그 상세
 *
 * 경로 파라미터 이름이 `[league]`인 이유
 *   계약은 같은 자리에 `:leagueSlug`(리그홈·클랜)와 `:leagueId`(랭킹·매치)를 섞어 쓴다.
 *   Next는 한 세그먼트에 서로 다른 이름의 동적 라우트를 둘 수 없으므로 이름을 하나로 통일하고,
 *   **핸들러마다 슬러그인지 ID인지 계약대로 해석한다.**
 */
export async function GET(_request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const leagueSlug = await routeParam(context, 'league')
    const league = await getLeague(leagueSlug)
    return league ? ok(league) : notFound('리그를 찾을 수 없습니다')
  })
}
