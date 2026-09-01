import { guard, okPublic } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { searchClans } from '@/lib/server/queries/search'

/** GET /api/clans/search/{q} — 클랜 자동완성 (이름 · slug 부분일치) */
export async function GET(_request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const keyword = await routeParam(context, 'q')
    /* 기록 등급(기본 300초) — 자동완성은 타자 한 번마다 온다. 같은 검색어는 엣지가 답한다 (D-240) */
    return okPublic(await searchClans(keyword))
  })
}
