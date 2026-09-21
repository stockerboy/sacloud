/**
 * ★★선수 점수를 어느 잣대로 보여 주나 — 한 곳에서 정한다★★ (2026-09-21 사장님)
 *
 * > 「너도 알다시피 지금 래더 점수 이런식인거 알지 너 ★3011점★ 이런식으로
 * >  이거 다 고쳐놔 ★랭킹에 있는 점수로★」
 *
 * ── 왜 갈라졌나 (실측)
 *
 *   같은 선수가 화면마다 다른 숫자를 달고 있었다 —
 *   ```
 *   랭킹          3,307점   ← LeaguePlayer.rating (래더)
 *   선수 카드     3,307점   ← 같은 값
 *   ★기본정보★    13.4점   ← scoreRating (경기당 평균 점수)
 *   ```
 *   ★계산이 틀린 게 아니라 잣대가 둘이었다.★ 화면마다 손으로 골라 쓰고 있어서
 *   한 곳을 바꾸면 다른 곳이 따라오지 않았다.
 *
 * ── 그래서 ★스위치 하나★ 로 모은다
 *
 *   랭킹 · 선수 카드 · 기본정보 셋이 ★이 파일만★ 본다. 잣대를 바꾸려면
 *   여기 한 글자만 바꾸면 된다. ★옛 잣대(`average`)는 지우지 않았다★ (`CLAUDE.md` 1-4).
 */
import { formatRatingPoint } from './format'

export type PlayerScoreShown = 'ladder' | 'average'

/**
 * `'ladder'`   ★래더 점수★ (3,307점) — 지금 이것. 랭킹이 줄 세우는 값이다
 * `'average'`  옛 방식. 경기당 평균 점수 (13.4)
 */
export const PLAYER_SCORE_SHOWN = 'ladder' as PlayerScoreShown

export interface PlayerScoreInput {
  /** 래더 (Elo). 늘 있다 */
  rating: number
  /** 경기당 평균 점수. ★못 잰 사람은 `null`★ (D-106) */
  score_rating: number | null
}

/** 화면에 적을 값. ★모르면 `null`★ — 0 으로 우기지 않는다 (D-106) */
export function playerScoreOf(input: PlayerScoreInput): number | null {
  return PLAYER_SCORE_SHOWN === 'ladder' ? input.rating : input.score_rating
}

/** 그 값의 글자. 래더는 `3,307점` · 경기당은 `13.4` */
export function formatPlayerScore(value: number): string {
  return PLAYER_SCORE_SHOWN === 'ladder' ? formatRatingPoint(value) : value.toFixed(1)
}

/**
 * ★「상위권 보정 +N」 을 적나★ (2026-09-21 사장님: 「상위권 보정없애고 랭킹매기라고」)
 *
 * 보정은 이미 ★전부 0★ 으로 껐는데 ★글자만 화면에 남아 있었다.★
 * 되살리려면 `true` 로 둔다 (`CLAUDE.md` 1-4).
 */
export const SHOW_SCORE_BONUS = false as boolean
