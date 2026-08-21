import { guard, notFound, ok } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { findPlayerByName } from '@/lib/server/queries/search'

/**
 * GET /api/players/name/{name} — 닉네임 정확일치 조회
 *
 * 통합검색에서 검색어를 그대로 제출했을 때 쓰는 경로다.
 * 정적 세그먼트 `name`이 형제 동적 세그먼트 `[playerId]`보다 먼저 매칭된다.
 */
export async function GET(_request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const name = await routeParam(context, 'name')
    const player = await findPlayerByName(name)
    return player ? ok(player) : notFound('플레이어를 찾을 수 없습니다')
  })
}
