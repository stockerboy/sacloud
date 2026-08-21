import { notFound, okPage, guard } from '@/lib/server/respond'
import { pageParams, routeParam } from '@/lib/server/request'
import { getLeagueClans } from '@/lib/server/queries/leagues'

/** GET /api/leagues/{leagueSlug}/clans — 리그 참여 클랜 (커서) */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const leagueSlug = await routeParam(context, 'league')
    const { cursor, size } = pageParams(request)
    const page = await getLeagueClans(leagueSlug, cursor, size)
    return page ? okPage(page) : notFound('리그를 찾을 수 없습니다')
  })
}
