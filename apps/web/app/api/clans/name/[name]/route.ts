import { guard, notFound, ok } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { findClanByName } from '@/lib/server/queries/search'

/**
 * GET /api/clans/name/{name} — 클랜명 정확일치 조회
 *
 * 정적 세그먼트 `name`이 형제 동적 세그먼트 `[clanSlug]`보다 먼저 매칭된다.
 */
export async function GET(_request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const name = await routeParam(context, 'name')
    const clan = await findClanByName(name)
    return clan ? ok(clan) : notFound('클랜을 찾을 수 없습니다')
  })
}
