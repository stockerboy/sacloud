import { guard, ok } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { searchPlayers } from '@/lib/server/queries/search'

/**
 * GET /api/players/search/{q} — 플레이어 자동완성
 *
 * 결과가 없어도 404가 아니라 빈 배열이다. 입력 중에 호출되는 경로라
 * 404를 내면 화면이 검색 실패로 오인한다.
 */
export async function GET(_request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const keyword = await routeParam(context, 'q')
    return ok(await searchPlayers(keyword))
  })
}
