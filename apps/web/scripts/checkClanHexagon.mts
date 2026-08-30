/**
 * 클랜 육각형이 **화면 계약까지** 몇 축이나 실제로 뜨는지 센다 (D-211).
 * 읽기 전용 검증 도구. D-211 의 숫자를 이걸로 냈다 — 최소 표본을 바꿀 때 다시 돌린다.
 *
 * 질의(`apps/web/lib/server/queries/clanRoundMetrics.ts`)와 **같은 규칙**으로 센다 —
 * 최소 표본 · 리그별 모집단 · `buildClanHexagon` 까지 그대로 태운다.
 */
import {
  CLAN_OUTNUMBERED_MIN_ROUNDS,
  CLAN_ROUND_MIN_ROUNDS,
  CLAN_TEMPO_MIN_ROUNDS,
  CLAN_TRAIT_AXIS_KEYS,
  buildClanHexagon,
  type ClanAxisInput,
  type ClanTraitAxisKey,
} from '@sacloud/contract'
import { prisma } from '@sacloud/db'

interface Tally {
  leagueId: string
  defenseRounds: number
  defenseConceded: number
  attackRounds: number
  attackWon: number
  organizedRounds: number
  organizedHeld: number
  burstRounds: number
  bursts: number
  tempoGapRounds: number
  tempoGapMedian: number | null
  outnumberedRounds: number
  outnumberedWon: number
}

let MIN_OVERRIDE = CLAN_ROUND_MIN_ROUNDS
const rate = (num: number, den: number, min: number): number | null =>
  den < min ? null : (num / den) * 100

function valuesOf(t: Tally): Record<ClanTraitAxisKey, number | null> {
  return {
    outnumbered: rate(t.outnumberedWon, t.outnumberedRounds, CLAN_OUTNUMBERED_MIN_ROUNDS),
    defense: rate(t.defenseRounds - t.defenseConceded, t.defenseRounds, MIN_OVERRIDE),
    attack: rate(t.attackWon, t.attackRounds, MIN_OVERRIDE),
    organized: rate(t.organizedHeld, t.organizedRounds, MIN_OVERRIDE),
    burst: rate(t.bursts, t.burstRounds, MIN_OVERRIDE),
    tempo:
      t.tempoGapRounds >= CLAN_TEMPO_MIN_ROUNDS && t.tempoGapMedian !== null
        ? t.tempoGapMedian
        : null,
  }
}

const PENDING: Record<ClanTraitAxisKey, ClanAxisInput['pending']> = {
  outnumbered: 'matches',
  defense: 'side',
  attack: 'side',
  organized: 'side',
  burst: 'side',
  tempo: 'side',
}

for (const [version, thr] of [['clan-round-v2',20],['clan-round-v3',20],['clan-round-v3',40],['clan-round-v3',60],['clan-round-v3',80],['clan-round-v3',100],['clan-round-v3',150]] as [string,number][]) {
  MIN_OVERRIDE = thr
  const rows = await prisma.clanRoundProfile.findMany({
    where: { builderVersion: version },
    select: {
      leagueClanId: true,
      leagueClan: { select: { leagueId: true } },
      defenseRounds: true,
      defenseConceded: true,
      attackRounds: true,
      attackWon: true,
      organizedRounds: true,
      organizedHeld: true,
      burstRounds: true,
      bursts: true,
      tempoGapRounds: true,
      tempoGapMedian: true,
      outnumberedRounds: true,
      outnumberedWon: true,
    },
  })

  const tallies = new Map<string, Tally>()
  for (const r of rows) {
    tallies.set(r.leagueClanId, { ...r, leagueId: r.leagueClan.leagueId } as Tally)
  }

  /* 리그별 축 분포 — 질의가 만드는 모집단과 같다 */
  const cohorts = new Map<string, Record<ClanTraitAxisKey, number[]>>()
  for (const [, t] of tallies) {
    let c = cohorts.get(t.leagueId)
    if (!c) {
      c = { outnumbered: [], defense: [], attack: [], organized: [], burst: [], tempo: [] }
      cohorts.set(t.leagueId, c)
    }
    const v = valuesOf(t)
    for (const key of CLAN_TRAIT_AXIS_KEYS) {
      const value = v[key]
      if (value !== null) c[key].push(value)
    }
  }

  const shown: Record<string, number> = {}
  for (const key of CLAN_TRAIT_AXIS_KEYS) shown[key] = 0
  let anyAxis = 0
  let allSix = 0
  let measuredSum = 0

  for (const [, t] of tallies) {
    const v = valuesOf(t)
    const cohort = cohorts.get(t.leagueId) as Record<ClanTraitAxisKey, number[]>
    const inputs = Object.fromEntries(
      CLAN_TRAIT_AXIS_KEYS.map((key) => [
        key,
        {
          value: v[key],
          cohort: cohort[key],
          pending: PENDING[key],
          lowerIsBetter: key === 'tempo',
        } satisfies ClanAxisInput,
      ]),
    ) as Record<ClanTraitAxisKey, ClanAxisInput>

    const hexagon = buildClanHexagon(inputs)
    for (const axis of hexagon.axes) if (axis.percentile !== null) shown[axis.key] += 1
    measuredSum += hexagon.measured
    if (hexagon.measured > 0) anyAxis += 1
    if (hexagon.measured === 6) allSix += 1
  }

  console.log('\n=== ' + version + ' · 프로필 ' + tallies.size + '개 ===')
  for (const key of CLAN_TRAIT_AXIS_KEYS) {
    console.log('  ' + key.padEnd(12) + ' 백분위가 뜨는 클랜 ' + String(shown[key]).padStart(4))
  }
  console.log('  ── 한 축이라도 뜨는 클랜 ' + anyAxis + ' · 여섯 축 전부 ' + allSix)
  console.log('  ── 평균 측정 축수 ' + (measuredSum / Math.max(1, tallies.size)).toFixed(2) + ' / 6')
}

await prisma.$disconnect()
