import { guardPublic, notFound, okPublic } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { getClan } from '@/lib/server/queries/clans'

/** GET /api/clans/{clanSlug} — 클랜 기본정보 */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guardPublic(request, 600, async () => {
    const clanSlug = await routeParam(context, 'clanSlug')
    const clan = await getClan(clanSlug)
    /* 기록 등급(기본 300초) — 로그인과 무관한 공개 값이다 (D-240) */
    return clan ? okPublic(clan) : notFound('클랜을 찾을 수 없습니다')
  })
}
