import { guard, notFound, okPage } from '@/lib/server/respond'
import { pageParams, routeParam } from '@/lib/server/request'
import { getClanPlayers } from '@/lib/server/queries/clans'

/** GET /api/clans/{clanSlug}/players — 클랜원 목록 (커서) */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const clanSlug = await routeParam(context, 'clanSlug')
    const { cursor, size } = pageParams(request)
    const page = await getClanPlayers(clanSlug, cursor, size)
    return page ? okPage(page) : notFound('클랜을 찾을 수 없습니다')
  })
}
