import { guard, notFound, ok } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { renewClan } from '@/lib/server/queries/clans'

/**
 * POST /api/clans/{clanSlug}/renew — `전적갱신`
 *
 * **실제 수집은 Phase 8**이다. 지금은 마지막 갱신 시각만 올린다.
 * 로그인·소유권을 요구하는지는 원본에서 확인되지 않았다 [미확인] — Mock과 같이 인증을 걸지 않는다.
 */
export async function POST(_request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const clanSlug = await routeParam(context, 'clanSlug')
    const result = await renewClan(clanSlug)
    return result ? ok(result) : notFound('클랜을 찾을 수 없습니다')
  })
}
