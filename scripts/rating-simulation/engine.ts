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
  /**
   * 표시 배율 (D-140). 내부 Elo 는 그대로 두고 **보여 주는 숫자만** 늘린다.
   * 1 이면 내부값 그대로. 3.3 이면 내부 3387 → 표시 4277.
   */
  displayScale: number
  /**
   * **약팀 사냥 차단선** (D-142). 기대 승률이 이 값 이상이면 이겨도 점수가 오르지 않는다.
   * `undefined` 면 끄기 (기존 동작). 지는 것은 언제나 그대로 손해다.
   *
   * @deprecated D-143 에서 `weakWinSuppression` 으로 대체됐다. 비교용으로만 남긴다.
   */
  winGainCutoff?: number
  /**
   * **일방적인 경기 억제** (D-143) — 차단선의 계단을 없앤 매끄러운 버전.
   *
   * `full` 이하의 기대 승률에서는 그대로(1), `zero` 이상에서는 0, 사이는 선형으로 줄인다.
   * **예상대로 끝난 일방적인 경기에만** 적용한다 — 이변(underdog 승)은 언제나 만점이다.
   */
  weakWinSuppression?: { full: number; zero: number }
}

export const DEFAULT_PERSONAL: PersonalConstants = {
  k: 60,
  performanceWeight: 0.1,
  confidenceMode: 'display',
  ratingFloor: 1000,
  displayScale: 1,
}

/**
 * **후보 1안** (D-140) — 사용자가 시뮬레이션 결과를 보고 정한 운영 후보.
 *
 *   K 50 · 퍼포먼스 ±5% · 신뢰도는 표시값에만 · 표시 배율 3.3
 */
export const CANDIDATE1_PERSONAL: PersonalConstants = {
  k: 50,
  performanceWeight: 0.05,
  confidenceMode: 'display',
  ratingFloor: 1000,
  displayScale: 3.3,
}

/**
 * **후보 1안** 클랜 — 순수 Elo 만. 누적 보너스를 아예 끈다.
 * 구성은 래더 밖에서 상한 100 의 보정으로 얹는다 (`compositionScore`).
 */
