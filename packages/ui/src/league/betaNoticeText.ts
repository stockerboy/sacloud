/**
 * 베타 시즌 안내 문구 — **순수 로직** (Phase 11).
 *
 * 베타는 숨겨진 시즌이 아니라 **공개 시즌**이다 (D-098). 그래서 감추지도 않고,
 * 사이트 전체를 덮는 경고로 만들지도 않는다. 규칙은 두 가지다.
 *
 *   1. 무엇을 하는 시즌인지 한 줄
 *   2. 정식 시즌에 승계되지 않는다는 사실 한 줄
 *
 * 문구를 화면마다 다시 쓰지 않는다. 여기 한 곳에서만 정한다.
 */

/** 시즌 이름. 내부 번호가 0이라고 `Season 0`이라고 쓰지 않는다 (D-098) */
export const BETA_NOTICE_HEADLINE = 'Beta Season'

/** 이 시즌이 무엇인지 */
export const BETA_NOTICE_PURPOSE = '현재 SACLOUD 래더 시스템을 검증하는 공개 테스트 시즌입니다.'

/**
 * 승계되지 않는다는 사실.
 *
 * `Season 8`은 베타 다음에 오는 **정식 시즌 이름**이라 문구에 그대로 쓴다.
 * 날짜·기간을 박아 넣는 것과는 다른 문제다 (기간은 어디에도 하드코딩하지 않는다).
 */
export const BETA_NOTICE_CARRYOVER = '베타 시즌의 랭킹과 점수는 정식 Season 8에 승계되지 않습니다.'

/** 배지 tooltip처럼 한 문장만 필요한 자리에서 쓴다 */
export const BETA_NOTICE = BETA_NOTICE_CARRYOVER

export interface BetaNoticeContent {
  headline: string
  lines: string[]
}

/**
 * 이 시즌에 안내를 붙이는가.
 *
 * 베타일 때만 내용을 돌려준다. 정식·레거시 시즌에는 **아무것도 붙이지 않는다** —
 * 평상시 화면에 상시 배너가 뜨면 그게 곧 과도한 경고 UI다.
 */
export function betaNoticeFor(
  seasonType: 'legacy' | 'beta' | 'official' | null | undefined,
): BetaNoticeContent | null {
  if (seasonType !== 'beta') return null
  return {
    headline: BETA_NOTICE_HEADLINE,
    lines: [BETA_NOTICE_PURPOSE, BETA_NOTICE_CARRYOVER],
  }
}
