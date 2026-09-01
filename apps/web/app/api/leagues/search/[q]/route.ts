import { guard, okPublic } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { searchLeagues } from '@/lib/server/queries/search'

/** GET /api/leagues/search/{q} — 리그 자동완성 (이름 · slug 부분일치) */
export async function GET(_request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const keyword = await routeParam(context, 'q')
    /* 길게(3600초) — 리그가 세 개뿐이라 자동완성 결과가 사실상 고정이다 (D-240) */
    return okPublic(await searchLeagues(keyword), undefined, 3600)
  })
}
