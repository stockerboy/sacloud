/** 계획 파일과 DB 를 선수 단위로 대조한다. 읽기 전용. */
import { readFileSync } from 'node:fs'
import { PrismaClient } from '../generated/client/index.js'

const planPath = process.argv[2]
const slug = process.argv[3]
const plan = JSON.parse(readFileSync(planPath, 'utf8'))
const leaguePlan = plan.plans.find((x) => x.slug === slug)
if (!leaguePlan) throw new Error('계획에 ' + slug + ' 가 없다')

const prisma = new PrismaClient()
const league = await prisma.league.findUnique({ where: { slug }, select: { id: true } })
const rows = await prisma.leaguePlayer.findMany({
  where: { leagueId: league.id },
  select: {
    playerId: true, rating: true, baseRating: true, placement: true,
    placementPlayed: true, win: true, lose: true, kill: true, death: true, updatedAt: true,
  },
})
const db = new Map(rows.map((r) => [r.playerId, r]))

const diff = { missing: 0, rating: 0, played: 0, winlose: 0, kill: 0, placementTrue: 0, exact: 0 }
const samples = []
for (const p of leaguePlan.players) {
  const d = db.get(p.playerId)
  if (!d) { diff.missing += 1; continue }
  let bad = false
  if (d.rating !== p.rating) { diff.rating += 1; bad = true }
  if (d.placementPlayed !== p.placementPlayed) { diff.played += 1; bad = true }
  if (d.win !== p.win || d.lose !== p.lose) { diff.winlose += 1; bad = true }
  if (d.kill !== p.kill) { diff.kill += 1; bad = true }
  if (d.placement !== p.placement) { diff.placementTrue += 1; bad = true }
  if (!bad) diff.exact += 1
  else if (samples.length < 6) {
    samples.push({
      계획: p.rating + ' / ' + p.placementPlayed + '판 / ' + p.win + '승' + p.lose + '패 / ' + p.kill + '킬',
      DB: d.rating + ' / ' + d.placementPlayed + '판 / ' + d.win + '승' + d.lose + '패 / ' + d.kill + '킬',
      DB갱신: d.updatedAt.toISOString(),
    })
  }
}
console.log('=== ' + slug + ' — 계획 ' + leaguePlan.players.length + '명 대조 ===')
console.log('  완전 일치            ' + diff.exact)
console.log('  DB 에 없음           ' + diff.missing)
console.log('  rating 다름          ' + diff.rating)
console.log('  placementPlayed 다름 ' + diff.played)
console.log('  win/lose 다름        ' + diff.winlose)
console.log('  kill 다름            ' + diff.kill)
console.log('  placement 다름       ' + diff.placementTrue)
if (samples.length) console.table(samples)

await prisma.$disconnect()
