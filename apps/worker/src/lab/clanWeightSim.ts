/**
 * 클랜 래더 반영률(100/70/40/0%)의 장기 영향 시뮬레이션 (sandbox · D-083).
 *
 *   pnpm --filter @sacloud/worker exec tsx src/lab/clanWeightSim.ts
 *
 * 왜 필요한가
 *   팀마다 반영률이 다르면 한 경기의 클랜 증감 합이 0이 아니다(+8 / -20 같은 결과).
 *   그것이 시즌 단위로 쌓였을 때 인플레이션·디플레이션·분포 붕괴·하한 집중이
 *   생기는지 **숫자로** 확인해야 한다.
 *
 * DB를 쓰지 않는다. 난수는 seed로 고정한다.
 */
import {
  DEFAULT_RATING_CONSTANTS,
  clanWeightForMembers,
  clanRatingUpdate,
  type RatingConstants,
} from '@sacloud/rating'
import { createRng, describe as summarize, spearman } from './simulate.js'

interface SeasonResult {
  label: string
  mean: number
  stdev: number
  min: number
  max: number
  drift: number
  atFloor: number
  skillCorrelation: number
}

/**
 * 한 시즌을 돌린다.
 *
 * @param mercenaryRate 경기마다 각 팀이 용병을 쓸 확률 분포 (0 = 항상 본클랜원 5명)
 */
function season(input: {
  constants: RatingConstants
  clans: number
  matches: number
  seed: number
  /** 각 팀이 낼 본클랜원 수를 뽑는 함수 */
  memberCount: (rng: () => number) => number
  label: string
}): SeasonResult {
  const { constants } = input
  const rng = createRng(input.seed)
  const strength = Array.from({ length: input.clans }, () => 1200 + rng() * 1200)
  const ratings = new Array<number>(input.clans).fill(constants.initialRating)

  for (let index = 0; index < input.matches; index += 1) {
    const a = Math.floor(rng() * input.clans)
    let b = Math.floor(rng() * input.clans)
    if (a === b) b = (b + 1) % input.clans

    const aWins = rng() < 1 / (1 + 10 ** ((strength[b]! - strength[a]!) / 400))
    const weightA = clanWeightForMembers(input.memberCount(rng), constants)
    const weightB = clanWeightForMembers(input.memberCount(rng), constants)

    // 한쪽이라도 본클랜원 3명이면 공식 경기다 (OR — D-079)
    if (weightA < 1 && weightB < 1) continue

    const rawA = clanRatingUpdate({
      ratingBefore: ratings[a]!,
      opponentRating: ratings[b]!,
      outcome: aWins ? 'win' : 'lose',
      constants,
    }).ratingUpdate
    const rawB = clanRatingUpdate({
      ratingBefore: ratings[b]!,
      opponentRating: ratings[a]!,
      outcome: aWins ? 'lose' : 'win',
      constants,
    }).ratingUpdate

    ratings[a] = Math.max(constants.ratingFloor, ratings[a]! + Math.round(rawA * weightA))
    ratings[b] = Math.max(constants.ratingFloor, ratings[b]! + Math.round(rawB * weightB))
  }

  const stats = summarize(ratings)
  return {
    label: input.label,
    mean: stats.mean,
    stdev: stats.stdev,
    min: stats.min,
    max: stats.max,
    drift: stats.mean - constants.initialRating,
    atFloor: ratings.filter((rating) => rating <= constants.ratingFloor).length,
    skillCorrelation: spearman(strength, ratings),
  }
}

function main(): void {
  const constants = DEFAULT_RATING_CONSTANTS
  console.info('클랜 래더 반영률의 장기 영향 — 시즌 단위 시뮬레이션 (D-083)\n')
  console.info('반영률: 본클랜원 3명↑ 100% · 2명 70% · 1명 40% · 0명 0%\n')

  const scenarios: SeasonResult[] = [
    season({
      constants,
      clans: 40,
      matches: 4000,
      seed: 11,
      label: '전원 본클랜원 5명 (반영률 100%)',
      memberCount: () => 5,
    }),
    season({
      constants,
      clans: 40,
      matches: 4000,
      seed: 22,
      label: '가끔 용병 (3~5명이 본클랜원)',
      memberCount: (rng) => 3 + Math.floor(rng() * 3),
    }),
    season({
      constants,
      clans: 40,
      matches: 4000,
      seed: 33,
      label: '용병 흔함 (1~5명이 본클랜원)',
      memberCount: (rng) => 1 + Math.floor(rng() * 5),
    }),
    season({
      constants,
      clans: 40,
      matches: 4000,
      seed: 44,
      label: '용병 남용 (0~3명이 본클랜원)',
      memberCount: (rng) => Math.floor(rng() * 4),
    }),
  ]

  console.info(
    '시나리오                          평균     이동    표준편차   최소   최대  하한집중  실력상관',
  )
  for (const row of scenarios) {
    console.info(
      `${row.label.padEnd(30)} ${row.mean.toFixed(0).padStart(6)} ${row.drift
        .toFixed(1)
        .padStart(7)} ${row.stdev.toFixed(0).padStart(9)} ${String(row.min).padStart(6)} ${String(
        row.max,
      ).padStart(6)} ${String(row.atFloor).padStart(8)} ${row.skillCorrelation
        .toFixed(3)
        .padStart(9)}`,
    )
  }

  console.info('\n판정 기준')
  const worst = scenarios.reduce((left, right) =>
    Math.abs(left.drift) > Math.abs(right.drift) ? left : right,
  )
  console.info(`  최대 평균 이동 ${worst.drift.toFixed(1)} (${worst.label})`)
  console.info(`  하한(0점) 집중 ${scenarios.reduce((sum, row) => sum + row.atFloor, 0)}건`)
  console.info(
    `  실력 상관 최저 ${Math.min(...scenarios.map((row) => row.skillCorrelation)).toFixed(3)}`,
  )
}

main()