export const CANDIDATE1_CLAN: ClanConstants = {
  k: 50,
  compositionWinBonus: [0, 0, 0, 0, 0, 0],
  ratingFloor: 1000,
  bonusMode: 'separate-track',
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
/**
 * 결과가 얼마나 예상됐는지(0.5~1) → 반영 비율(1~0).
 *
 * `full` 이하면 그대로 반영하고, `zero` 이상이면 반영하지 않는다. 사이는 선형이다.
 */
export function expectedOutcomeFactor(
  howExpected: number,
  { full, zero }: { full: number; zero: number },
): number {
  if (howExpected <= full) return 1
  if (howExpected >= zero) return 0
  return 1 - (howExpected - full) / (zero - full)
}

export function personalUpdate(input: PersonalInput): PersonalResult {
  const expected = expectedScore(input.ratingBefore, input.opponentAvgRating)
  const actual = input.won ? 1 : 0
  let baseDelta = input.constants.k * (actual - expected)

  /* **너무 약한 상대를 이겨서는 더 오르지 않는다** (D-142).
 
     순수 Elo 는 "3100 상대 95% 승" 과 "3500 상대 60% 승" 을 같게 본다. 수학적으로는 맞지만
     제3보급창고에는 매치메이킹이 없어서 **상대를 직접 고를 수 있다.** 그래서 약팀만 300판
     골라 잡는 것만으로 4,876 까지 올라갔다 — 강한 상대를 한 번도 이기지 않고서. */
  const cutoff = input.constants.winGainCutoff
  if (cutoff !== undefined && input.won && expected >= cutoff) {
    baseDelta = 0
  }

  /* **일방적인 경기는 양쪽 모두 조금만 움직인다** (D-143).
 
     차단선(D-142)에는 두 가지 문제가 있었다.
       1. 계단이다. 기대 89.9% 는 제값을 받고 90.0% 부터 갑자기 0 이 된다.
       2. **이긴 쪽만** 0 이 되고 진 쪽은 그대로 잃는다. 점수가 사라지고(제로섬 위반),
          강자에게 사냥당한 약팀만 일방적으로 손해를 본다.
 
     그래서 **결과가 예상대로 나온 일방적인 경기**에서는 양쪽의 변동을 함께 줄인다.
     이변(약팀이 이김)은 새로운 정보이므로 **언제나 만점**으로 반영한다 —
     그래야 "강한 상대를 실제로 이긴 것" 이 가장 크게 평가된다.
 
     기준값은 **그 결과가 얼마나 예상됐는가**다.
       이겼으면 expected, 졌으면 1 − expected.
     둘 다 0.5 근처(접전)면 1 이고, 한쪽으로 치우칠수록 0 에 가까워진다. */
  const suppression = input.constants.weakWinSuppression
  if (suppression) {
    const howExpected = input.won ? expected : 1 - expected
    baseDelta *= expectedOutcomeFactor(howExpected, suppression)
  }

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

/**
 * 표시 rating.
 *
 * ── 배율을 왜 따로 두는가 (후보 1안 · D-140)
 *   K를 40 → 70 으로 올려도 1위가 14점밖에 안 움직였다. **K는 점수판의 높이를 정하는
 *   다이얼이 아니다** — 레이팅이 얼마나 빨리 움직이는지를 정할 뿐이다.
 *   그래서 내부 Elo 는 안정적으로 두고 **보여 주는 숫자만** 배율로 늘린다.
 *
 *     내부 3387 · 배율 3.3  →  3000 + 387 × 3.3 = 4277
 *
 *   내부 계산을 억지로 4300 에 맞추지 않는 것이 요점이다.
 *   신뢰도는 배율 **앞에** 적용한다 — 덜 검증된 사람의 점수를 3배로 부풀리면 안 된다.
 */
export function displayRating(
  internal: number,
  games: number,
  mode: ConfidenceMode,
  displayScale = 1,
): number {
  const confidence = mode === 'display' ? confidenceFor(games) : 1
  return BASELINE + (internal - BASELINE) * confidence * displayScale
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

/* -------------------------------------------------------------------------- */
/* 후보 1안 — 상한 있는 구성 보정 (D-140)                                        */
/* -------------------------------------------------------------------------- */

/**
 * 최근 N경기 평균 본클랜원 수 → **구성 보정 점수** (상한 100).
 *
 * ── 왜 누적을 버리는가
 *   매 승리마다 +12 를 영구히 더하면 **판수가 곧 점수**가 된다.
 *   실측에서 clan-65 는 Elo 누적이 -1,762 인데 보너스 +2,178 로 6위였다.
 *   "잘해서가 아니라 많이 해서" 올라간 것이라, 막으려던 문제가 다른 얼굴로 돌아온 셈이다.
 *
 * ── 그래서 상태값으로 바꾼다
 *   구성도는 **쌓이는 것이 아니라 현재 상태**다. 최근 경기에서 자기 클랜원을 몇 명
 *   데려왔는지를 보고 최대 100점을 얹는다. 500판을 해도 100을 넘지 않는다.
 *
 * ── 곡선
 *   사용자가 준 기준점은 "평균 2명대 → 최대 +20 · 3명대 → +40 · 4명대 → +70 · 5명 → +100" 이다.
 *   구간 안에서 뚝뚝 끊기면 2.99 와 3.00 이 20점씩 벌어지므로 **기준점 사이를 직선으로 잇는다.**
 *   그래야 "한 명 더 데려오면 조금 더 받는다"가 성립해 행동을 유도한다.
 *
 *     1.0 → 0 · 2.0 → 20 · 3.0 → 40 · 4.0 → 70 · 5.0 → 100
 */
export const COMPOSITION_CURVE: readonly [number, number][] = [
  [1, 0],
  [2, 20],
  [3, 40],
  [4, 70],
  [5, 100],
]

export function compositionScore(
  avgMembers: number,
  curve: readonly [number, number][] = COMPOSITION_CURVE,
): number {
  const ratio = COMPOSITION_CAP / 100
  const at = (value: number): number => value * ratio
  if (avgMembers <= curve[0]![0]) return at(curve[0]![1])
  const last = curve[curve.length - 1]!
  if (avgMembers >= last[0]) return at(last[1])
  for (let i = 1; i < curve.length; i += 1) {
    const [x1, y1] = curve[i - 1]!
    const [x2, y2] = curve[i]!
    if (avgMembers <= x2) {
      const t = (avgMembers - x1) / (x2 - x1)
      return at(y1 + t * (y2 - y1))
    }
  }
  return at(last[1])
}

/** 최근 N경기만 본다 — 옛날에 잘 모았다고 계속 받으면 그것도 누적이다 */
export let COMPOSITION_WINDOW = 20
/** 구성 보정 상한. 곡선 전체를 이 값에 맞춰 늘리거나 줄인다 */
export let COMPOSITION_CAP = 100

/**
 * 상한·창 크기를 바꾼다 (sweep 용).
 *
 * 시뮬레이션 파라미터 탐색에만 쓴다 — 운영이라면 설정으로 뺄 값이다.
 * 곡선 모양은 유지하고 **비례로만** 늘리고 줄인다.
 */
export function setCompositionParams(cap: number, window: number): void {
  COMPOSITION_CAP = cap
  COMPOSITION_WINDOW = window
}

export function averageMembers(recent: readonly number[], window = COMPOSITION_WINDOW): number {
  if (recent.length === 0) return 0
  const slice = recent.slice(-window)
  return slice.reduce((sum, n) => sum + n, 0) / slice.length
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
