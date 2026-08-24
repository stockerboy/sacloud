/**
 * 검증 대상 rating 엔진 — **제안 설계안**이다. 운영 코드가 아니다.
 *
 * 운영(`packages/rating`)은 1500 기준의 현행 공식이고 이번 작업에서 **건드리지 않는다.**
 * 여기 있는 것은 "3000 기준 · 3개월 시즌 · 구성 보너스" 설계안을 **검증하기 위한 별도 구현**이다.
 * 검증이 끝나고 사람이 승인해야 운영에 반영한다.
 *
 * ── 확정된 규칙 (사용자 지시)
 *   1. 정상 5v5면 **전부** rating 대상이다. official/unofficial 은 게이트가 아니다
 *   2. 같은 상대와 반복했다는 이유로 **감쇠하지 않는다** (멸망전은 정상 경쟁이다)
 *   3. 클랜 구성 보너스는 **승리했을 때만** 준다. 패배 추가 패널티는 없다
 *   4. 보너스는 **자기 팀 본클랜원 수**만 본다. 상대 구성과 비교하지 않는다
 *   5. 용병도 개인 rating 은 100% 받는다
 *   6. 본클랜원 수는 **경기 당시 소속** 기준이다
 */

export const BASELINE = 3000

/* -------------------------------------------------------------------------- */
/* Elo 기본                                                                     */
/* -------------------------------------------------------------------------- */

/** 표준 Elo 기대 승률 */
export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400))
}

/* -------------------------------------------------------------------------- */
/* 개인                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * 판수 → 신뢰도. **점수 보너스가 아니라 실력 추정의 확신도**다.
 * 150판을 넘으면 더 준다고 올라가지 않는다 — 판수 박치기를 막는 지점이다.
 */
export function confidenceFor(games: number): number {
  if (games >= 150) return 1.0
  if (games >= 121) return 0.95
  if (games >= 91) return 0.85
  if (games >= 61) return 0.7
  if (games >= 31) return 0.55
  return 0.4
}

/** 신뢰도를 어디에 적용하는가 */
export type ConfidenceMode =
  /** internal 은 그대로 두고 **표시값만** 당긴다 */
  | 'display'
  /** 경기별 delta 자체에 곱한다 (internal 이 천천히 오른다) */
  | 'delta'

export interface PersonalConstants {
  k: number
  /** 개인 퍼포먼스(KD·MVP)가 delta 를 흔들 수 있는 최대 비율. 0 이면 승패만 본다 */
  performanceWeight: number
  confidenceMode: ConfidenceMode
  ratingFloor: number
}

export const DEFAULT_PERSONAL: PersonalConstants = {
  k: 60,
  performanceWeight: 0.1,
  confidenceMode: 'display',
  ratingFloor: 1000,
}

export interface PersonalInput {
  ratingBefore: number
  opponentAvgRating: number
  won: boolean
  /** -1 (많이 못함) ~ +1 (많이 잘함). 그 경기 안에서의 상대적 퍼포먼스 */
  performance: number
  gamesBefore: number
  constants: PersonalConstants
}

export interface PersonalResult {
  delta: number
  ratingAfter: number
  expected: number
  baseDelta: number
  performanceAdjustment: number
}

/**
 * 개인 한 경기.
 *
 * 퍼포먼스는 **크기(|baseDelta|)에 비례해 더하거나 뺀다.** 곱하지 않는다 —
 * 곱하면 패배했을 때 잘한 사람이 더 많이 깎이는 뒤집힌 결과가 나온다.
 *
 *   승리 +35 · 잘함(+1) → +35 + 35×0.10 = +38.5
 *   패배 -35 · 잘함(+1) → -35 + 35×0.10 = -31.5   (덜 깎인다)
 */
export function personalUpdate(input: PersonalInput): PersonalResult {
  const expected = expectedScore(input.ratingBefore, input.opponentAvgRating)
  const actual = input.won ? 1 : 0
  let baseDelta = input.constants.k * (actual - expected)

  if (input.constants.confidenceMode === 'delta') {
    baseDelta *= confidenceFor(input.gamesBefore)
  }

  const performance = Math.max(-1, Math.min(1, input.performance))
  const performanceAdjustment =
    Math.abs(baseDelta) * input.constants.performanceWeight * performance

  const delta = baseDelta + performanceAdjustment
  return {
    delta,
    ratingAfter: Math.max(input.constants.ratingFloor, input.ratingBefore + delta),
    expected,
    baseDelta,
    performanceAdjustment,
  }
}

