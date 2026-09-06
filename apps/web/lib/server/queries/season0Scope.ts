/**
 * 화면이 쓰는 **현재 시즌(시즌0) 창** — 값은 여기서 만들지 않는다 (D-178).
 *
 * ── 값은 한 곳에만 있다
 *   창(시작 시각 · 대상 `origin`)의 단일 정의는 **`apps/worker/src/lib/season0Window.ts`**
 *   다 (D-175). 화면이 같은 날짜를 다시 적으면 창이 바뀔 때 한쪽만 고쳐져 조용히 갈라진다 —
 *   실제로 그 사고가 D-176 이었다(집계는 창 안, 화면은 전 기간).
 *   그래서 이 파일은 **상수를 다시 쓰지 않고 그대로 가져다 쓴다.**
 *
 *   `@sacloud/worker` 를 의존성으로 걸지 않고 **경로로 직접 읽는다.** worker 는
 *   빌드 산출물이 없는 CLI 패키지라 패키지로 끌어오면 DB·넥슨 클라이언트까지 딸려 온다.
 *   `season0Window.ts` 는 **import 가 하나도 없는 순수 상수 파일**이라 이 참조만으로 끝난다.
 *   `next.config.ts` 의 `transpilePackages` 도 건드리지 않는다.
 *
 *   ⚠ 이 파일은 worker 를 **읽기만** 한다. worker 쪽에 값을 되쓰지 않는다.
 *
 * ── 창이 걸리는 곳 / 걸리지 않는 곳
 *
 *   걸린다   선수·클랜의 **성적 수치** — 상세정보 누적 · 최근매치 요약 · 연승연패 ·
 *            평균킬 분모 · 폼 그래프. 랭킹 표(집계 칸)와 같은 모집단이어야 한다
 *   안 걸린다 **기록실(경기 목록) · 매치 상세 · 지난시즌 카드.**
 *            2026-03 이전 기록은 지우지 않았고 거기서는 계속 보인다 (D-175 정한 것 ②)
 *
 * ── 끝을 박지 않는다
 *   `SEASON0_TO` 는 `null`(열린 구간)이다. 시즌1 오픈일은 사용자가 정한다.
 *   `null` 이면 상한 조건을 아예 붙이지 않는다 — `new Date()` 를 쓰면 요청마다 값이
 *   달라져 같은 DB 에서도 숫자가 흔들린다.
 */
import type { Prisma } from '@sacloud/db'
/* 창의 단일 정의(D-175)를 **경로로** 읽는다. 값을 복제하지 않으려는 의도적 참조다 */
import {
  SEASON0_FROM,
  SEASON0_ORIGINS,
  SEASON0_TO,
} from '../../../../worker/src/lib/season0Window'

export { SEASON0_FROM, SEASON0_ORIGINS, SEASON0_TO }

/**
 * 현재 시즌 창 안의 경기인가 — `Match` 에 바로 거는 조건.
 *
 * `startAt` 하나만 본다. `origin` 은 "래더 경기인가"(`ladderScope.ts`)가 이미 본다.
 */
export function seasonWindowWhere(): Prisma.MatchWhereInput {
  return {
    startAt: {
      gte: SEASON0_FROM,
      ...(SEASON0_TO ? { lt: SEASON0_TO } : {}),
    },
    /*
     * ── ★★숨긴 사본은 세지 않는다★★ (2026-09-06 · Part 8 에서 찾았다)
     *
     *   O-056 에서 중복 경기에 `supersededAt` 을 붙여 숨겼고, 스키마 주석은
     *   ★«화면·집계·DB 자물쇠가 표시 붙은 줄을 안 본다»★ 라고 적어 뒀다.
     *   Part 7 에서 ★집계★ 쪽을 고쳤는데 ★화면 쪽에는 그 조건이 없었다.★
     *
     *   그래서 두 숫자가 갈라져 있었다 —
     *   ```
     *   랭킹(집계 표를 읽음)       숨긴 사본 뺀 값   ← 맞는 값
     *   선수 상세(그 자리에서 셈)   숨긴 사본 센 값   ← 부풀려진 값
     *   ```
     *   실측(2026-09-06): 열산 Cloud 0 창 안 숨긴 사본 ★39건 · 참가기록 390줄★ ·
     *   ★숫자가 달라지는 선수 34명★ (IPL·SPL 은 창 안에 숨긴 사본이 없어 0명).
     *
     *   ⚠ ★공식은 한 글자도 안 바꿨다.★ ★모집단에서 빠져야 할 줄을 뺐을 뿐이다.★
     *   ⚠ 과거 중복 34,862건은 `supersededAt` 이 ★null★ 이라 안 걸린다 — 동결 그대로다.
     */
    supersededAt: null,
  }
}

/** 이미 다른 조건이 있는 `Match` where 에 안전하게 덧붙인다 (`OR` 충돌을 피한다) */
export function withSeasonWindow(where: Prisma.MatchWhereInput): Prisma.MatchWhereInput {
  return { AND: [where, seasonWindowWhere()] }
}
