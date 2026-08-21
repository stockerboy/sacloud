/**
 * 악용·경계 시나리오 — Phase 9 조사용 sandbox (운영 코드 아님).
 *
 * 각 함수는 **순수 함수**다. DB·시각·전역 난수를 쓰지 않는다(seed만 쓴다).
 * 그래서 전부 회귀 테스트로 고정할 수 있다.
 *
 * 여기서 답하려는 질문은 하나다.
 *   "이 공식으로 점수를 매기면, **정직하게 하는 사람이 손해를 보는 구간**이 있는가?"
 */
import {
  CROSS_DIVISION_DAMPING,
  DIV1_PARAMS,
  DIV2_PARAMS,
  ratingUpdate,
  type CrossMode,
} from './ladder.js'
import {
  clanDeltaMemberMean,
  clanDeltaTeamElo,
  clanRatingRosterStrength,
  type ClanLadderCandidate,
} from './clanLadder.js'
import { createRng, describe, type Distribution } from './simulate.js'

const DIV1 = DIV1_PARAMS
const DIV2 = DIV2_PARAMS

function update(input: {
  rating: number
  opponent: number
  isWin: boolean
  crossMode: CrossMode
  division?: 1 | 2
  opponentDivision?: 1 | 2
}): number {
  const division = input.division ?? 1
  const opponentDivision = input.opponentDivision ?? division
  const params = division === 1 ? DIV1 : DIV2
  const crossDamping = division === 1 && opponentDivision !== 1 ? CROSS_DIVISION_DAMPING : 1
  return ratingUpdate({
    ratingBefore: input.rating,
    opponentAvgRating: input.opponent,
    isWin: input.isWin,
    crossDamping,
    params,
    crossMode: input.crossMode,
  }).ratingUpdate
}

/* ------------------------------------------------- 0. 스펙 §8 회귀 앵커 --- */

export interface SpecAnchors {
  /** 관측 ≈ -12 */
  div1Even: number
  /** 관측 ≈ -15 */
  div2Even: number
  /** 관측 ≈ -7 (div1 측만 감쇠) */
  div1VsDiv2: number
  /** div2 측은 감쇠되지 않는다 → -15 여야 한다 */
  div2VsDiv1: number
  /** 동급 승리에서 실제로 나오는 정수들 — +11 · +19가 있으면 관측과 어긋난다 */
  winValues: number[]
}

/**
 * 스펙 §8이 요구한 회귀 항목을 숫자로 뽑는다.
 *
 * 세 해석(`crossMode`) 중 **어느 것이 관측값을 재현하는지** 여기서 갈린다.
 */
export function specAnchors(crossMode: CrossMode): SpecAnchors {
  const winValues = new Set<number>()
  for (let rating = 1000; rating <= 4000; rating += 100) {
    winValues.add(update({ rating, opponent: rating, isWin: true, crossMode }))
  }

  return {
    div1Even: update({ rating: 1500, opponent: 1500, isWin: false, crossMode, division: 1 }),
    div2Even: update({ rating: 1500, opponent: 1500, isWin: false, crossMode, division: 2 }),
    div1VsDiv2: update({
      rating: 1500,
      opponent: 1500,
      isWin: false,
      crossMode,
      division: 1,
      opponentDivision: 2,
    }),
    div2VsDiv1: update({
      rating: 1500,
      opponent: 1500,
      isWin: false,
      crossMode,
      division: 2,
      opponentDivision: 1,
    }),
    winValues: [...winValues].sort((left, right) => left - right),
  }
}

export interface CrossModeDivergence {
  /** 두 해석이 다른 값을 내는 경기 수 */
  differing: number
  scanned: number
  /** 가장 크게 벌어진 차이 (점) */
  maxDifference: number
  /** 예시 — [본인 래더, 상대 평균, P-A 값, P-B 값] */
  samples: [number, number, number, number][]
}

/**
 * P-A와 P-B를 **관측만으로 구분할 수 있는가**.
 *
 * 두 해석은 스펙 §8의 앵커(-12 / -15 / -7)를 **똑같이** 재현한다.
 * 차이는 교차 division **승리**에서만, 그것도 반올림 경계에서만 나온다.
 * 이 프로브가 "그 차이가 얼마나 드문가"를 센다 — 드물수록 실제 표본 없이는 고를 수 없다.
 */
export function crossModeDivergence(): CrossModeDivergence {
  let differing = 0
  let scanned = 0
  let maxDifference = 0
  const samples: [number, number, number, number][] = []

  for (let rating = 1000; rating <= 4000; rating += 25) {
    for (let opponent = 1000; opponent <= 4000; opponent += 25) {
      scanned += 1
      const a = update({
        rating,
        opponent,
        isWin: true,
        crossMode: 'k',
        division: 1,
        opponentDivision: 2,
      })
      const b = update({
        rating,
        opponent,
        isWin: true,
        crossMode: 'final',
        division: 1,
        opponentDivision: 2,
      })
      if (a !== b) {
        differing += 1
        maxDifference = Math.max(maxDifference, Math.abs(a - b))
        if (samples.length < 5) samples.push([rating, opponent, a, b])
      }
    }
  }

  return { differing, scanned, maxDifference, samples }
}

