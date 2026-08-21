import { guard, ok } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { searchClans } from '@/lib/server/queries/search'

/** GET /api/clans/search/{q} — 클랜 자동완성 (이름 · slug 부분일치) */
export async function GET(_request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const keyword = await routeParam(context, 'q')
    return ok(await searchClans(keyword))
  })
}
