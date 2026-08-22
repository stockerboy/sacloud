/**
 * 파라미터별 변별 지표 (sandbox).
 *
 * 통과 기준(20번)은 후보 12개가 전부 통과한다 — 그것만으로는 **고를 수 없다.**
 * 그래서 상수마다 "그 상수가 실제로 조절하는 것"을 따로 잰다.
 *
 *   clanK          → 클랜 래더 폭 (관측 987~1,840 ≈ 850)
 *   rewardCap      → 양학 마진 (정상 - 양학)
 *   repeatDecay    → 반복 억제율
 *   carryRate      → 시즌 폭 축소 vs 순위 보존
 *   lineupBlend    → 클랜 래더가 **실제 출전 전력**을 얼마나 따라가는가
 */
import {
  DEFAULT_RATING_CONSTANTS,
  clanRatingUpdate,
  personalRatingUpdate,
  rateMatch,
  seasonSoftReset,
  type ConfirmedParticipant,
  type RatingConstants,
} from '@sacloud/rating'
import { createRng, spearman } from './simulate.js'

/** 클랜 래더 폭 — 관측(약 850)에 가까울수록 좋다 */
export function clanSpread(constants: RatingConstants): {
  spread: number
  correlation: number
  min: number
  max: number
} {
  const rng = createRng(2026)
  const clans = 30
  const strength = Array.from({ length: clans }, () => 1200 + rng() * 1200)
  const ratings = new Array<number>(clans).fill(constants.initialRating)

  for (let index = 0; index < 6000; index += 1) {
    const a = Math.floor(rng() * clans)
    let b = Math.floor(rng() * clans)
    if (a === b) b = (b + 1) % clans

    const aWins = rng() < 1 / (1 + 10 ** ((strength[b]! - strength[a]!) / 400))
    const updateA = clanRatingUpdate({
      ratingBefore: ratings[a]!,
      opponentRating: ratings[b]!,
      outcome: aWins ? 'win' : 'lose',
      constants,
    }).ratingUpdate
    const updateB = clanRatingUpdate({
      ratingBefore: ratings[b]!,
      opponentRating: ratings[a]!,
      outcome: aWins ? 'lose' : 'win',
      constants,
    }).ratingUpdate
    ratings[a] = Math.max(constants.ratingFloor, ratings[a]! + updateA)
    ratings[b] = Math.max(constants.ratingFloor, ratings[b]! + updateB)
  }

  return {
    spread: Math.max(...ratings) - Math.min(...ratings),
    correlation: spearman(strength, ratings),
    min: Math.min(...ratings),
    max: Math.max(...ratings),
  }
}

/** 양학 마진 — 정상 경로가 양학보다 얼마나 앞서는가 (클수록 좋다) */
export function farmMargin(constants: RatingConstants): number {
  const play = (opponent: number, winChance: number, seed: number): number => {
    const rng = createRng(seed)
    let rating = constants.initialRating
    for (let index = 0; index < 300; index += 1) {
      const isWin = rng() < winChance
      rating += personalRatingUpdate({
        ratingBefore: rating,
        opponentRating: opponent,
        outcome: isWin ? 'win' : 'lose',
        constants,
      }).ratingUpdate
    }
    return rating
  }
  return play(1900, 0.65, 303) - play(900, 0.9, 202)
}

/** 시즌 soft reset — 폭 축소율과 순위 보존 */
export function seasonBehaviour(constants: RatingConstants): {
  spreadRatio: number
  order: number
} {
  const rng = createRng(4242)
  const before = Array.from({ length: 300 }, () => 1500 + (rng() - 0.5) * 2000)
  const after = before.map((rating) => seasonSoftReset(rating, constants))
  const spreadBefore = Math.max(...before) - Math.min(...before)
  const spreadAfter = Math.max(...after) - Math.min(...after)
  return { spreadRatio: spreadAfter / spreadBefore, order: spearman(before, after) }
}

function member(
  playerId: string,
  leagueClanId: string,
  outcome: 'win' | 'lose',
  ratingBefore: number,
): ConfirmedParticipant {
  return {
    playerId,
    leagueClanId,
    outcome,
    kill: 10,
    death: 10,
    assist: 2,
    sources: ['player_match_list'],
    ratingBefore,
  }
}

