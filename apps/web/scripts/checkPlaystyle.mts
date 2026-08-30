/**
 * 플레이스타일 바가 **화면 계약까지** 몇 명에게 실제로 뜨는지 센다 (D-211).
 * 읽기 전용 검증 도구. D-211 의 숫자를 이걸로 냈다.
 *
 * 질의(`apps/web/lib/server/queries/playerTraits.ts`)와 같은 규칙으로 센다 —
 * 최소 표본 · 리그별 같은 주무기 모집단 · `TRAIT_MIN_COHORT` · `buildPlayerPlaystyle`.
 */
import {
  PLAYSTYLE_MIN_ROUNDS,
  TRAIT_MIN_COHORT,
  TRAIT_MIN_GAMES,
  buildPlayerPlaystyle,
  mainWeaponOf,
  percentileOf,
} from '@sacloud/contract'
import { emptySideTally, entryDelay, positionSpread } from '@sacloud/nexon'
import { prisma } from '@sacloud/db'

const VERSION = 'playstyle-v1'

/* ---- 1) 재료 ---- */
const rows = await prisma.playerPlaystyleProfile.findMany({
  where: { playerId: { not: null }, builderVersion: VERSION },
  select: {
    playerId: true,
    defenseRounds: true,
    defensePosX: true,
    defensePosY: true,
    defensePosX2: true,
    defensePosY2: true,
    defensePosN: true,
    attackRounds: true,
    attackDelaySum: true,
    attackDelayN: true,
  },
})

const style = new Map<string, { blueSpread: number | null; redDelay: number | null }>()
for (const row of rows) {
  if (!row.playerId) continue
  const d = emptySideTally()
  d.posX = row.defensePosX
  d.posY = row.defensePosY
  d.posX2 = row.defensePosX2
  d.posY2 = row.defensePosY2
  d.posN = row.defensePosN
  const a = emptySideTally()
  a.delaySum = row.attackDelaySum
  a.delayN = row.attackDelayN
  style.set(row.playerId, {
    blueSpread: row.defenseRounds >= PLAYSTYLE_MIN_ROUNDS ? positionSpread(d) : null,
    redDelay: row.attackRounds >= PLAYSTYLE_MIN_ROUNDS ? entryDelay(a) : null,
  })
}
console.log('playstyle-v1 · Player 연결 ' + style.size + '명')
console.log(
  '  그중 재료가 실제로 나온 사람 — 블루 ' +
    [...style.values()].filter((v) => v.blueSpread !== null).length +
    ' · 레드 ' +
    [...style.values()].filter((v) => v.redDelay !== null).length,
)

/* ---- 2) 리그별 · 주무기별 모집단 ---- */
const leagues = await prisma.league.findMany({ select: { id: true, slug: true } })

let totalBlue = 0
let totalRed = 0
let totalBoth = 0
let totalPlayers = 0

for (const league of leagues) {
  const stats = await prisma.matchPlayerStat.groupBy({
    by: ['playerId', 'weapon'],
    where: { weapon: { in: [0, 1] }, match: { leagueId: league.id } },
    _count: { _all: true },
  })
  if (stats.length === 0) continue

  const games = new Map<string, [number, number]>()
  for (const row of stats) {
    const w = row.weapon === 1 ? 1 : 0
    const e = games.get(row.playerId) ?? [0, 0]
    e[w] = row._count._all
    games.set(row.playerId, e)
  }

  const cohorts: Record<0 | 1, { blue: number[]; red: number[]; members: string[] }> = {
    0: { blue: [], red: [], members: [] },
    1: { blue: [], red: [], members: [] },
  }
  const weaponOf = new Map<string, 0 | 1>()

  for (const [playerId, g] of games) {
    const w = mainWeaponOf(g[0], g[1])
    if (w === null) continue
    if (g[w] < TRAIT_MIN_GAMES) continue
    weaponOf.set(playerId, w)
    cohorts[w].members.push(playerId)
    const s = style.get(playerId)
    if (!s) continue
    if (s.blueSpread !== null) cohorts[w].blue.push(s.blueSpread)
    if (s.redDelay !== null) cohorts[w].red.push(-s.redDelay)
  }

  for (const w of [0, 1] as const) {
    cohorts[w].blue.sort((a, b) => a - b)
    cohorts[w].red.sort((a, b) => a - b)
  }

  let blue = 0
  let red = 0
  let both = 0
  const samples: string[] = []
  for (const [playerId, w] of weaponOf) {
    const s = style.get(playerId)
    const c = cohorts[w]
    const pctl = (sorted: number[], value: number | null | undefined): number | null => {
      if (value === null || value === undefined) return null
      if (sorted.length < TRAIT_MIN_COHORT) return null
      return percentileOf(sorted, value)
    }
    const bars = buildPlayerPlaystyle({
      weapon: w,
      bluePercentile: pctl(c.blue, s?.blueSpread),
      redPercentile: pctl(c.red, s?.redDelay == null ? null : -s.redDelay),
      hasRoundData: s !== undefined,
    })
    const b = bars.bars[0]?.value !== null
    const r = bars.bars[1]?.value !== null
    if (league.slug === 'supply' && b && r && samples.length < 6) {
      samples.push(
        '    흩어짐 ' + (s?.blueSpread ?? 0).toFixed(1).padStart(6) +
        ' → 블루 ' + String(bars.bars[0]?.value).padStart(5) +
        '  |  지연 ' + (s?.redDelay ?? 0).toFixed(1).padStart(5) + '초' +
        ' → 레드 ' + String(bars.bars[1]?.value).padStart(5),
      )
    }
    if (b) blue += 1
    if (r) red += 1
    if (b && r) both += 1
  }

  if (samples.length > 0) { console.log('  [supply 표본]'); for (const line of samples) console.log(line) }
  totalBlue += blue
  totalRed += red
  totalBoth += both
  totalPlayers += weaponOf.size
  console.log(
    '  ' +
      league.slug.padEnd(14) +
      ' 주무기 확정 ' +
      String(weaponOf.size).padStart(5) +
      '명 → 블루 ' +
      String(blue).padStart(5) +
      ' · 레드 ' +
      String(red).padStart(5) +
      ' · 둘 다 ' +
      String(both).padStart(5),
  )
}

console.log(
  '\n합계 — 주무기 확정 ' +
    totalPlayers +
    '명 중 블루 ' +
    totalBlue +
    ' · 레드 ' +
    totalRed +
    ' · 둘 다 ' +
    totalBoth,
)

await prisma.$disconnect()
