import { guard, notFound, ok } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { getClanLeagues } from '@/lib/server/queries/clans'

/** GET /api/clans/{clanSlug}/leagues — 클랜의 리그별 성적 */
export async function GET(_request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const clanSlug = await routeParam(context, 'clanSlug')
    const entries = await getClanLeagues(clanSlug)
    return entries ? ok(entries) : notFound('클랜을 찾을 수 없습니다')
  })
}