/**
 * 라인업 반영이 실제로 도움이 되는가.
 *
 * 클랜마다 로스터 실력이 다르고, 경기마다 **주전/후보**를 섞어 내보낸다.
 * 클랜 래더가 "그 클랜의 진짜 전력"을 얼마나 잘 따라가는지 상관으로 잰다.
 */
export function lineupTracking(constants: RatingConstants): {
  correlation: number
  blendedRatio: number
} {
  const rng = createRng(777)
  const clans = 16
  const squad = 5
  const trueStrength = Array.from({ length: clans }, () => 1100 + rng() * 1400)
  // 선수 개인 래더는 클랜 전력 근처에 흩어져 있다
  const rosters = trueStrength.map((strength) =>
    Array.from({ length: 8 }, () => Math.round(strength + (rng() - 0.5) * 500)),
  )
  const clanRatings = new Array<number>(clans).fill(constants.initialRating)
  let blended = 0
  let total = 0

  for (let index = 0; index < 4000; index += 1) {
    const a = Math.floor(rng() * clans)
    let b = Math.floor(rng() * clans)
    if (a === b) b = (b + 1) % clans

    // 라인업은 매번 다르다 — 주전이 빠지기도 한다
    const pick = (clan: number): number[] => {
      const pool = [...rosters[clan]!].sort(() => rng() - 0.5)
      return pool.slice(0, squad)
    }
    const lineupA = pick(a)
    const lineupB = pick(b)
    const meanOf = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length

    // 승패는 **실제 출전 라인업**의 평균으로 정해진다
    const aWins = rng() < 1 / (1 + 10 ** ((meanOf(lineupB) - meanOf(lineupA)) / 400))

    // 확인 인원: 대부분 5명, 가끔 3~4명만 확인된다
    const confirmedA = rng() < 0.7 ? squad : 3 + Math.floor(rng() * 2)
    const confirmedB = rng() < 0.7 ? squad : 3 + Math.floor(rng() * 2)

    const participants: ConfirmedParticipant[] = [
      ...lineupA
        .slice(0, confirmedA)
        .map((rating, slot) => member(`A${slot}`, `C${a}`, aWins ? 'win' : 'lose', rating)),
      ...lineupB
        .slice(0, confirmedB)
        .map((rating, slot) => member(`B${slot}`, `C${b}`, aWins ? 'lose' : 'win', rating)),
    ]

    const result = rateMatch({
      participants,
      clanRatings: { [`C${a}`]: clanRatings[a]!, [`C${b}`]: clanRatings[b]! },
      constants,
    })
    if (!result.eligibility.eligible) continue

    total += 1
    if (result.clans.some((clan) => clan.lineupBlended)) blended += 1
    for (const clan of result.clans) {
      const index2 = Number(clan.leagueClanId.slice(1))
      clanRatings[index2] = clan.ratingAfter
    }
  }

  return {
    correlation: spearman(trueStrength, clanRatings),
    blendedRatio: total === 0 ? 0 : blended / total,
  }
}

/** 반복 억제율 — 1에 가까울수록 반복 farming이 무의미하다 */
export function repeatSuppression(constants: RatingConstants): number {
  let repeat = constants.initialRating
  for (let index = 0; index < 20; index += 1) {
    repeat += personalRatingUpdate({
      ratingBefore: repeat,
      opponentRating: 1500,
      outcome: 'win',
      priorSameOutcome: index,
      constants,
    }).ratingUpdate
  }
  let fresh = constants.initialRating
  for (let index = 0; index < 20; index += 1) {
    fresh += personalRatingUpdate({
      ratingBefore: fresh,
      opponentRating: 1500,
      outcome: 'win',
      constants,
    }).ratingUpdate
  }
  const repeatGain = repeat - constants.initialRating
  const freshGain = fresh - constants.initialRating
  return freshGain === 0 ? 0 : 1 - repeatGain / freshGain
}

export function sweep<T>(
  label: string,
  values: readonly T[],
  apply: (value: T) => Partial<RatingConstants>,
  measure: (constants: RatingConstants) => string,
): string[] {
  return values.map((value) => {
    const constants = { ...DEFAULT_RATING_CONSTANTS, ...apply(value) }
    return `  ${label}=${String(value).padEnd(6)} ${measure(constants)}`
  })
}
