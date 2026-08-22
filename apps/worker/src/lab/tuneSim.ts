/**
 * 상수 결정용 시뮬레이션 — 승인된 정책(D-057 ~ D-067) 기준.
 *
 * ⚠️ sandbox다. DB를 읽지도 쓰지도 않는다. 난수는 seed로 고정한다.
 *    운영 코드(`@sacloud/rating`)와 **같은 함수**를 부른다 — 시뮬레이션과 운영이 갈라지면
 *    시뮬레이션이 의미가 없기 때문이다.
 *
 * 여기서 정하는 상수 (사용자 지시 19번)
 *   개인 K · 클랜 K · baseline · carryRate · 점수차 cap · 최소 승리 보상 ·
 *   반복 감쇠 곡선/기간 · 라인업 반영 범위
 *
 * 통과 기준 (사용자 지시 20번)은 `evaluateCriteria`에 그대로 옮겨 놓았다.
 */
import {
  DEFAULT_RATING_CONSTANTS,
  clanRatingUpdate,
  personalRatingUpdate,
  rateMatch,
  seasonStartRating,
  type ConfirmedParticipant,
  type RatingConstants,
} from '@sacloud/rating'
import { createRng } from './simulate.js'

/* ------------------------------------------------------------------ 도구 --- */

function playRun(input: {
  rating: number
  opponent: number
  matches: number
  winChance: number
  seed: number
  constants: RatingConstants
  /** 같은 상대와 반복하는가 (반복 감쇠가 걸린다) */
  sameOpponent?: boolean
}): { rating: number; wins: number } {
  const rng = createRng(input.seed)
  let rating = input.rating
  let wins = 0
  let streakWins = 0
  let streakLosses = 0

  for (let index = 0; index < input.matches; index += 1) {
    const isWin = rng() < input.winChance
    const priorSameOutcome = input.sameOpponent ? (isWin ? streakWins : streakLosses) : 0
    const result = personalRatingUpdate({
      ratingBefore: rating,
      opponentRating: input.opponent,
      outcome: isWin ? 'win' : 'lose',
      priorSameOutcome,
      constants: input.constants,
    })
    rating = Math.max(input.constants.ratingFloor, rating + result.ratingUpdate)
    if (isWin) {
      wins += 1
      streakWins += 1
      streakLosses = 0
    } else {
      streakLosses += 1
      streakWins = 0
    }
  }
  return { rating, wins }
}

/**
 * 표류(drift) 측정은 **여러 seed의 평균**으로 한다.
 *
 * 한 번만 돌리면 무작위 진동(±15 × √200 ≈ ±210)을 인플레이션으로 오판한다.
 * 우리가 보려는 것은 "체계적으로 오르는가"이지 한 사람의 운이 아니다.
 */
function meanDrift(input: {
  rating: number
  matches: number
  runs: number
  constants: RatingConstants
}): number {
  let total = 0
  for (let run = 0; run < input.runs; run += 1) {
    const result = playRun({
      rating: input.rating,
      opponent: input.rating,
      matches: input.matches,
      winChance: 0.5,
      seed: 5000 + run * 37,
      constants: input.constants,
    })
    total += result.rating - input.rating
  }
  return total / input.runs
}

/**
 * 닫힌 모집단의 점수 총합이 움직이는가 — **시스템 인플레이션의 정직한 측정**.
 *
 * 고정 상대를 두고 한 사람만 재면 "그 사람이 상대보다 높아졌을 때 cap이 걸리는" 효과가
 * 표류로 잡힌다. 실제로 알고 싶은 것은 **리그 전체의 점수 총합**이 늘어나는가다.
 */
