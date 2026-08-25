/**
 * 래더 공식 — **순수 함수** (결정적 replay의 핵심).
 *
 * 사양: `docs/RATING_FINAL_SPEC.md` (D-145 FINAL LOCK)
 *
 * ── 한 문장 요약
 *   강한 상대를 이기면 많이 오르고 약한 상대를 이기면 적게 오른다.
 *   뻔한 경기는 이겨도 져도 거의 안 움직이고, **이변은 온전히 반영된다.**
 *   킬뎃은 점수에 들어가지 않는다. 판수만 많다고 오르지 않는다.
 */
import { DEFAULT_RATING_CONSTANTS, roundHalfUp, type RatingConstants } from './constants.js'

export type Outcome = 'win' | 'lose'

/** 기대 승률 — 표준 Elo */
export function expectedScore(
  rating: number,
  opponentRating: number,
  constants: RatingConstants = DEFAULT_RATING_CONSTANTS,
): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / constants.expectedScoreDivisor))
}

/**
 * **일방적인 경기 억제** (D-143 · D-145 에서 끝점 0.86).
 *
 * `howExpected` 는 "그 결과가 얼마나 예상됐는가" 다 — 이겼으면 `E`, 졌으면 `1 − E`.
 * 0.5 근처(접전)면 1 이고, 한쪽으로 치우칠수록 0 에 가까워진다.
 *
 * ── 왜 양쪽에 함께 거는가
 *   이긴 쪽만 0 으로 만들면 점수가 사라져 제로섬이 깨지고,
 *   강자에게 사냥당한 약팀만 일방적으로 손해를 본다.
 *
 * ── 왜 이변은 만점인가
 *   약한 쪽이 이기면 `howExpected` 가 작아 억제가 걸리지 않는다.
 *   "강한 상대를 실제로 이긴 것" 이 가장 크게 평가돼야 하기 때문이다.
 */
export function suppressionFactor(
  howExpected: number,
  constants: RatingConstants = DEFAULT_RATING_CONSTANTS,
): number {
  const { full, zero } = constants.suppression
  if (howExpected <= full) return 1
  if (howExpected >= zero) return 0
  return 1 - (howExpected - full) / (zero - full)
}

export interface RatingUpdateInput {
  ratingBefore: number
  opponentRating: number
  outcome: Outcome
  /** 배치고사 경기는 증감이 0이다 */
  isPlacement?: boolean
  constants?: RatingConstants
}

export interface RatingUpdateResult {
  /** 내부 Elo 증감. **실수다** — 경기마다 반올림하면 제로섬이 깨진다 */
  ratingUpdate: number
  expected: number
  kUsed: number
  /** 적용된 억제 비율 (1 = 그대로, 0 = 반영 안 함) */
  suppression: number
}

function ratingUpdate(input: RatingUpdateInput, k: number): RatingUpdateResult {
  const constants = input.constants ?? DEFAULT_RATING_CONSTANTS
  const expected = expectedScore(input.ratingBefore, input.opponentRating, constants)

  if (input.isPlacement) {
    return { ratingUpdate: 0, expected, kUsed: k, suppression: 1 }
  }

  const actual = input.outcome === 'win' ? 1 : 0
  const howExpected = input.outcome === 'win' ? expected : 1 - expected
  const suppression = suppressionFactor(howExpected, constants)

  return {
    ratingUpdate: k * (actual - expected) * suppression,
    expected,
    kUsed: k,
    suppression,
  }
}

/** 개인 래더 증감 */
export function personalRatingUpdate(input: RatingUpdateInput): RatingUpdateResult {
  const constants = input.constants ?? DEFAULT_RATING_CONSTANTS
  return ratingUpdate(input, constants.personalK)
}

/** 클랜 래더 증감 — 개인과 **같은 공식·같은 K** 다 */
export function clanRatingUpdate(input: RatingUpdateInput): RatingUpdateResult {
  const constants = input.constants ?? DEFAULT_RATING_CONSTANTS
  return ratingUpdate(input, constants.clanK)
}

/** 래더는 하한 밑으로 내려가지 않는다 */
export function applyRating(
  ratingBefore: number,
  update: number,
  constants: RatingConstants = DEFAULT_RATING_CONSTANTS,
): number {
  return Math.max(constants.ratingFloor, ratingBefore + update)
}

/* -------------------------------------------------------------------------- */
/* 표시 점수                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 신뢰도 — **표시 점수에만** 곱한다. 내부 Elo 는 영향받지 않는다.
 *
 * 150경기에서 정확히 1 이 되고 **그 뒤로는 완전히 평평하다.**
 * 판수 자체가 점수를 주지 않는다는 뜻이다.
 *
 * D-145 에서 계단식(40/55/70/85/95/100%)을 대체했다. 계단식은 한 경기로
 * 신뢰도가 15%p 뛰어 표시 점수가 최대 +236 움직였다. 이 곡선은 최대 +12 다.
 */
export function confidenceFor(
  games: number,
  constants: RatingConstants = DEFAULT_RATING_CONSTANTS,
): number {
  if (games >= constants.confidenceFullAt) return 1
  return Math.sqrt(Math.max(0, games) / constants.confidenceFullAt)
}

/**
 * 랭커 승률 자격선 (D-143).
 *
 * **강한 상대와 많이 붙었다는 사실은 랭커 자격이 아니다.**
 * 상대 강도는 승리의 값어치를 정하는 것이지 패배의 면죄부가 아니다.
 *
 * 자격 미달이면 그 밴드 바로 아래로 내려가고, **부족한 승률만큼 더** 내려간다.
 * 한 점(3999)에 몰리지 않게 하기 위한 것이다.
 *
 * @param winRate 0~1
 */
