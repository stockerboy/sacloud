import { guard, notFound, ok } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { getPlayer } from '@/lib/server/queries/players'

/** GET /api/players/{playerId} — 플레이어 기본정보 */
export async function GET(_request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const playerId = await routeParam(context, 'playerId')
    const player = await getPlayer(playerId)
    return player ? ok(player) : notFound('플레이어를 찾을 수 없습니다')
  })
}