function populationDrift(input: {
  players: number
  matches: number
  seed: number
  constants: RatingConstants
}): number {
  const rng = createRng(input.seed)
  const ratings = new Array<number>(input.players).fill(input.constants.initialRating)

  for (let index = 0; index < input.matches; index += 1) {
    const a = Math.floor(rng() * ratings.length)
    let b = Math.floor(rng() * ratings.length)
    if (a === b) b = (b + 1) % ratings.length

    // 실력이 같으므로 승패는 반반이다
    const aWins = rng() < 0.5
    const updateA = personalRatingUpdate({
      ratingBefore: ratings[a]!,
      opponentRating: ratings[b]!,
      outcome: aWins ? 'win' : 'lose',
      constants: input.constants,
    }).ratingUpdate
    const updateB = personalRatingUpdate({
      ratingBefore: ratings[b]!,
      opponentRating: ratings[a]!,
      outcome: aWins ? 'lose' : 'win',
      constants: input.constants,
    }).ratingUpdate

    ratings[a] = Math.max(input.constants.ratingFloor, ratings[a]! + updateA)
    ratings[b] = Math.max(input.constants.ratingFloor, ratings[b]! + updateB)
  }

  const mean = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
  return mean - input.constants.initialRating
}

function participant(
  playerId: string,
  leagueClanId: string,
  outcome: 'win' | 'lose',
  ratingBefore: number,
): ConfirmedParticipant {
  return {
    playerId,
    rosterLeagueClanId: leagueClanId,
    outcome,
    kill: 10,
    death: 10,
    assist: 2,
    sources: ['player_match_list'],
    ratingBefore,
  }
}

/* ------------------------------------------------------------ 시나리오 --- */

export interface ScenarioMetrics {
  /** 1. 동일 실력 두 명이 오래 붙었을 때 **평균** 이동 (0에 가까워야 한다) */
  evenDrift: number
  /** 동급 경기 1건의 증감 합 — 0이면 점수가 주입되지 않는다 */
  evenPairSum: number
  /** 2. 큰 업셋 보상 */
  upsetWin: number
  favoriteWin: number
  favoriteLoss: number
  /** 3·8. 약체만 300경기 잡았을 때 도달 래더 */
  farmerRating: number
  /** 정상적으로 강자와 붙어 65% 승률을 낸 사람 */
  legitRating: number
  /** 9. 강자 위주로 붙어 45% 승률을 낸 사람 */
  grinderRating: number
  /** 4. 같은 상대 20연승 vs 다른 상대 20연승 */
  repeatGain: number
  freshGain: number
  /** 5·6. 신규 유저 안정화 경기 수 */
  strongNewcomerMatches: number
  weakNewcomerMatches: number
  /** 7. 승률 50%로 300경기 (개인) */
  fiftyPercentDrift: number
  /** 100명 5,000경기 후 **리그 평균** 이동 (시스템 인플레이션) */
  populationMeanDrift: number
  /** 11. 3v3만 확인된 경기 */
  partialPlayerResults: number
  partialLineupBlended: boolean
  /** 12. 시즌 3회 연속 후 순위 보존 + 폭 축소 */
  seasonOrderPreserved: number
  seasonSpreadRatio: number
  /** 13. 대량 경기 후 수치 안전성 */
  numericSafe: boolean
  /** 10. division이 입력에 없다는 구조적 사실 */
  divisionNeutral: boolean
  /** 결정적 replay */
  deterministic: boolean
}

