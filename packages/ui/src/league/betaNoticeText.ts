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
import { BETA_SEASON_LABEL } from '@sacloud/contract'

/**
 * 시즌 이름.
 *
 * 예전에는 `Beta Season` 이었다 (D-098). 사용자 지시로 **`시즌0`** 이 됐다 (D-178) —
 * 시즌1 오픈 전의 테스트 시즌이고 사용자가 그 이름으로 부른다 (D-175).
 * 문자열은 `@sacloud/contract` 한 곳에만 있다. 화면(`apps/web`)도 같은 값을 쓴다.
 */
export const BETA_NOTICE_HEADLINE = BETA_SEASON_LABEL

/** 이 시즌이 무엇인지 */
export const BETA_NOTICE_PURPOSE = '현재 SACLOUD 래더 시스템을 검증하는 공개 테스트 시즌입니다.'

/**
 * 승계되지 않는다는 사실.
 *
 * 예전에는 `정식 Season 8` 이라고 번호를 박아 두었는데, **시즌1 의 번호가 `[미확인]`** 이다
 * (D-175 — 이관 시즌 1~7 이 이미 있어 다음 번호가 8 인지 사용자가 정한다).
 * 모르는 번호를 화면에 쓰지 않는다 (CLAUDE.md 3장 7번). 오픈 날짜도 사용자가 정한다.
 */
export const BETA_NOTICE_CARRYOVER = `${BETA_SEASON_LABEL}의 랭킹과 점수는 다음 정식 시즌에 승계되지 않습니다.`

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
