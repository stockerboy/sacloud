import { guardPublic, notFound, okPagePublic } from '@/lib/server/respond'
import { pageParams, routeParam } from '@/lib/server/request'
import { getClanPlayers } from '@/lib/server/queries/clans'

/** GET /api/clans/{clanSlug}/players — 클랜원 목록 (커서) */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guardPublic(request, 600, async () => {
    const clanSlug = await routeParam(context, 'clanSlug')
    const { cursor, size } = pageParams(request)
    const page = await getClanPlayers(clanSlug, cursor, size)
    /* 기록 등급(기본 300초) — 클랜원 명단은 공개 값이고 자주 바뀌지 않는다 (D-240) */
    return page ? okPagePublic(page) : notFound('클랜을 찾을 수 없습니다')
  })
}
