import { guardPublic, notFound, okPublic } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { getClanLeagues } from '@/lib/server/queries/clans'

/** GET /api/clans/{clanSlug}/leagues — 클랜의 리그별 성적 */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guardPublic(request, 600, async () => {
    const clanSlug = await routeParam(context, 'clanSlug')
    const entries = await getClanLeagues(clanSlug)
    /* 기록 등급(기본 300초) — 리그별 성적은 경기가 들어와야 바뀐다 (D-240) */
    return entries ? okPublic(entries) : notFound('클랜을 찾을 수 없습니다')
  })
}
