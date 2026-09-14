import { guardPublic, notFound, okPublic } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { leagueHexTop } from '@/lib/server/queries/hexTop'

/**
 * GET /api/leagues/{league}/hex-top — ★분야별 TOP5★ (2026-09-14 사장님).
 *
 *   «추가로 페이지 하나 더 만들자 여기서는 클랜 , 개인6각 top5 보여주자 각 분야별 top5»
 *
 * 클랜 여섯 축 · 개인 여섯 축, 축마다 다섯 줄. 한 번에 다 내린다 —
 * 축마다 따로 부르면 열두 번 왕복이고, 어차피 한 화면이 열둘을 다 그린다.
 *
 * ── 캐시
 *   로그인과 무관한 랭킹이라 다른 랭킹과 같이 엣지가 대신 답한다 (D-223).
 *   육각은 잡이 하루 단위로 다시 재므로 10분이면 넉넉하다.
 *
 * ── 리그 슬러그를 그대로 받는다
 *   `leagueHexTop` 이 안에서 슬러그로 리그를 찾고, ★리그 규칙★(`leagueScreen`)도
 *   슬러그로 본다 — 클랜 기록을 안 주는 리그는 클랜 자리가 빈 배열로 나간다.
 */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guardPublic(request, 600, async () => {
    const slug = await routeParam(context, 'league')
    const data = await leagueHexTop(slug)
    if (data === null) return notFound('리그를 찾을 수 없습니다')
    return okPublic(data)
  })
}
