import { guard, okPublic } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { getPlayerLeagues } from '@/lib/server/queries/players'

/**
 * GET /api/players/{playerId}/leagues — 참여중인 리그별 요약
 *
 * 참여한 리그가 없으면 빈 배열이다. 플레이어가 존재하지 않아도 마찬가지로 빈 배열을 준다
 * (Mock과 동일 — 프로필 화면이 기본정보 쪽 404로 이미 분기한다).
 */
export async function GET(_request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const playerId = await routeParam(context, 'playerId')
    /* 기록 등급(기본 300초) — 리그별 요약은 경기가 들어와야 바뀐다 (D-240) */
    return okPublic(await getPlayerLeagues(playerId))
  })
}
