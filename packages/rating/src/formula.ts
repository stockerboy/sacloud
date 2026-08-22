/**
 * 래더 공식 — **순수 함수**. DB·시각·난수를 쓰지 않는다.
 *
 * 같은 입력이면 언제 몇 번을 돌려도 같은 값이 나온다(결정적 replay의 전제).
 *
 * ── 개인 (P-A 계보 · D-058)
 *   K(R) = max(floor, kBase - R/kSlope)      래더가 높을수록 적게 움직인다
 *   E    = 1 / (1 + 10^((Ro - R) / D))
 *   승리 = +round( K(R) × (1 - E) × winMultiplier × capFactor × repeatFactor )
 *   패배 = -round( K(R) × E × repeatFactor )
 *
 *   원본과 달라진 곳 두 군데 — 승인된 정책 때문이다.
 *     1. **division 보정을 넣지 않는다** (D-059). 그래서 P-A와 P-B의 차이(0.6의 위치)가
 *        계산에 나타나지 않는다. 해석 선택은 설정으로만 남겨 둔다
 *     2. **승리 배수를 1.0으로 둔다** (D-060). 원본 1부의 1.15는 경기마다 점수를 주입해
 *        "승률 50%인데 점수가 오르는" 현상을 만든다
 *
 * ── 클랜 (Team Elo · D-061)
 *   클랜 자체가 rating을 가진다. 소속 division을 입력으로 쓰지 않는다.
 */
import {
  DEFAULT_RATING_CONSTANTS,
  roundHalfUp,
  type RatingConstants,
} from './constants.js'

export type Outcome = 'win' | 'lose'

/** 기대 승률 */
export function expectedScore(
  rating: number,
  opponentRating: number,
  constants: RatingConstants = DEFAULT_RATING_CONSTANTS,
): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / constants.expectedScoreDivisor))
}

/** 개인 K — 래더가 높을수록 작아지고, 바닥 밑으로는 안 내려간다 */
export function personalK(
  rating: number,
  constants: RatingConstants = DEFAULT_RATING_CONSTANTS,
): number {
  return Math.max(constants.personalKFloor, constants.personalKBase - rating / constants.personalKSlope)
}

/**
 * 점수차 보상 감쇠 (D-062).
 *
 * 나보다 한참 낮은 상대를 이겼을 때만 깎는다.
 * - 차이가 `rewardCapStart` 이하 → 1 (안 깎는다)
 * - `rewardCapFull` 이상 → 0 (아무리 이겨도 안 오른다)
 * - 사이는 선형
 *
 * **패배에는 적용하지 않는다.** 약한 상대에게 지면 제값을 잃어야 한다 (업셋 보상 유지 — D-066).
 */
export function rewardCapFactor(
  ratingDifference: number,
  constants: RatingConstants = DEFAULT_RATING_CONSTANTS,
): number {
  if (ratingDifference <= constants.rewardCapStart) return 1
  if (ratingDifference >= constants.rewardCapFull) return 0
  const span = constants.rewardCapFull - constants.rewardCapStart
  return 1 - (ratingDifference - constants.rewardCapStart) / span
}

/**
 * 반복 대전 감쇠 (D-063).
 *
 * **같은 상대에게 같은 결과가 반복될 때만** 깎는다.
 * 결과가 뒤집히면(졌던 팀이 이기면) 새 정보이므로 깎지 않는다.
 * 반복 경기를 금지하지 않는다 — farming 효율만 낮춘다.
 *
 * @param priorSameOutcome 기간 안에서 같은 방향으로 이미 나온 경기 수 (0이면 첫 대결)
 */
export function repeatDecayFactor(
  priorSameOutcome: number,
  constants: RatingConstants = DEFAULT_RATING_CONSTANTS,
): number {
  if (priorSameOutcome <= 0) return 1
  const factor = constants.repeatDecay ** priorSameOutcome
  return Math.max(constants.repeatDecayFloor, factor)
}

