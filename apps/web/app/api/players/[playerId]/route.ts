import { guardPublic, notFound, okPublic } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { getPlayer } from '@/lib/server/queries/players'

/** GET /api/players/{playerId} — 플레이어 기본정보 */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guardPublic(request, 600, async () => {
    const playerId = await routeParam(context, 'playerId')
    const player = await getPlayer(playerId)
    /* 기록 등급(기본 300초) — 로그인과 무관한 공개 프로필이다 (D-240) */
    return player ? okPublic(player) : notFound('플레이어를 찾을 수 없습니다')
  })
}
