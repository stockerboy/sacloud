import { guardPublic, notFound, okPublic } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { getLeagueClanSeasons } from '@/lib/server/queries/records'

/** GET /api/leagueclans/{leagueClanId}/seasons — 클랜 지난시즌 */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guardPublic(request, 600, async () => {
    const leagueClanId = await routeParam(context, 'leagueClanId')
    const seasons = await getLeagueClanSeasons(leagueClanId)
    /* 길게(3600초) — 지난시즌은 시즌 마감 때 찍은 스냅샷이라 사실상 안 변한다 (D-240) */
    return seasons ? okPublic(seasons, undefined, 3600) : notFound('리그 클랜을 찾을 수 없습니다')
  })
}
