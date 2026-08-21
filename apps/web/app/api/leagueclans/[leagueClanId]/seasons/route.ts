import { guard, notFound, ok } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { getLeagueClanSeasons } from '@/lib/server/queries/records'

/** GET /api/leagueclans/{leagueClanId}/seasons — 클랜 지난시즌 */
export async function GET(_request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const leagueClanId = await routeParam(context, 'leagueClanId')
    const seasons = await getLeagueClanSeasons(leagueClanId)
    return seasons ? ok(seasons) : notFound('리그 클랜을 찾을 수 없습니다')
  })
}