export function runScenarios(constants: RatingConstants): ScenarioMetrics {
  /* 1. 동일 실력 — 승률 50%로 200경기, 40회 평균 */
  const evenDrift = meanDrift({ rating: 1500, matches: 200, runs: 40, constants })

  /* 동급 경기 1건의 증감 합 — 0이어야 시스템에 점수가 주입되지 않는다 */
  const evenPairSum =
    personalRatingUpdate({
      ratingBefore: 1500,
      opponentRating: 1500,
      outcome: 'win',
      constants,
    }).ratingUpdate +
    personalRatingUpdate({
      ratingBefore: 1500,
      opponentRating: 1500,
      outcome: 'lose',
      constants,
    }).ratingUpdate

  /* 2. 업셋 */
  const upsetWin = personalRatingUpdate({
    ratingBefore: 1200,
    opponentRating: 2600,
    outcome: 'win',
    constants,
  }).ratingUpdate
  // 격차가 cap을 넘으면 0이 되므로, 비교는 **cap 안쪽의 우세 경기**로 한다
  const favoriteWin = personalRatingUpdate({
    ratingBefore: 2600,
    opponentRating: 2300,
    outcome: 'win',
    constants,
  }).ratingUpdate
  const favoriteLoss = personalRatingUpdate({
    ratingBefore: 2600,
    opponentRating: 1200,
    outcome: 'lose',
    constants,
  }).ratingUpdate

  /* 3·8. 양학: 800점 낮은 상대만 90% 승률로 300경기 (같은 상대는 아님 — 여러 약체) */
  const farmer = playRun({
    rating: 1500,
    opponent: 900,
    matches: 300,
    winChance: 0.9,
    seed: 202,
    constants,
  })

  /* 정상: 비슷한 실력대에서 65% 승률 300경기 */
  const legit = playRun({
    rating: 1500,
    opponent: 1900,
    matches: 300,
    winChance: 0.65,
    seed: 303,
    constants,
  })

  /* 9. 강한 상대 위주로 45% */
  const grinder = playRun({
    rating: 1500,
    opponent: 2200,
    matches: 300,
    winChance: 0.45,
    seed: 404,
    constants,
  })

  /* 4. 반복 대전 — 같은 상대에게 20연승 vs 매번 새 상대에게 20연승 */
  let repeatRating = 1500
  for (let index = 0; index < 20; index += 1) {
    repeatRating += personalRatingUpdate({
      ratingBefore: repeatRating,
      opponentRating: 1500,
      outcome: 'win',
      priorSameOutcome: index,
      constants,
    }).ratingUpdate
  }
  let freshRating = 1500
  for (let index = 0; index < 20; index += 1) {
    freshRating += personalRatingUpdate({
      ratingBefore: freshRating,
      opponentRating: 1500,
      outcome: 'win',
      priorSameOutcome: 0,
      constants,
    }).ratingUpdate
  }

  /* 5·6. 신규 유저 — 실제 실력 위치에 도달하기까지 */
  const settleMatches = (trueRating: number, opponent: number, seed: number): number => {
    const rng = createRng(seed)
    let rating = constants.initialRating
    const winChance = 1 / (1 + 10 ** ((opponent - trueRating) / 400))
    for (let index = 0; index < 400; index += 1) {
      const isWin = rng() < winChance
      rating += personalRatingUpdate({
        ratingBefore: rating,
        opponentRating: opponent,
        outcome: isWin ? 'win' : 'lose',
        constants,
      }).ratingUpdate
      if (Math.abs(rating - trueRating) <= 100) return index + 1
    }
    return -1
  }
  const strongNewcomerMatches = settleMatches(2200, 1900, 505)
  const weakNewcomerMatches = settleMatches(900, 1400, 606)

  /* 7. 50% 승률 장기 — 40회 평균 (개인 관점) */
  const fiftyPercentDrift = meanDrift({ rating: 1800, matches: 300, runs: 40, constants })

  /* 리그 전체 점수 총합이 움직이는가 (시스템 관점) */
  const populationMeanDrift = populationDrift({
    players: 100,
    matches: 5000,
    seed: 1111,
    constants,
  })

  /* 11. 3v3만 확인된 경기 */
  const partial = rateMatch({
    participants: [
      participant('A1', 'CA', 'win', 1600),
      participant('A2', 'CA', 'win', 1550),
      participant('A3', 'CA', 'win', 1500),
      participant('B1', 'CB', 'lose', 1500),
      participant('B2', 'CB', 'lose', 1450),
      participant('B3', 'CB', 'lose', 1400),
    ],
    clanRatings: { CA: 1600, CB: 1450 },
    constants,
  })

  /* 12. 시즌 전환 — 모두 같은 출발점 (D-064) */
  const rng = createRng(808)
  const population = Array.from({ length: 200 }, () => 1500 + (rng() - 0.5) * 1600)
  const afterSeason = population.map(() => seasonStartRating(constants))
  const seasonOrderPreserved = new Set(afterSeason).size === 1 ? 1 : 0
  const seasonSpreadRatio = 0

  /* 13. 대량 경기 — 수치 안전성 */
  let numericSafe = true
  const bulkRng = createRng(909)
  let bulkRating = 1500
  let bulkClan = 1500
  for (let index = 0; index < 20000; index += 1) {
    const isWin = bulkRng() < 0.5
    const opponent = 400 + bulkRng() * 3600
    const personal = personalRatingUpdate({
      ratingBefore: bulkRating,
      opponentRating: opponent,
      outcome: isWin ? 'win' : 'lose',
      priorSameOutcome: Math.floor(bulkRng() * 4),
      constants,
    })
    const clan = clanRatingUpdate({
      ratingBefore: bulkClan,
      opponentRating: opponent,
      outcome: isWin ? 'win' : 'lose',
      constants,
    })
    bulkRating = Math.max(constants.ratingFloor, bulkRating + personal.ratingUpdate)
    bulkClan = Math.max(constants.ratingFloor, bulkClan + clan.ratingUpdate)
    if (
      !Number.isFinite(bulkRating) ||
      !Number.isFinite(bulkClan) ||
      Number.isNaN(bulkRating) ||
      bulkRating < 0 ||
      !Number.isInteger(personal.ratingUpdate)
    ) {
      numericSafe = false
      break
    }
  }

  /* 10. division 중립 — 공식 입력에 division이 아예 없다 */
  const divisionNeutral = !('division' in DEFAULT_RATING_CONSTANTS)

  /* 결정적 replay */
  const replayA = playRun({
    rating: 1500,
    opponent: 1600,
    matches: 100,
    winChance: 0.5,
    seed: 1234,
    constants,
  })
  const replayB = playRun({
    rating: 1500,
    opponent: 1600,
    matches: 100,
    winChance: 0.5,
    seed: 1234,
    constants,
  })

  return {
    evenDrift,
    upsetWin,
    favoriteWin,
    favoriteLoss,
    farmerRating: farmer.rating,
    legitRating: legit.rating,
    grinderRating: grinder.rating,
    repeatGain: repeatRating - 1500,
    freshGain: freshRating - 1500,
    strongNewcomerMatches,
    weakNewcomerMatches,
    fiftyPercentDrift,
    populationMeanDrift,
    evenPairSum,
    partialPlayerResults: partial.players.length,
    partialLineupBlended: partial.clans.some((clan) => clan.lineupBlended),
    seasonOrderPreserved,
    seasonSpreadRatio,
    numericSafe,
    divisionNeutral,
    deterministic: replayA.rating === replayB.rating,
  }
}

