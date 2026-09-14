import { guardPublic, notFound, okPublic } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { getFlagBoard } from '@/lib/server/queries/flagBoard'

/**
 * GET /api/leagues/{league}/flags — ★깃발판★ (2026-09-15 사장님).
 *
 *   «17시부터 03시까지의 1,2,3등을 라이브로 보여주고 3시에 마감치는거야.»
 *
 * 열려 있으면 그날 재료로 ★지금 세서★, 닫혀 있으면 ★박아 둔 깃발★ 을 준다.
 *
 * ── 왜 엣지 시간이 짧은가
 *   경쟁 중에는 ★순위가 계속 바뀐다.★ 10분을 캐시하면 «라이브» 가 거짓말이 된다.
 *   그래서 ★60초★ 만 맡긴다. 마감 뒤에는 어차피 안 바뀌는 값이라 손해가 없다.
 */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guardPublic(request, 60, async () => {
    const slug = await routeParam(context, 'league')
    const data = await getFlagBoard(slug)
    if (data === null) return notFound('리그를 찾을 수 없습니다')
    return okPublic(data)
  })
}
