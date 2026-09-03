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

/**
 * 화면에 쓸 시즌 이름.
 *
 * `@sacloud/db/ops` 의 `seasonLabel()` 과 **같은 판단**을 하되 베타의 이름만 다르다.
 * DB 쪽은 CLI 로그가 쓰므로 건드리지 않는다.
 */
export function seasonDisplayLabel(season: { number: number; seasonType: string }): string {
  return season.seasonType === 'beta' ? BETA_SEASON_LABEL : officialSeasonLabel(season.number)
}