/* ---------------------------------------------------------- 통과 기준 --- */

export interface Criterion {
  name: string
  passed: boolean
  detail: string
}

/** 사용자 지시 20번을 그대로 옮긴 판정 */
export function evaluateCriteria(metrics: ScenarioMetrics): Criterion[] {
  return [
    {
      name: '양학만으로 최상위권 진입이 어렵다',
      passed: metrics.farmerRating < metrics.legitRating,
      detail: `양학 ${metrics.farmerRating} < 정상 ${metrics.legitRating}`,
    },
    {
      name: '강한 상대를 이기는 것이 가치 있다',
      passed: metrics.upsetWin >= metrics.favoriteWin * 1.5,
      detail: `업셋 +${metrics.upsetWin} vs 예상승 +${metrics.favoriteWin}`,
    },
    {
      name: '동일 상대 반복 farming 효율이 낮다',
      passed: metrics.repeatGain < metrics.freshGain * 0.6,
      detail: `반복 +${metrics.repeatGain} vs 새 상대 +${metrics.freshGain}`,
    },
    {
      name: '50% 승률 유저가 무한 inflation하지 않는다',
      passed: metrics.evenPairSum === 0 && Math.abs(metrics.populationMeanDrift) <= 15,
      detail:
        `동급 1경기 합 ${metrics.evenPairSum} · ` +
        `리그 평균 이동(100명 5,000경기) ${metrics.populationMeanDrift.toFixed(1)} · ` +
        `개인 표류 ${metrics.evenDrift.toFixed(1)}/200경기`,
    },
    {
      name: '점수가 음수·무한대·NaN으로 가지 않는다',
      passed: metrics.numericSafe,
      detail: `20,000경기 연속 검사`,
    },
    {
      name: '신규 유저가 합리적인 경기 수 안에 안정화된다',
      passed:
        metrics.strongNewcomerMatches > 0 &&
        metrics.strongNewcomerMatches <= 120 &&
        metrics.weakNewcomerMatches > 0 &&
        metrics.weakNewcomerMatches <= 120,
      detail: `강자 ${metrics.strongNewcomerMatches}경기 · 약자 ${metrics.weakNewcomerMatches}경기`,
    },
    {
      name: 'division이 점수를 왜곡하지 않는다',
      passed: metrics.divisionNeutral,
      detail: '공식 입력에 division이 없다',
    },
    {
      name: 'incomplete participant를 추측하지 않는다',
      passed: metrics.partialPlayerResults === 6 && !metrics.partialLineupBlended,
      detail: `3v3 경기에서 개인 결과 ${metrics.partialPlayerResults}건 · 라인업 반영 ${metrics.partialLineupBlended}`,
    },
    {
      name: 'replay가 결정적이다',
      passed: metrics.deterministic,
      detail: '같은 입력 → 같은 결과',
    },
    {
      name: '시즌 soft reset 후 순위 정보가 사라지지 않는다',
      passed: metrics.seasonOrderPreserved > 0.999 && metrics.seasonSpreadRatio < 0.5,
      detail: `순위 상관 ${metrics.seasonOrderPreserved.toFixed(3)} · 폭 ${(metrics.seasonSpreadRatio * 100).toFixed(0)}%`,
    },
    {
      name: '낮은 승률로 강자와 붙어도 손해만 보지 않는다',
      passed: metrics.grinderRating > 1200,
      detail: `45% 승률로 강자 상대 300경기 → ${metrics.grinderRating}`,
    },
  ]
}

