/**
 * Phase 9 최종 audit — 사용자 지시 17번의 시나리오 19종 + 불변식 검사 (sandbox).
 *
 *   pnpm --filter @sacloud/worker exec tsx src/lab/audit.ts
 *
 * DB를 읽지도 쓰지도 않는다. 운영과 **같은 함수**(`@sacloud/rating`)를 부른다.
 */
import {
  DEFAULT_RATING_CONSTANTS,
  clanRatingUpdate,
  evaluateEligibility,
  personalRatingUpdate,
  rateMatch,
  seasonStartRating,
  type ConfirmedParticipant,
  type RatingConstants,
} from '@sacloud/rating'
import { createRng } from './simulate.js'

const C = DEFAULT_RATING_CONSTANTS

interface Row {
  name: string
  detail: string
}

function pad(value: number | string, width = 6): string {
  return String(value).padStart(width)
}

/** 한 명의 여정을 돌린다. 승패는 seed로 고정한다 */
function run(input: {
  opponent: number
  winChance: number
  matches: number
  seed: number
  start?: number
  sameOpponent?: boolean
  constants?: RatingConstants
}): { rating: number; wins: number; minWinUpdate: number; maxLoseUpdate: number } {
  const constants = input.constants ?? C
  const rng = createRng(input.seed)
  let rating = input.start ?? constants.initialRating
  let wins = 0
  let streakWin = 0
  let streakLose = 0
  let minWinUpdate = Number.POSITIVE_INFINITY
  let maxLoseUpdate = Number.NEGATIVE_INFINITY

  for (let index = 0; index < input.matches; index += 1) {
    const isWin = rng() < input.winChance
    const prior = input.sameOpponent ? (isWin ? streakWin : streakLose) : 0
    const result = personalRatingUpdate({
      ratingBefore: rating,
      opponentRating: input.opponent,
      outcome: isWin ? 'win' : 'lose',
      priorSameOutcome: prior,
      constants,
    })
    if (isWin) {
      wins += 1
      streakWin += 1
      streakLose = 0
      minWinUpdate = Math.min(minWinUpdate, result.ratingUpdate)
    } else {
      streakLose += 1
      streakWin = 0
      maxLoseUpdate = Math.max(maxLoseUpdate, result.ratingUpdate)
    }
    rating = Math.max(constants.ratingFloor, rating + result.ratingUpdate)
  }
  return { rating, wins, minWinUpdate, maxLoseUpdate }
}

function member(
  playerId: string,
  clan: string,
  outcome: 'win' | 'lose',
  rating = 1500,
): ConfirmedParticipant {
  return {
    playerId,
    rosterLeagueClanId: clan,
    outcome,
    kill: 10,
    death: 8,
    assist: 2,
    sources: ['player_match_list'],
    ratingBefore: rating,
  }
}

function squad(prefix: string, clan: string, outcome: 'win' | 'lose', count: number) {
  return Array.from({ length: count }, (_, index) => member(`${prefix}${index}`, clan, outcome))
}

/** 기대 승률대로 이겼을 때 장기 기댓값 — 0에서 멀면 "정직한 경기가 손해"라는 뜻이다 */
function expectedValuePerMatch(rating: number, opponent: number, constants = C): number {
  const win = personalRatingUpdate({
    ratingBefore: rating,
    opponentRating: opponent,
    outcome: 'win',
    constants,
  })
  const lose = personalRatingUpdate({
    ratingBefore: rating,
    opponentRating: opponent,
    outcome: 'lose',
    constants,
  })
  const p = win.expected
  return p * win.ratingUpdate + (1 - p) * lose.ratingUpdate
}

