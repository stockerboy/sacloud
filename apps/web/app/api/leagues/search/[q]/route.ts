import { guard, ok } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { searchLeagues } from '@/lib/server/queries/search'

/** GET /api/leagues/search/{q} — 리그 자동완성 (이름 · slug 부분일치) */
export async function GET(_request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const keyword = await routeParam(context, 'q')
    return ok(await searchLeagues(keyword))
  })
}
