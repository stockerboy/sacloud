import { guardPublic, notFound, okPublic } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { getLeaguePlayerSeasons } from '@/lib/server/queries/records'

/** GET /api/leagueplayers/{leaguePlayerId}/seasons — 개인 지난시즌 */
export async function GET(_request: Request, context: { params: Promise<Record<string, string>> }) {
  return guardPublic('/api/leagueplayers/[leaguePlayerId]/seasons', 600, async () => {
    const leaguePlayerId = await routeParam(context, 'leaguePlayerId')
    const seasons = await getLeaguePlayerSeasons(leaguePlayerId)
    /* 길게(3600초) — 지난시즌은 시즌 마감 때 찍은 스냅샷이라 사실상 안 변한다 (D-240) */
    return seasons ? okPublic(seasons, undefined, 3600) : notFound('리그 플레이어를 찾을 수 없습니다')
  })
}