export interface RatingUpdateInput {
  ratingBefore: number
  opponentRating: number
  outcome: Outcome
  /** 배치고사 경기는 증감이 0이다 */
  isPlacement?: boolean
  /** 기간 안에서 같은 방향으로 이미 나온 경기 수 */
  priorSameOutcome?: number
  constants?: RatingConstants
}

export interface RatingUpdateResult {
  ratingUpdate: number
  expected: number
  kUsed: number
  capFactor: number
  repeatFactor: number
}

/** 개인 래더 증감 */
export function personalRatingUpdate(input: RatingUpdateInput): RatingUpdateResult {
  const constants = input.constants ?? DEFAULT_RATING_CONSTANTS
  const expected = expectedScore(input.ratingBefore, input.opponentRating, constants)
  const k = personalK(input.ratingBefore, constants)
  const repeatFactor = repeatDecayFactor(input.priorSameOutcome ?? 0, constants)

  if (input.isPlacement) {
    return { ratingUpdate: 0, expected, kUsed: k, capFactor: 1, repeatFactor }
  }

  if (input.outcome === 'lose') {
    return {
      ratingUpdate: -roundHalfUp(k * expected * repeatFactor),
      expected,
      kUsed: k,
      capFactor: 1,
      repeatFactor,
    }
  }

  const capFactor = rewardCapFactor(input.ratingBefore - input.opponentRating, constants)
  const raw = k * (1 - expected) * constants.personalWinMultiplier * capFactor * repeatFactor
  // 깎이지 않는 구간에서는 이겨도 0점이 되지 않게 한다
  const value = capFactor > 0 ? Math.max(constants.minWinReward, roundHalfUp(raw)) : roundHalfUp(raw)

  return { ratingUpdate: value, expected, kUsed: k, capFactor, repeatFactor }
}

/** 클랜 래더 증감 — 같은 구조에 K만 고정값이다 */
export function clanRatingUpdate(input: RatingUpdateInput): RatingUpdateResult {
  const constants = input.constants ?? DEFAULT_RATING_CONSTANTS
  const expected = expectedScore(input.ratingBefore, input.opponentRating, constants)
  const k = constants.clanK
  const repeatFactor = repeatDecayFactor(input.priorSameOutcome ?? 0, constants)

  if (input.isPlacement) {
    return { ratingUpdate: 0, expected, kUsed: k, capFactor: 1, repeatFactor }
  }

  if (input.outcome === 'lose') {
    return {
      ratingUpdate: -roundHalfUp(k * expected * repeatFactor),
      expected,
      kUsed: k,
      capFactor: 1,
      repeatFactor,
    }
  }

  const capFactor = rewardCapFactor(input.ratingBefore - input.opponentRating, constants)
  const raw = k * (1 - expected) * capFactor * repeatFactor
  const value = capFactor > 0 ? Math.max(constants.minWinReward, roundHalfUp(raw)) : roundHalfUp(raw)

  return { ratingUpdate: value, expected, kUsed: k, capFactor, repeatFactor }
}

/** 래더는 하한 밑으로 내려가지 않는다 */
export function applyRating(
  ratingBefore: number,
  ratingUpdate: number,
  constants: RatingConstants = DEFAULT_RATING_CONSTANTS,
): number {
  return Math.max(constants.ratingFloor, ratingBefore + ratingUpdate)
}

/**
 * 시즌 종료 soft reset (D-064).
 *
 * 완전 초기화가 아니다. 높은 점수는 내려오고 낮은 점수는 올라온다.
 * 순위 정보가 **사라지지는 않는다** — 순서는 그대로 보존된다.
 */
export function seasonSoftReset(
  rating: number,
  constants: RatingConstants = DEFAULT_RATING_CONSTANTS,
): number {
  return roundHalfUp(
    constants.seasonBaseline + (rating - constants.seasonBaseline) * constants.seasonCarryRate,
  )
}