export function applyWinRateBands(
  display: number,
  winRate: number,
  constants: RatingConstants = DEFAULT_RATING_CONSTANTS,
): number {
  let ceiling = Number.POSITIVE_INFINITY
  for (const band of constants.winRateBands) {
    if (winRate >= band.minWinRate) continue
    /* **이미 그 밴드 아래에 있으면 건드리지 않는다.**
       자격선은 "그 구간에 올라오지 못하게" 하는 장치이지, 낮은 점수를 더 끌어내리는
       벌점이 아니다. 이 조건이 없으면 승률 20% 인 3,500점 선수가 3,439 로 내려간다. */
    if (display < band.minDisplay) continue
    const shortfall = (band.minWinRate - winRate) * 100
    ceiling = Math.min(ceiling, band.minDisplay - 1 - shortfall * constants.winRateShortfallPenalty)
  }
  return Math.min(display, ceiling)
}

export interface DisplayInput {
  internalRating: number
  games: number
  /** 0~1 */
  winRate: number
  /** 누적된 활동 페널티 (표시 점수에서 뺀다) */
  activityPenalty?: number
  constants?: RatingConstants
}

export interface DisplayResult {
  /** 자격선·감점 적용 전 */
  base: number
  /** 자격선 적용 후 */
  gated: number
  /** 최종 표시 점수 (정수) */
  display: number
  confidence: number
  /** 실제로 차감된 페널티 */
  penaltyApplied: number
}

/**
 * 최종 표시 점수.
 *
 * **순서가 중요하다** — 표시 기본값 → 승률 자격선 → 활동 페널티.
 * 바꾸면 잠수로 4000 아래로 내려간 사람이 자격선을 우회한다.
 */
export function displayScore(input: DisplayInput): DisplayResult {
  const constants = input.constants ?? DEFAULT_RATING_CONSTANTS
  const confidence = confidenceFor(input.games, constants)
  const base =
    constants.initialRating +
    (input.internalRating - constants.initialRating) * confidence * constants.displayScale
  const gated = applyWinRateBands(base, input.winRate, constants)
  // 감점만으로 기준점 아래로 내려가지 않는다
  const penaltyApplied = Math.max(
    0,
    Math.min(input.activityPenalty ?? 0, Math.max(0, gated - constants.initialRating)),
  )
  return {
    base,
    gated,
    display: roundHalfUp(gated - penaltyApplied),
    confidence,
    penaltyApplied,
  }
}

/* -------------------------------------------------------------------------- */
/* 미참여 감점                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * 하루치 활동 페널티.
 *
 * 구간을 **표시 점수** 기준으로 잡았기 때문에 내려갈수록 감점 속도도 같이 느려진다 —
 * 자동으로 자기 제한이 걸린다. 내부 Elo 는 절대 건드리지 않는다.
 * 사라진 것은 실력이 아니라 **현재 왕좌를 지킬 자격**이다.
 */
export function dailyDecay(
  displayBeforePenalty: number,
  idleDays: number,
  constants: RatingConstants = DEFAULT_RATING_CONSTANTS,
): number {
  const tier = constants.decayTiers.find((t) => displayBeforePenalty >= t.minDisplay)
  if (!tier) return 0
  if (idleDays < tier.graceDays) return 0
  return tier.weekly / 7
}

/** 클랜은 개인과 **다른 표**를 쓴다 — 조직이라 기준이 짧아도 된다 */
export function clanDailyDecay(
  idleDays: number,
  constants: RatingConstants = DEFAULT_RATING_CONSTANTS,
): number {
  const tier = constants.clanDecayTiers.find((t) => idleDays >= t.minIdleDays)
  return tier ? tier.weekly / 7 : 0
}

/* -------------------------------------------------------------------------- */
/* 클랜 구성 보정                                                                */
/* -------------------------------------------------------------------------- */

/**
 * 최근 N경기 평균 본클랜원 수 → 구성 보정.
 *
 * **판수로 누적되지 않는다.** 몇 판을 하든 상한(+50)이 최대다.
 * 클랜원 1명이어도 0점 처리하지 않는다 — 보정이 +0 일 뿐 래더는 정상으로 움직인다.
 */
export function compositionScore(
  avgMembers: number,
  constants: RatingConstants = DEFAULT_RATING_CONSTANTS,
): number {
  const curve = constants.compositionCurve
  const ratio = constants.compositionCap / 100
  const first = curve[0]!
  const last = curve[curve.length - 1]!
  if (avgMembers <= first[0]) return first[1] * ratio
  if (avgMembers >= last[0]) return last[1] * ratio
  for (let i = 1; i < curve.length; i += 1) {
    const [x1, y1] = curve[i - 1]!
    const [x2, y2] = curve[i]!
    if (avgMembers <= x2) {
      const t = (avgMembers - x1) / (x2 - x1)
      return (y1 + t * (y2 - y1)) * ratio
    }
  }
  return last[1] * ratio
}

/** 최근 N경기의 평균 본클랜원 수 */
export function averageMembers(
  recent: readonly number[],
  constants: RatingConstants = DEFAULT_RATING_CONSTANTS,
): number {
  if (recent.length === 0) return 0
  const slice = recent.slice(-constants.compositionWindow)
  return slice.reduce((sum, n) => sum + n, 0) / slice.length
}

/**
 * 새 시즌의 시작 래더 (D-064).
 *
 * **모두 같은 값에서 시작한다.** 이전 시즌 점수는 시작점에 어떤 보정도 주지 않는다.
 * 지난 시즌 기록은 그대로 보존한다.
 */
export function seasonStartRating(
  constants: RatingConstants = DEFAULT_RATING_CONSTANTS,
): number {
  return roundHalfUp(constants.seasonBaseline)
}
