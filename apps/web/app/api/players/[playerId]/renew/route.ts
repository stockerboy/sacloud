import { guard, notFound, ok } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { renewPlayer } from '@/lib/server/queries/players'

/**
 * POST /api/players/{playerId}/renew — `정보갱신`
 *
 * **실제 수집은 Phase 8**이다. 지금은 마지막 갱신 시각만 올린다.
 * 로그인·소유권을 요구하는지는 원본에서 확인되지 않았다 [미확인] — Mock과 같이 인증을 걸지 않는다.
 */
export async function POST(_request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const playerId = await routeParam(context, 'playerId')
    const result = await renewPlayer(playerId)
    return result ? ok(result) : notFound('플레이어를 찾을 수 없습니다')
  })
}