/* ------------------------------------------------------------ 1. 업셋 --- */

export interface UpsetResult {
  /** 약자가 이겼을 때 얻는 점수 */
  underdogWin: number
  /** 강자가 이겼을 때 얻는 점수 */
  favoriteWin: number
  /** 강자가 졌을 때 잃는 점수 */
  favoriteLoss: number
  /** 약자가 졌을 때 잃는 점수 */
  underdogLoss: number
}

/**
 * 업셋이 제대로 보상되는가.
 *
 * Elo 계열이면 **약자의 승리 > 강자의 승리**, **강자의 패배 > 약자의 패배**여야 한다.
 * 그렇지 않으면 강자는 지는 것이 이득이 되고, 승부조작 유인이 생긴다.
 */
export function upsetProbe(
  crossMode: CrossMode,
  underdog = 1200,
  favorite = 2600,
): UpsetResult {
  return {
    underdogWin: update({ rating: underdog, opponent: favorite, isWin: true, crossMode }),
    favoriteWin: update({ rating: favorite, opponent: underdog, isWin: true, crossMode }),
    favoriteLoss: update({ rating: favorite, opponent: underdog, isWin: false, crossMode }),
    underdogLoss: update({ rating: underdog, opponent: favorite, isWin: false, crossMode }),
  }
}

/* -------------------------------------------------------- 2. 강팀 양학 --- */

export interface FarmingResult {
  startRating: number
  finalRating: number
  matches: number
  /** 마지막 10경기에서 얻은 평균 점수 — 0에 수렴해야 양학이 막힌 것이다 */
  tailGainPerMatch: number
  /** 한 번이라도 0점 승리가 나왔는가 */
  reachedZeroGain: boolean
}

/**
 * 약한 상대만 계속 이기면 점수가 무한히 오르는가.
 *
 * Elo는 기대승률이 1에 가까워지면 증감이 0으로 수렴한다. 그 수렴이 실제로 일어나는지,
 * 그리고 **얼마나 높이 올라가고 나서** 멈추는지를 본다.
 */
export function farmingProbe(
  crossMode: CrossMode,
  input: { startRating?: number; victimRating?: number; matches?: number } = {},
): FarmingResult {
  const startRating = input.startRating ?? 1800
  const victimRating = input.victimRating ?? 1000
  const matches = input.matches ?? 300

  let rating = startRating
  let reachedZeroGain = false
  const gains: number[] = []

  for (let index = 0; index < matches; index += 1) {
    const delta = update({ rating, opponent: victimRating, isWin: true, crossMode })
    if (delta === 0) reachedZeroGain = true
    rating += delta
    gains.push(delta)
  }

  const tail = gains.slice(-10)
  return {
    startRating,
    finalRating: rating,
    matches,
    tailGainPerMatch: tail.reduce((sum, value) => sum + value, 0) / tail.length,
    reachedZeroGain,
  }
}

/* -------------------------------------------------------- 3. 신규 유저 --- */

export interface NewcomerResult {
  /** 목표 래더에 도달하기까지 걸린 경기 수 (-1이면 도달 못함) */
  matchesToTarget: number
  finalRating: number
  trueSkillRating: number
}

/**
 * 실력이 좋은 신규 유저가 제자리를 찾는 데 몇 경기가 필요한가.
 *
 * 너무 오래 걸리면 신규 유저가 상위권에 영원히 닿지 못하고, 대신 **부계정**이 생긴다.
 */
export function newcomerProbe(
  crossMode: CrossMode,
  input: {
    seed?: number
    startRating?: number
    trueSkillRating?: number
    opponentRating?: number
    matches?: number
    placementMatches?: number
  } = {},
): NewcomerResult {
  const rng = createRng(input.seed ?? 7)
  const startRating = input.startRating ?? 1500
  const trueSkillRating = input.trueSkillRating ?? 2600
  const opponentRating = input.opponentRating ?? 1900
  const matches = input.matches ?? 400
  const placementMatches = input.placementMatches ?? 10

  let rating = startRating
  let matchesToTarget = -1

  // 실제 실력이 2600인 사람이 1900 상대와 붙을 때의 승률 (Elo 기대승률과 같은 형태)
  const winChance = 1 / (1 + 10 ** ((opponentRating - trueSkillRating) / 400))

  for (let index = 0; index < matches; index += 1) {
    const isWin = rng() < winChance
    if (index >= placementMatches) {
      rating += update({ rating, opponent: opponentRating, isWin, crossMode })
    }
    if (matchesToTarget < 0 && rating >= trueSkillRating - 100) matchesToTarget = index + 1
  }

  return { matchesToTarget, finalRating: rating, trueSkillRating }
}

