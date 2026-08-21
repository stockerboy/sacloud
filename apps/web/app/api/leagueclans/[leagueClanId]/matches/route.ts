import { PAGE_SIZE } from '@sacloud/contract'
import { guard, notFound, okPage } from '@/lib/server/respond'
import { pageParams, routeParam } from '@/lib/server/request'
import { getLeagueClanMatches } from '@/lib/server/queries/matches'

/** GET /api/leagueclans/{leagueClanId}/matches — 클랜 기록실 매치 목록 (커서) */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const leagueClanId = await routeParam(context, 'leagueClanId')
    const { cursor, size } = pageParams(request, PAGE_SIZE.DEFAULT)
    const page = await getLeagueClanMatches(leagueClanId, cursor, size)
    return page ? okPage(page) : notFound('리그 클랜을 찾을 수 없습니다')
  })
}
