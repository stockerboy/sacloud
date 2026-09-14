import { guardPublic, notFound, okPublic } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { dailyPodium } from '@/lib/server/queries/dailyPodium'

/**
 * GET /api/leagues/{league}/daily-podium — ★오늘의 셋★ (2026-09-14 사장님).
 *
 *   «그 날 클랜전한 인원들을 일열로 세워서 육각축이 고르게 전부 잘한 사람 + 승률도
 *     좋아야함 3명 그리고 3개씩 뽑아서 올려주는거 어때? 그 날 승률이랑 킬뎃 적어주고
 *     (IPL도 여기에만 예외로 킬뎃 적어줌)»
 *
 * 개인 셋 · 클랜 셋을 한 번에 준다. 개인랭킹 화면과 클랜랭킹 화면이 같은 응답을
 * 나눠 쓴다 — 두 번 부르면 같은 계산을 두 번 하게 된다.
 *
 * 로그인과 무관하고 하루에 몇 번 바뀌지 않는다. 엣지가 10분 대신 답한다.
 */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guardPublic(request, 600, async () => {
    const slug = await routeParam(context, 'league')
    const data = await dailyPodium(slug)
    if (data === null) return notFound('리그를 찾을 수 없습니다')
    return okPublic(data)
  })
}