/* ------------------------------------------------------ 4. 장기 미접속 --- */

export interface InactivityResult {
  /** 쉬는 동안 점수가 변하는가 (스펙에 감쇠 규칙이 없으므로 0이어야 한다) */
  ratingDrift: number
  /** 그동안 활동한 사람들의 평균 상승폭 — 상대적으로 밀리는 정도 */
  activeGain: number
}

/**
 * 오래 쉬면 어떻게 되는가.
 *
 * 스펙에는 **감쇠(decay) 규칙이 없다.** 점수는 그대로 남는다.
 * 문제는 절대값이 아니라 **상대 순위**다. 활동자들이 점수를 벌면 쉬는 사람은 밀린다.
 * 이것을 "정상"으로 볼지 "유령 상위권"으로 볼지는 **정책 결정**이다.
 */
export function inactivityProbe(
  crossMode: CrossMode,
  input: { seed?: number; rating?: number; matches?: number } = {},
): InactivityResult {
  const rng = createRng(input.seed ?? 11)
  const rating = input.rating ?? 2000
  const matches = input.matches ?? 200

  // 쉬는 사람: 경기를 하지 않으므로 공식이 호출되지 않는다
  const idleRating = rating

  // 활동자: 같은 실력끼리 계속 붙는다 (승률 50%)
  let activeRating = rating
  for (let index = 0; index < matches; index += 1) {
    const isWin = rng() < 0.5
    activeRating += update({ rating: activeRating, opponent: rating, isWin, crossMode })
  }

  return { ratingDrift: idleRating - rating, activeGain: activeRating - rating }
}

/* ------------------------------------------------------------ 5. 이적 --- */

export interface TransferResult {
  candidate: ClanLadderCandidate
  before: number
  afterTransfer: number
  /** 이적 직후 클랜 점수가 바로 반응하는가 */
  immediateResponse: boolean
}

/**
 * 에이스가 이적하면 클랜 점수는 어떻게 되는가.
 *
 * 후보마다 답이 완전히 다르다. **이것이 클랜 래더 후보를 가르는 가장 큰 지점이다.**
 */
export function transferProbe(
  candidate: ClanLadderCandidate,
  input: { clanRating?: number; roster?: number[]; leaving?: number; topN?: number } = {},
): TransferResult {
  const clanRating = input.clanRating ?? 1700
  const roster = input.roster ?? [2400, 1900, 1850, 1800, 1750, 1700]
  const leaving = input.leaving ?? 2400
  const topN = input.topN ?? 5

  const before =
    candidate === 'roster-strength'
      ? clanRatingRosterStrength(roster, topN, clanRating)
      : clanRating

  const remaining = roster.filter((rating) => rating !== leaving)
  const afterTransfer =
    candidate === 'roster-strength'
      ? clanRatingRosterStrength(remaining, topN, clanRating)
      : clanRating // team-elo · member-mean 은 다음 경기 전까지 그대로다

  return {
    candidate,
    before,
    afterTransfer,
    immediateResponse: before !== afterTransfer,
  }
}

/* -------------------------------------------------- 6. 라인업 조작 --- */

export interface LineupResult {
  candidate: ClanLadderCandidate
  /** 약한 선수 5명을 내보내고 이겼을 때 클랜이 얻는 점수 */
  weakestLineupGain: number
  /** 강한 선수 5명을 내보내고 이겼을 때 */
  strongestLineupGain: number
  /** 약한 라인업이 더 이득인가 = 조작 유인이 있는가 */
  exploitable: boolean
}

/**
 * 일부러 낮은 래더 선수만 내보내면 이득인가.
 *
 * 개인 래더는 Elo라 낮은 래더로 이기면 더 많이 오른다 — 그것 자체는 정상이다.
 * 문제는 **클랜 래더가 그 값을 그대로 받을 때**다. 약한 라인업이 클랜 점수에 유리해지면
 * 클랜은 이길 수 있는 최소 전력을 내보내는 것이 최적 전략이 된다.
 */
