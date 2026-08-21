import { guard, notFound, ok } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { getClan } from '@/lib/server/queries/clans'

/** GET /api/clans/{clanSlug} — 클랜 기본정보 */
export async function GET(_request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const clanSlug = await routeParam(context, 'clanSlug')
    const clan = await getClan(clanSlug)
    return clan ? ok(clan) : notFound('클랜을 찾을 수 없습니다')
  })
}
