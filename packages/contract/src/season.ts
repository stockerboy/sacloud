/**
 * 시즌 **표기** — 화면에 쓰는 이름을 한 곳에서 정한다 (D-178).
 *
 * ── 왜 여기 있나
 *   값 자체(`Season.number` · `seasonType`)는 DB 가 갖고 있고, `@sacloud/db/ops` 의
 *   `seasonLabel()` 이 CLI·관리도구용 표기를 만든다. 그런데 **사용자에게 보이는 이름**은
 *   화면의 문제다. `packages/contract` 는 화면(`apps/web`)과 공용 컴포넌트(`packages/ui`)가
 *   **둘 다** 의존하는 유일한 순수 패키지라, 여기 두면 두 곳이 같은 문자열을 쓴다.
 *
 * ── `Beta Season` → `시즌0` (2026-08-29 사용자 지시)
 *   내부 번호 0 을 숨기려고 `Beta Season` 이라고 부르던 것을 (D-098) 그만둔다.
 *   시즌0 은 **시즌1 오픈 전의 테스트 시즌**이고 사용자가 그 이름으로 부른다 (D-175).
 *   지난 시즌 카드는 원본 관측대로 `시즌 6` 이다 (D-166) — 띄어쓰기가 다른 것은
 *   사용자가 지시한 표기(`시즌0`)를 그대로 쓴 결과다.
 */

/**
 * `seasonType='beta'` 인 시즌의 화면 표기.
 *
 * ── ★2026-09-03 (O-046) — '시즌0' 에서 'Beta' 로 바꿨다★
 *   사장님이 ★Beta 와 시즌0 을 서로 다른 두 시즌★ 으로 정하셨다.
 *   > «1월첫째주부터 7월첫째주 까지가 Beta, 7월첫째주부터 현재까지가 시즌0»
 *
 *   그전까지 이 저장소는 **beta = 시즌0** 이었다 (D-178). 그래서 이 상수가 '시즌0' 이었다.
 *   이제 둘이 갈라졌으므로 ★이 상수는 Beta 만 가리킨다.★
 *   시즌0 은 `seasonType='official'` · `number=0` 이라 `officialSeasonLabel(0)` 이 맡는다.
 *
 *   ⚠ 옛 값은 `'시즌0'` 이었다. 되돌릴 일이 생기면 이 한 줄이다.
 *   ⚠ ★지금 화면에 안 뜬다★ — `BetaNotice` 는 어느 화면에서도 안 그려지고 있다
 *     (`LeagueHomeLayoutLegacy.tsx:52` — 「관리자 화면 등에서 쓸 수 있어 남겨 둔다」).
 *     그래서 이 변경은 ★사람 눈에 보이는 것을 지금 당장 바꾸지 않는다.★
 */
export const BETA_SEASON_LABEL = 'Beta'

/** 정식·과거 시즌의 화면 표기 — 원본 지난시즌 카드 관측(`시즌 6`)에 맞춘다 (D-166) */
export function officialSeasonLabel(number: number): string {
  return `시즌 ${number}`
}

/* ══════════════════════════════════════════════════════════════════════════
 * ★★근본 시즌★★ (2026-09-04 · Part 1 · 사장님 지시)
 *
 *   > «선수 상세의 과거 3rd.supply 서플라이공식리그 카드 영역 이름은
 *   >  ★근본 시즌★ 으로 통일한다»
 *   > «근본 시즌 = 3rd.supply 서플라이공식리그에서 가져온 과거 공식 기록.
 *   >  현재 SACLOUD 시즌0 / 시즌1과는 ★별도 개념★»
 *
 * ── ★왜 내부 번호를 따로 쓰나★
 *   원본의 시즌 번호는 `1 … 6` 이고, ★우리 시즌 번호도 1 을 쓴다★ (10/1 시즌1).
 *   그대로 넣으면 —
 *   ```
 *   ① 원본 시즌1 카드 294장이 ★우리 10/1 시즌1 기록으로 보인다★
 *   ② unique(leaguePlayerId, seasonId) 때문에
 *      ★나중에 진짜 시즌1 카드를 못 만든다★ — 자리를 과거 기록이 차지한다
 *   ```
 *   그래서 원본 시즌 N 을 ★`-100 - N`★ 으로 저장한다. 겹칠 수 없는 자리다.
 *
 * ── ⚠ ★내부 번호는 화면에 절대 노출하지 않는다★ (사장님 지시)
 *   `-101` 같은 값이 화면에 보이면 그건 사고다. 표기는 언제나 ★근본 시즌★ 이고,
 *   원본 시즌 번호가 필요하면 `LeaguePlayerSeason.season`(=1~6)을 쓴다 —
 *   ★그 칸은 원본이 준 값 그대로다.★
 * ══════════════════════════════════════════════════════════════════════════ */

/** 근본 시즌의 내부 번호 기준점. 원본 시즌 N → `ROOT_SEASON_BASE - N` */
export const ROOT_SEASON_BASE = -100

/** 근본 시즌의 화면 표기. ★번호를 붙이지 않는다★ — 내부 번호가 새어 나가면 안 된다 */
export const ROOT_SEASON_LABEL = '근본 시즌'

/** 원본 시즌 번호(1~6) → 우리 내부 번호(-101~-106) */
export function rootSeasonNumber(sourceSeason: number): number {
  return ROOT_SEASON_BASE - sourceSeason
}

/** 우리 내부 번호 → 원본 시즌 번호. 근본 시즌이 아니면 `null` */
export function sourceSeasonNumber(internal: number): number | null {
  if (internal >= ROOT_SEASON_BASE) return null
  return ROOT_SEASON_BASE - internal
}

/** 이 시즌이 근본 시즌인가 — ★번호 하나로 판정된다★ */
export function isRootSeason(number: number): boolean {
  return number < ROOT_SEASON_BASE
}

/**
 * 화면에 쓸 시즌 이름.
 *
 * `@sacloud/db/ops` 의 `seasonLabel()` 과 **같은 판단**을 하되 베타의 이름만 다르다.
 * DB 쪽은 CLI 로그가 쓰므로 건드리지 않는다.
 */
export function seasonDisplayLabel(season: { number: number; seasonType: string }): string {
  /* ★근본 시즌이 제일 먼저다★ — 번호를 붙이면 내부 번호(-101…)가 화면에 샌다 */
  if (isRootSeason(season.number)) return ROOT_SEASON_LABEL
  return season.seasonType === 'beta' ? BETA_SEASON_LABEL : officialSeasonLabel(season.number)
}