export function auditRows(constants: RatingConstants = C): Row[] {
  const rows: Row[] = []
  const add = (name: string, detail: string) => rows.push({ name, detail })

  /* 1. 동급 상대 300경기 */
  const even = run({ opponent: 1500, winChance: 0.5, matches: 300, seed: 11, constants })
  add(
    '1. 동급 상대 300경기',
    `최종 ${pad(even.rating)} (${even.wins}승) · 동급 1경기 증감 합 ${
      personalRatingUpdate({ ratingBefore: 1500, opponentRating: 1500, outcome: 'win', constants })
        .ratingUpdate +
      personalRatingUpdate({ ratingBefore: 1500, opponentRating: 1500, outcome: 'lose', constants })
        .ratingUpdate
    }`,
  )

  /* 2. 600점 낮은 상대만 300승 (진짜 300연승) */
  let streakRating = constants.initialRating
  let streakMin = Number.POSITIVE_INFINITY
  for (let index = 0; index < 300; index += 1) {
    const update = personalRatingUpdate({
      ratingBefore: streakRating,
      opponentRating: 900,
      outcome: 'win',
      constants,
    }).ratingUpdate
    streakMin = Math.min(streakMin, update)
    streakRating += update
  }
  add(
    '2. 600 낮은 상대에게 300연승',
    `1500 → ${pad(streakRating)} · 최소 승리 증감 ${streakMin} (음수면 정책 위반)`,
  )

  /* 3. 600점 높은 상대와 경기 (기대 승률대로) */
  const upExpected = expectedValuePerMatch(1500, 2100, constants)
  add('3. 600 높은 상대와 경기', `기대대로 싸울 때 1경기 기댓값 ${upExpected.toFixed(2)}`)

  /* 4·5. 1000점 이상 차이 */
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
  const favLose = personalRatingUpdate({
    ratingBefore: 2600,
    opponentRating: 1200,
    outcome: 'lose',
    constants,
  }).ratingUpdate
  add('4. 1400 차이 favorite 승리', `+${favWin} (매우 작아야 한다)`)
  add('5. 1400 차이 underdog 승리', `+${dogWin} (커야 한다) · favorite 패배 ${favLose}`)

  /* 6. 같은 rating 상대와 멸망전 20경기 (반복 감쇠가 걸리면 안 된다) */
  let annihilation = 1600
  const annihilationUpdates: number[] = []
  for (let index = 0; index < 20; index += 1) {
    const update = personalRatingUpdate({
      ratingBefore: annihilation,
      opponentRating: 1550,
      outcome: 'win',
      priorSameOutcome: index,
      constants,
    }).ratingUpdate
    annihilationUpdates.push(update)
    annihilation += update
  }
  add(
    '6. 비슷한 상대 멸망전 20연승',
    `1600 → ${pad(annihilation)} · 1번째 +${annihilationUpdates[0]} · 20번째 +${annihilationUpdates[19]}`,
  )

  /* 7. 비슷한 rating 상대와 승패 교대 20경기 */
  let alternate = 1600
  for (let index = 0; index < 20; index += 1) {
    alternate += personalRatingUpdate({
      ratingBefore: alternate,
      opponentRating: 1600,
      outcome: index % 2 === 0 ? 'win' : 'lose',
      priorSameOutcome: 0,
      constants,
    }).ratingUpdate
  }
  add('7. 승패 교대 20경기', `1600 → ${pad(alternate)} (제자리여야 한다)`)

  /* 8. 큰 rating 차이 상대와 20경기 (반복 감쇠가 걸린다) */
  let farmRepeat = 1800
  const farmUpdates: number[] = []
  for (let index = 0; index < 20; index += 1) {
    const update = personalRatingUpdate({
      ratingBefore: farmRepeat,
      opponentRating: 900,
      outcome: 'win',
      priorSameOutcome: index,
      constants,
    }).ratingUpdate
    farmUpdates.push(update)
    farmRepeat += update
  }
  add(
    '8. 900 낮은 상대에게 20연승',
    `1800 → ${pad(farmRepeat)} · 1번째 +${farmUpdates[0]} · 20번째 +${farmUpdates[19]}`,
  )

  /* 9. 매번 새로운 상대 20경기 */
  let fresh = 1600
  for (let index = 0; index < 20; index += 1) {
    fresh += personalRatingUpdate({
      ratingBefore: fresh,
      opponentRating: 1550,
      outcome: 'win',
      constants,
    }).ratingUpdate
  }
  add('9. 새 상대에게 20연승', `1600 → ${pad(fresh)}`)

  /* 10. 정상 50% 장기 유저 (40회 평균) */
  let driftTotal = 0
  for (let seed = 0; seed < 40; seed += 1) {
    driftTotal +=
      run({ opponent: 1800, winChance: 0.5, matches: 300, seed: 900 + seed, start: 1800, constants })
        .rating - 1800
  }
  add('10. 50% 승률 300경기 (40회 평균)', `평균 이동 ${(driftTotal / 40).toFixed(1)}`)

  /* 11. 65% 정상 강자 */
  const legit = run({ opponent: 1900, winChance: 0.65, matches: 300, seed: 303, constants })
  add('11. 강자 상대 65% 300경기', `최종 ${pad(legit.rating)}`)

  /* 12. 고승률 약체 farming */
  const farmer = run({ opponent: 900, winChance: 0.9, matches: 300, seed: 202, constants })
  add('12. 약체 상대 90% 300경기', `최종 ${pad(farmer.rating)} (${farmer.wins}승)`)

  /* 13. 낮은 승률이지만 강한 상대 위주 */
  const grinder = run({ opponent: 2200, winChance: 0.45, matches: 300, seed: 404, constants })
  add('13. 강자 상대 45% 300경기', `최종 ${pad(grinder.rating)}`)

  /* 14·15. 신규 유저 */
  const settle = (trueRating: number, opponent: number, seed: number): number => {
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
  add('14. 신규 강자 안착', `${settle(2200, 1900, 505)}경기`)
  add('15. 신규 약자 안착', `${settle(900, 1400, 606)}경기`)

  /* 16. 시즌 전환 — 모두 같은 출발점 */
  const rng = createRng(808)
  const before = Array.from({ length: 200 }, () => 1500 + (rng() - 0.5) * 1600)
  const after = before.map(() => seasonStartRating(constants))
  add(
    '16. 시즌 전환 (동일 baseline)',
    `이전 ${Math.round(Math.min(...before))}~${Math.round(Math.max(...before))} → ` +
      `새 시즌 전원 ${after[0]} (서로 다른 값 ${new Set(after).size}개)`,
  )

  /* 17·18·19. 경기 인정 */
  const three = rateMatch({
    participants: [...squad('A', 'CA', 'win', 3), ...squad('B', 'CB', 'lose', 3)],
    clanRatings: { CA: 1500, CB: 1500 },
    constants,
  })
  const fourThree = evaluateEligibility({
    participants: [...squad('A', 'CA', 'win', 4), ...squad('B', 'CB', 'lose', 3)],
    constants,
  })
  const fiveTwo = evaluateEligibility({
    participants: [...squad('A', 'CA', 'win', 5), ...squad('B', 'CB', 'lose', 2)],
    constants,
  })
  add(
    '17. 3v3 confirmed',
    `인정 ${three.eligibility.eligible} · 개인 결과 ${three.players.length}건 · 라인업 반영 ${three.clans.some((clan) => clan.lineupBlended)}`,
  )
  add('18. 4v3 confirmed', `인정 ${fourThree.eligible} · 수준 ${fourThree.completeness}`)
  add('19. 5v2 confirmed', `인정 ${fiveTwo.eligible} · 사유 ${fiveTwo.status}`)

  return rows
}

/* --------------------------------------------------------------- 불변식 --- */

export interface Invariant {
  name: string
  passed: boolean
  detail: string
}

export function invariants(constants: RatingConstants = C): Invariant[] {
  const result: Invariant[] = []
  const add = (name: string, passed: boolean, detail: string) =>
    result.push({ name, passed, detail })

  /* 승리했는데 감소하지 않음 / 패배했는데 증가하지 않음 */
  let minWin = Number.POSITIVE_INFINITY
  let maxLose = Number.NEGATIVE_INFINITY
  for (let rating = 0; rating <= 4000; rating += 50) {
    for (let opponent = 0; opponent <= 4000; opponent += 50) {
      for (const prior of [0, 1, 3, 10]) {
        const win = personalRatingUpdate({
          ratingBefore: rating,
          opponentRating: opponent,
          outcome: 'win',
          priorSameOutcome: prior,
          constants,
        }).ratingUpdate
        const lose = personalRatingUpdate({
          ratingBefore: rating,
          opponentRating: opponent,
          outcome: 'lose',
          priorSameOutcome: prior,
          constants,
        }).ratingUpdate
        const clanWin = clanRatingUpdate({
          ratingBefore: rating,
          opponentRating: opponent,
          outcome: 'win',
          priorSameOutcome: prior,
          constants,
        }).ratingUpdate
        minWin = Math.min(minWin, win, clanWin)
        maxLose = Math.max(maxLose, lose)
      }
    }
  }
  add('승리했는데 rating이 감소하지 않는다', minWin >= 0, `최소 승리 증감 ${minWin}`)
  add('패배했는데 rating이 증가하지 않는다', maxLose <= 0, `최대 패배 증감 ${maxLose}`)

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
  add('극단적 favorite 승리는 매우 작은 보상', favWin <= 1, `+${favWin}`)
  add('극단적 underdog 승리는 충분한 보상', dogWin >= 20, `+${dogWin}`)

  /* 정상 멸망전이 부당하게 0이 되지 않는다 */
  const annihilationLast = personalRatingUpdate({
    ratingBefore: 1600,
    opponentRating: 1550,
    outcome: 'win',
    priorSameOutcome: 19,
    constants,
  }).ratingUpdate
  add(
    '정상적인 멸망전이 0점 처리되지 않는다',
    annihilationLast >= 5,
    `20번째 반복 승리 +${annihilationLast}`,
  )

  /* 기대대로 싸울 때 손해가 아니다 (cap이 정직한 경기를 벌하지 않는가) */
  const evs = [0, 200, 400, 600].map((gap) => expectedValuePerMatch(1500 + gap, 1500, constants))
  add(
    '기대 승률대로 싸우면 손해가 아니다 (격차 600까지)',
    evs.every((value) => value > -1),
    evs.map((value, index) => `${index * 200}점차 ${value.toFixed(2)}`).join(' · '),
  )

  /* farming < 정상 강자 */
  const farmer = run({ opponent: 900, winChance: 0.9, matches: 300, seed: 202, constants }).rating
  const legit = run({ opponent: 1900, winChance: 0.65, matches: 300, seed: 303, constants }).rating
  add('약체 farming이 강한 상대 경기보다 유리하지 않다', farmer < legit, `${farmer} < ${legit}`)

  /* 50% 유저 무한 inflation 없음 (닫힌 모집단) */
  const rng = createRng(1111)
  const ratings = new Array<number>(100).fill(constants.initialRating)
  for (let index = 0; index < 5000; index += 1) {
    const a = Math.floor(rng() * ratings.length)
    let b = Math.floor(rng() * ratings.length)
    if (a === b) b = (b + 1) % ratings.length
    const aWins = rng() < 0.5
    const updateA = personalRatingUpdate({
      ratingBefore: ratings[a]!,
      opponentRating: ratings[b]!,
      outcome: aWins ? 'win' : 'lose',
      constants,
    }).ratingUpdate
    const updateB = personalRatingUpdate({
      ratingBefore: ratings[b]!,
      opponentRating: ratings[a]!,
      outcome: aWins ? 'lose' : 'win',
      constants,
    }).ratingUpdate
    ratings[a] = Math.max(constants.ratingFloor, ratings[a]! + updateA)
    ratings[b] = Math.max(constants.ratingFloor, ratings[b]! + updateB)
  }
  const drift =
    ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length - constants.initialRating
  add('정상 50% 유저가 무한 inflation하지 않는다', Math.abs(drift) <= 15, `평균 이동 ${drift.toFixed(1)}`)

  /* incomplete participant 추측 금지 */
  const partial = rateMatch({
    participants: [...squad('A', 'CA', 'win', 3), ...squad('B', 'CB', 'lose', 3)],
    clanRatings: { CA: 1500, CB: 1500 },
    constants,
  })
  add(
    'incomplete participant를 추측하지 않는다',
    partial.players.length === 6 && !partial.clans.some((clan) => clan.lineupBlended),
    `개인 결과 ${partial.players.length}건 · 라인업 반영 ${partial.clans.some((clan) => clan.lineupBlended)}`,
  )

  /* deterministic */
  const first = JSON.stringify(rateMatch({
    participants: [...squad('A', 'CA', 'win', 4), ...squad('B', 'CB', 'lose', 4)],
    clanRatings: { CA: 1620, CB: 1480 },
    priorSameOutcome: 2,
    constants,
  }))
  const second = JSON.stringify(rateMatch({
    participants: [...squad('A', 'CA', 'win', 4), ...squad('B', 'CB', 'lose', 4)],
    clanRatings: { CA: 1620, CB: 1480 },
    priorSameOutcome: 2,
    constants,
  }))
  add('replay가 결정적이다', first === second, '같은 입력 → 같은 결과')

  add('division이 점수를 왜곡하지 않는다', !('division' in constants), '공식 입력에 division이 없다')

  return result
}
