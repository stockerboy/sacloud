import { guard, notFound, ok } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { getLeaguePlayerSeasons } from '@/lib/server/queries/records'

/** GET /api/leagueplayers/{leaguePlayerId}/seasons — 개인 지난시즌 */
export async function GET(_request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const leaguePlayerId = await routeParam(context, 'leaguePlayerId')
    const seasons = await getLeaguePlayerSeasons(leaguePlayerId)
    return seasons ? ok(seasons) : notFound('리그 플레이어를 찾을 수 없습니다')
  })
}
