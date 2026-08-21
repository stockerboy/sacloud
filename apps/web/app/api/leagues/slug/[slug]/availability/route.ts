import { guard, ok } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { isSlugTaken } from '@/lib/server/queries/leagues'

/** GET /api/leagues/slug/{slug}/availability — 리그 영문이름 중복 확인 */
export async function GET(_request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const slug = await routeParam(context, 'slug')
    return ok({ slug, available: !(await isSlugTaken(slug)) })
  })
}
