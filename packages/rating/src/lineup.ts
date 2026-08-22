/**
 * 라인업 전력 — **확인된 선수만** 쓴다 (D-065).
 *
 * 정책의 핵심 한 줄:
 *   **확인되지 않은 참가자의 래더를 임의로 추정하지 않는다.**
 *
 * 그래서 두 가지를 분리한다.
 *   - 클랜 공식 rating  : 클랜 자체의 Elo (라인업과 무관)
 *   - 라인업 전력       : 그 경기에 **실제로 확인된** 선수들의 개인 래더 평균
 *
 * 확인 인원이 모자라면(기본 4명 미만) 라인업 전력을 **반영하지 않는다.**
 * 3명만 확인된 경기에서 3명 평균을 5명 팀의 전력으로 쓰는 것은 추정이기 때문이다.
 */
import { DEFAULT_RATING_CONSTANTS, type RatingConstants } from './constants.js'
import type { ConfirmedParticipant } from './eligibility.js'

export interface LineupStrength {
  /** 확인된 선수들의 개인 래더 평균 (없으면 null) */
  average: number | null
  confirmed: number
  /** 이 값을 클랜 Elo 입력에 섞어도 되는가 */
  usable: boolean
}

export function lineupStrength(
  participants: readonly ConfirmedParticipant[],
  constants: RatingConstants = DEFAULT_RATING_CONSTANTS,
): LineupStrength {
  const ratings = participants
    .map((participant) => participant.ratingBefore)
    .filter((rating): rating is number => typeof rating === 'number')

  if (ratings.length === 0) return { average: null, confirmed: 0, usable: false }

  const average = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
  return {
    average,
    confirmed: ratings.length,
    usable: ratings.length >= constants.lineupMinConfirmed,
  }
}

/**
 * 클랜 Elo에 넣을 상대 래더.
 *
 * 양쪽 다 충분히 확인됐을 때만 상대 **라인업** 전력을 섞는다.
 * 하나라도 모자라면 클랜 래더를 그대로 쓴다 — 섞을 근거가 없기 때문이다.
 */
export function effectiveOpponentRating(input: {
  opponentClanRating: number
  opponentLineup: LineupStrength
  ownLineup: LineupStrength
  constants?: RatingConstants
}): { rating: number; blended: boolean } {
  const constants = input.constants ?? DEFAULT_RATING_CONSTANTS
  const canBlend =
    constants.lineupBlend > 0 &&
    input.opponentLineup.usable &&
    input.ownLineup.usable &&
    input.opponentLineup.average !== null

  if (!canBlend) return { rating: input.opponentClanRating, blended: false }

  const blend = constants.lineupBlend
  return {
    rating: input.opponentClanRating * (1 - blend) + (input.opponentLineup.average ?? 0) * blend,
    blended: true,
  }
}