/** 표시 rating. `display` 모드에서만 신뢰도로 당긴다 */
export function displayRating(
  internal: number,
  games: number,
  mode: ConfidenceMode,
): number {
  if (mode !== 'display') return internal
  return BASELINE + (internal - BASELINE) * confidenceFor(games)
}

/* -------------------------------------------------------------------------- */
/* 클랜                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * 구성 보너스를 어떻게 줄 것인가 (대안 비교용).
 *
 * `current` 가 사용자가 확정한 안이다. 나머지는 시뮬레이션에서 문제가 나왔을 때
 * **같은 시드로 비교**하기 위한 후보이고, 임의로 기본값을 바꾸지 않는다.
 */
export type BonusMode =
  /** 확정안 — 승자에게만 더한다. 리그 전체 점수가 그만큼 늘어난다(positive-sum) */
  | 'current'
  /** 패자에게서 같은 양을 뺀다 — 총량 보존(zero-sum). 패배 '구성' 패널티는 여전히 없다 */
  | 'zero-sum'
  /** 이길 확률이 낮았을수록 보너스를 더 준다 — 약자 상대 반복으로 쌓는 것을 막는다 */
  | 'opponent-scaled'
  /** 래더에 넣지 않고 **따로 표시**한다 — 래더는 순수 Elo 로 둔다 */
  | 'separate-track'

export interface ClanConstants {
  /** 동급전에서 ±30 이 나오도록 60 (60 × 0.5 = 30) */
  k: number
  /** 본클랜원 n명 승리 시 추가점. index 0 은 안 쓴다 (0명이면 그 클랜 경기가 아니다) */
  compositionWinBonus: readonly number[]
  ratingFloor: number
  bonusMode: BonusMode
}

export const DEFAULT_CLAN: ClanConstants = {
  k: 60,
  // 1명 +0 · 2명 +3 · 3명 +6 · 4명 +9 · 5명 +12  →  (n-1) × 3
  compositionWinBonus: [0, 0, 3, 6, 9, 12],
  ratingFloor: 1000,
  bonusMode: 'current',
}

/** 본클랜원 수 → 승리 보너스. 범위를 벗어나면 끝값으로 자른다 */
export function compositionBonus(members: number, constants: ClanConstants): number {
  const table = constants.compositionWinBonus
  if (members <= 0) return 0
  if (members >= table.length) return table[table.length - 1]!
  return table[members]!
}

export interface ClanInput {
  ratingBefore: number
  opponentRating: number
  won: boolean
  /** **경기 당시** 본클랜원 수 (1~5). 용병은 세지 않는다 */
  members: number
  /** 상대 팀 본클랜원 수 — `zero-sum` 모드에서 상대가 낸 보너스를 빼기 위해 필요하다 */
  opponentMembers?: number
  constants: ClanConstants
}

export interface ClanResult {
  delta: number
  ratingAfter: number
  baseDelta: number
  bonus: number
  expected: number
}

/**
 * 클랜 한 경기.
 *
 * **패배 쪽 구성 패널티는 없다.** 클랜원을 모아 온 것은 장려할 행동이라
 * 졌을 때 더 깎으면 시스템 목적과 충돌한다.
 */
export function clanUpdate(input: ClanInput): ClanResult {
  const expected = expectedScore(input.ratingBefore, input.opponentRating)
  const actual = input.won ? 1 : 0
  const baseDelta = input.constants.k * (actual - expected)

  const raw = compositionBonus(input.members, input.constants)
  let bonus = 0
  switch (input.constants.bonusMode) {
    case 'current':
      bonus = input.won ? raw : 0
      break
    case 'zero-sum':
      // 이기면 받고, 지면 **상대가 받은 만큼** 잃는다. 총량이 늘지 않는다
      bonus = input.won
        ? raw
        : -compositionBonus(input.opponentMembers ?? 0, input.constants)
      break
    case 'opponent-scaled':
      // 이길 확률이 낮았을수록 크게. 약자 상대 반복으로는 거의 쌓이지 않는다
      bonus = input.won ? raw * 2 * (1 - expected) : 0
      break
    case 'separate-track':
      // 래더에는 넣지 않는다 (집계는 bonus 값으로 따로 본다)
      bonus = 0
      break
  }

  const delta = baseDelta + bonus
  return {
    delta,
    ratingAfter: Math.max(input.constants.ratingFloor, input.ratingBefore + delta),
    baseDelta,
    bonus,
    expected,
  }
}
