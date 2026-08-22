/**
 * 수정된 정책 아래에서 D를 다시 비교한다 (sandbox).
 *
 *   pnpm --filter @sacloud/worker exec tsx src/lab/dSweep.ts
 */
import {
  DEFAULT_RATING_CONSTANTS,
  personalRatingUpdate,
  type RatingConstants,
} from '@sacloud/rating'
import { invariants } from './audit.js'
import { createRng, spearman } from './simulate.js'
import { clanSpread } from './tuneSweep.js'

function run(input: {
  opponent: number
  winChance: number
  matches: number
  seed: number
  start?: number
  constants: RatingConstants
}): number {
  const rng = createRng(input.seed)
  let rating = input.start ?? input.constants.initialRating
  for (let index = 0; index < input.matches; index += 1) {
    rating += personalRatingUpdate({
      ratingBefore: rating,
      opponentRating: input.opponent,
      outcome: rng() < input.winChance ? 'win' : 'lose',
      constants: input.constants,
    }).ratingUpdate
  }
  return Math.max(0, rating)
}

function settle(trueRating: number, opponent: number, seed: number, constants: RatingConstants): number {
  const rng = createRng(seed)
  let rating = constants.initialRating
  const chance = 1 / (1 + 10 ** ((opponent - trueRating) / 400))
  for (let index = 0; index < 400; index += 1) {
    rating += personalRatingUpdate({
      ratingBefore: rating,
      opponentRating: opponent,
      outcome: rng() < chance ? 'win' : 'lose',
      constants,
    }).ratingUpdate
    if (Math.abs(rating - trueRating) <= 100) return index + 1
  }
  return -1
}

/** 숨은 실력과 래더 순위가 얼마나 맞는가 (개인, 닫힌 모집단) */
function skillCorrelation(constants: RatingConstants): number {
  const rng = createRng(4321)
  const count = 120
  const skill = Array.from({ length: count }, () => 1200 + rng() * 1400)
  const ratings = new Array<number>(count).fill(constants.initialRating)
  for (let index = 0; index < 20000; index += 1) {
    const a = Math.floor(rng() * count)
    let b = Math.floor(rng() * count)
    if (a === b) b = (b + 1) % count
    const aWins = rng() < 1 / (1 + 10 ** ((skill[b]! - skill[a]!) / 400))
    const ua = personalRatingUpdate({
      ratingBefore: ratings[a]!,
      opponentRating: ratings[b]!,
      outcome: aWins ? 'win' : 'lose',
      constants,
    }).ratingUpdate
    const ub = personalRatingUpdate({
      ratingBefore: ratings[b]!,
      opponentRating: ratings[a]!,
      outcome: aWins ? 'lose' : 'win',
      constants,
    }).ratingUpdate
    ratings[a] = Math.max(0, ratings[a]! + ua)
    ratings[b] = Math.max(0, ratings[b]! + ub)
  }
  return spearman(skill, ratings)
}

function main(): void {
  console.info('D 재검증 — 수정된 정책(cap 600~1200 · 격차 조건부 repeat decay) 기준\n')
  console.info(
    'D      실력상관  신규안착  favorite승  underdog승  farming(90%)  정상강자(65%)  클랜폭  불변식',
  )

  for (const divisor of [400, 800, 1200, 2000, 3400]) {
    const constants = { ...DEFAULT_RATING_CONSTANTS, expectedScoreDivisor: divisor }
    const favWin = personalRatingUpdate({
      ratingBefore: 2600,
      opponentRating: 1200,
      outcome: 'win',
      constants,
    }).ratingUpdate
    const dogWin = personalRatingUpdate({
      ratingBefore: 1200,
      opponentRating: 2600,
      outcome: 'win',
      constants,
    }).ratingUpdate
    const farmer = run({ opponent: 900, winChance: 0.9, matches: 300, seed: 202, constants })
    const legit = run({ opponent: 1900, winChance: 0.65, matches: 300, seed: 303, constants })
    const failures = invariants(constants).filter((item) => !item.passed)

    console.info(
      `${String(divisor).padEnd(6)} ${skillCorrelation(constants).toFixed(3).padStart(7)} ` +
        `${String(settle(2200, 1900, 505, constants)).padStart(8)} ` +
        `${String(`+${favWin}`).padStart(10)} ${String(`+${dogWin}`).padStart(11)} ` +
        `${String(farmer).padStart(12)} ${String(legit).padStart(13)} ` +
        `${String(Math.round(clanSpread(constants).spread)).padStart(7)} ` +
        `${failures.length === 0 ? '통과' : failures.map((f) => f.name).join(',')}`,
    )
  }

  console.info('\n[repeat decay 실효성] 격차가 큰 상대에게 20연승')
  for (const decay of [1, 0.6]) {
    const constants = { ...DEFAULT_RATING_CONSTANTS, repeatDecay: decay }
    let rating = 1800
    for (let index = 0; index < 20; index += 1) {
      rating += personalRatingUpdate({
        ratingBefore: rating,
        opponentRating: 900,
        outcome: 'win',
        priorSameOutcome: index,
        constants,
      }).ratingUpdate
    }
    console.info(`  repeatDecay=${decay} → 1800 에서 ${rating}`)
  }
  console.info('\n[repeat decay 실효성] 비슷한 상대(1550)와 멸망전 20연승 — 걸리면 안 된다')
  for (const decay of [1, 0.6]) {
    const constants = { ...DEFAULT_RATING_CONSTANTS, repeatDecay: decay }
    let rating = 1600
    for (let index = 0; index < 20; index += 1) {
      rating += personalRatingUpdate({
        ratingBefore: rating,
        opponentRating: 1550,
        outcome: 'win',
        priorSameOutcome: index,
        constants,
      }).ratingUpdate
    }
    console.info(`  repeatDecay=${decay} → 1600 에서 ${rating}`)
  }
}

main()