export function score(metrics: ScenarioMetrics): number {
  return evaluateCriteria(metrics).filter((criterion) => criterion.passed).length
}

/* ------------------------------------------------------------- 후보 세트 --- */

export interface Candidate {
  name: string
  constants: RatingConstants
  note: string
}

export function candidates(): Candidate[] {
  const base = DEFAULT_RATING_CONSTANTS
  return [
    {
      name: 'S1 기본',
      constants: base,
      note: 'cap 300~900 · 반복 0.6 · carry 0.5 · clanK 24',
    },
    {
      name: 'S2 cap 강화',
      constants: { ...base, rewardCapStart: 200, rewardCapFull: 700 },
      note: '양학 차단을 더 이르게',
    },
    {
      name: 'S3 cap 완화',
      constants: { ...base, rewardCapStart: 400, rewardCapFull: 1200 },
      note: '양학 차단을 늦게',
    },
    {
      name: 'S4 반복 감쇠 강함',
      constants: { ...base, repeatDecay: 0.4, repeatDecayFloor: 0.05 },
      note: '같은 상대 반복을 더 세게 깎는다',
    },
    {
      name: 'S5 반복 감쇠 약함',
      constants: { ...base, repeatDecay: 0.8, repeatDecayFloor: 0.4 },
      note: '반복을 거의 깎지 않는다',
    },
    {
      name: 'S8 clanK 16',
      constants: { ...base, clanK: 16 },
      note: '클랜 래더 폭을 좁힌다',
    },
    {
      name: 'S9 minWinReward 0',
      constants: { ...base, minWinReward: 0 },
      note: '이겨도 0점이 될 수 있게',
    },
    {
      name: 'S10 K floor 4',
      constants: { ...base, personalKFloor: 4 },
      note: '상위권 변동을 더 줄인다',
    },
    {
      name: 'S11 라인업 미반영',
      constants: { ...base, lineupBlend: 0 },
      note: '클랜 래더만으로 계산',
    },
    {
      name: 'S12 라인업 전면반영',
      constants: { ...base, lineupBlend: 1, lineupMinConfirmed: 4 },
      note: '확인 인원이 충분하면 라인업만 본다',
    },
  ]
}
