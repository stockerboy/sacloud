import { guardPublic, okPublic } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { searchPlayers } from '@/lib/server/queries/search'

/**
 * GET /api/players/search/{q} — 플레이어 자동완성
 *
 * 결과가 없어도 404가 아니라 빈 배열이다. 입력 중에 호출되는 경로라
 * 404를 내면 화면이 검색 실패로 오인한다.
 */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guardPublic(request, 600, async () => {
    const keyword = await routeParam(context, 'q')
    /* 기록 등급(기본 300초) — 자동완성은 타자 한 번마다 온다. 같은 검색어는 엣지가 답한다 (D-240) */
    return okPublic(await searchPlayers(keyword))
  })
}
