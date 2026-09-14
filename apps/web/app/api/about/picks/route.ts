import { forbidden, guard, ok } from '@/lib/server/respond'
import { requireAdmin } from '@/lib/server/session'
import { aboutShowcases } from '@/lib/server/queries/aboutPicks'
import { ABOUT_PUBLIC } from '@/lib/aboutGate'

/**
 * GET /api/about/picks — 소개 페이지가 ★무엇을 보여 줄지★ (2026-09-14).
 *
 * ★누구를 보여 줄지 고르고, 그 상세까지 한 덩어리로 준다.★
 * 고르는 기준 — 경기 최다 선수 · 경기 최다 클랜 · 라운드 최다 경기.
 *
 * ⚠ 상세를 화면이 따로 부르게 했더니, 리그 둘 × 상세 셋 = 여섯 번이 동시에 날아가
 *   연결이 모자라 전부 멈췄다 (2026-09-14 실측). 서버가 차례로 모아서 한 번에 준다.
 *   값은 ★선수·클랜·경기 상세를 만드는 그 함수★ 가 그대로 만든다 — 새로 짓지 않는다.
 *
 * ── ★지금은 관리자만★ (사장님: «앞쪽으로 빼는데 빼기전에 일단 관리자로 로그인해서
 *   나부터 볼 수 있게 해줘 로그인 전에는 못보게 내가 보고나서 밖으로 뺄지 결정한다»)
 *   공개로 바꾸려면 `lib/aboutGate.ts` 의 `ABOUT_PUBLIC` 을 `true` 로 두면 된다.
 */
export async function GET(request: Request) {
  return guard(async () => {
    if (!ABOUT_PUBLIC) {
      const admin = await requireAdmin(request)
      if (!admin) return forbidden('아직 공개 전입니다')
    }
    return ok(await aboutShowcases())
  })
}