export function lineupProbe(
  candidate: ClanLadderCandidate,
  crossMode: CrossMode,
  input: { clanRating?: number; opponentClanRating?: number; roster?: number[] } = {},
): LineupResult {
  const clanRating = input.clanRating ?? 1600
  const opponentClanRating = input.opponentClanRating ?? 1600
  const roster = input.roster ?? [2400, 2300, 2200, 2100, 2000, 1400, 1350, 1300, 1250, 1200]

  const sorted = [...roster].sort((left, right) => left - right)
  const weakest = sorted.slice(0, 5)
  const strongest = sorted.slice(-5)

  const gainFor = (squad: number[]): number => {
    const squadAvg = squad.reduce((sum, value) => sum + value, 0) / squad.length
    const opponentAvg = opponentClanRating
    const memberUpdates = squad.map((rating) =>
      update({ rating, opponent: opponentAvg, isWin: true, crossMode }),
    )

    if (candidate === 'member-mean') {
      return clanDeltaMemberMean({
        clanRating,
        opponentClanRating,
        isWin: true,
        params: DIV1,
        crossMode,
        memberUpdates,
        rosterRatings: roster,
        rosterTopN: 5,
      })
    }
    if (candidate === 'team-elo') {
      // 클랜 점수만 보므로 라인업과 무관하다
      return clanDeltaTeamElo({
        clanRating,
        opponentClanRating,
        isWin: true,
        params: DIV1,
        crossMode,
        memberUpdates,
        rosterRatings: roster,
        rosterTopN: 5,
      })
    }
    // roster-strength: 라인업이 아니라 로스터 전체로 정해진다. 경기 결과와 무관
    void squadAvg
    return clanRatingRosterStrength(roster, 5, clanRating) - clanRating
  }

  const weakestLineupGain = gainFor(weakest)
  const strongestLineupGain = gainFor(strongest)

  return {
    candidate,
    weakestLineupGain,
    strongestLineupGain,
    exploitable: weakestLineupGain > strongestLineupGain,
  }
}

/* -------------------------------------------------------- 7. 반복 대전 --- */

export interface RepeatResult {
  matches: number
  finalGap: number
  /** 두 클랜 점수 차의 분포 — 계속 벌어지면 문제다 */
  gapDistribution: Distribution
}

/**
 * 같은 두 팀만 계속 붙으면 점수가 발산하는가.
 *
 * 실력이 같다면 점수 차는 0 근처에서 진동해야 한다. 한쪽으로 계속 벌어지면
 * "짜고 하는 반복 대전"으로 점수를 만들 수 있다는 뜻이다.
 */
export function repeatMatchProbe(
  crossMode: CrossMode,
  input: { seed?: number; matches?: number; rating?: number } = {},
): RepeatResult {
  const rng = createRng(input.seed ?? 13)
  const matches = input.matches ?? 500
  let a = input.rating ?? 1600
  let b = input.rating ?? 1600
  const gaps: number[] = []

  for (let index = 0; index < matches; index += 1) {
    const aWins = rng() < 0.5
    const deltaA = update({ rating: a, opponent: b, isWin: aWins, crossMode })
    const deltaB = update({ rating: b, opponent: a, isWin: !aWins, crossMode })
    a += deltaA
    b += deltaB
    gaps.push(Math.abs(a - b))
  }

  return { matches, finalGap: Math.abs(a - b), gapDistribution: describe(gaps) }
}

/* ------------------------------------------------------ 8. 승률 왜곡 --- */

export interface WinRateDistortionResult {
  /** 약체만 골라 90% 승률을 만든 쪽 */
  farmerRating: number
  farmerWinRate: number
  /** 강자와 붙어 55% 승률을 낸 쪽 */
  contenderRating: number
  contenderWinRate: number
  /** 승률이 높은 쪽이 래더도 높은가 (true면 승률 왜곡이 통한 것이다) */
  farmerRanksHigher: boolean
}

/**
 * "승률이 높은 사람이 더 높은 래더"가 되면 안 된다.
 *
 * 약한 상대만 골라 90%를 만든 사람과, 강한 상대와 붙어 55%를 낸 사람 중
 * **뒤쪽이 더 높아야** 래더가 승률 왜곡에 견디는 것이다.
 */
export function winRateDistortionProbe(
  crossMode: CrossMode,
  input: { seed?: number; matches?: number } = {},
): WinRateDistortionResult {
  const rng = createRng(input.seed ?? 17)
  const matches = input.matches ?? 300

  let farmer = 1500
  let farmerWins = 0
  let contender = 1500
  let contenderWins = 0

  for (let index = 0; index < matches; index += 1) {
    const farmerWon = rng() < 0.9
    if (farmerWon) farmerWins += 1
    farmer += update({ rating: farmer, opponent: 1100, isWin: farmerWon, crossMode })

    const contenderWon = rng() < 0.55
    if (contenderWon) contenderWins += 1
    contender += update({ rating: contender, opponent: 2500, isWin: contenderWon, crossMode })
  }

  return {
    farmerRating: farmer,
    farmerWinRate: farmerWins / matches,
    contenderRating: contender,
    contenderWinRate: contenderWins / matches,
    farmerRanksHigher: farmer > contender,
  }
}
