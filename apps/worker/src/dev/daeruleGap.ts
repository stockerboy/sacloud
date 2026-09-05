/**
 * ★열산(daerule)이 왜 0건인가★ — 읽기 전용 확인 (2026-09-04).
 *
 * 열산 원문은 계속 받고 있는데 `Match` 에는 9/3 이후 한 건도 없다.
 * 어디서 막히는지 ★단계별로 세어 본다.★ 고치지 않는다 — 세기만 한다.
 */
import { prisma } from '@sacloud/db'
import { SEASON0_FROM } from '../lib/season0Window.js'

const league = await prisma.league.findUnique({
  where: { slug: 'daerule' },
  select: { id: true, maps: { select: { map: { select: { name: true } } } } },
})
if (!league) throw new Error('daerule 리그가 없다')

const leagueMaps = new Set(league.maps.map((m) => m.map.name))
console.info('열산에 등록된 맵: ' + [...leagueMaps].join(' '))

/* 열산 클랜 이름 */
const clans = await prisma.leagueClan.findMany({
  where: { leagueId: league.id },
  select: { clan: { select: { name: true, slug: true } } },
})
const names = new Set(clans.map((c) => c.clan.name))
console.info('열산 등록 클랜 ' + clans.length + '곳')

/* 9/3 이후 원문 */
const raws: { matchKey: string; payload: Record<string, unknown> }[] = await prisma.$queryRaw`
  SELECT DISTINCT ON ("matchKey") "matchKey", "payload"
  FROM "BarracksClanMatchRaw"
  WHERE "matchKey" >= '260903' AND "status" = 'ok'
  ORDER BY "matchKey" ASC, "id" ASC`
console.info('9/3 이후 원문 고유경기 ' + raws.length.toLocaleString() + '건')

let bothDaerule = 0
let mapOk = 0
const mapCount = new Map<string, number>()
for (const r of raws) {
  const red = typeof r.payload.red_clan_name === 'string' ? r.payload.red_clan_name.trim() : ''
  const blue = typeof r.payload.blue_clan_name === 'string' ? r.payload.blue_clan_name.trim() : ''
  const map = typeof r.payload.map_name === 'string' ? r.payload.map_name : '(없음)'
  if (!names.has(red) || !names.has(blue)) continue
  bothDaerule += 1
  mapCount.set(map, (mapCount.get(map) ?? 0) + 1)
  if (leagueMaps.has(map)) mapOk += 1
}
console.info('  양쪽 다 열산 클랜인 경기 ' + bothDaerule.toLocaleString() + '건')
console.info('  그중 열산 맵인 경기   ' + mapOk.toLocaleString() + '건')
console.info('  맵별:')
for (const [m, n] of [...mapCount.entries()].sort((a, b) => b[1] - a[1])) {
  console.info('    ' + m.padEnd(14) + n)
}

const have = await prisma.match.count({
  where: { leagueId: league.id, startAt: { gte: SEASON0_FROM } },
})
console.info('실제 Match 에 있는 열산 9/3 이후 경기: ' + have + '건')
await prisma.$disconnect()
