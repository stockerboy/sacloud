import { guard, notFound, ok } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { findLeagueByName } from '@/lib/server/queries/search'

/**
 * GET /api/leagues/name/{name} — 리그명 정확일치 조회
 *
 * 정적 세그먼트 `name`이 형제 동적 세그먼트 `[league]`보다 먼저 매칭된다.
 */
export async function GET(_request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const name = await routeParam(context, 'name')
    const league = await findLeagueByName(name)
    return league ? ok(league) : notFound('리그를 찾을 수 없습니다')
  })
}
