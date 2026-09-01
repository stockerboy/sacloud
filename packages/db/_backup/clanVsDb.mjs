import { readFileSync } from 'node:fs'
import { PrismaClient } from '../generated/client/index.js'

const plan = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const prisma = new PrismaClient()
for (const slug of ['supply', 'sanply']) {
  const lp = plan.plans.find((x) => x.slug === slug)
  const rows = await prisma.leagueClan.findMany({
    where: { id: { in: lp.clans.map((c) => c.leagueClanId) } },
    select: { id: true, rating: true, win: true, lose: true, placement: true, placementPlayed: true, updatedAt: true },
  })
  const db = new Map(rows.map((r) => [r.id, r]))
  let exact = 0
  const d = { rating: 0, winlose: 0, played: 0, placement: 0, missing: 0 }
  for (const c of lp.clans) {
    const r = db.get(c.leagueClanId)
    if (!r) { d.missing += 1; continue }
    let bad = false
    if (r.rating !== c.rating) { d.rating += 1; bad = true }
    if (r.win !== c.win || r.lose !== c.lose) { d.winlose += 1; bad = true }
    if (r.placementPlayed !== c.placementPlayed) { d.played += 1; bad = true }
    if (r.placement !== c.placement) { d.placement += 1; bad = true }
    if (!bad) exact += 1
  }
  console.log(
    '[' + slug + '] 계획 클랜 ' + lp.clans.length + ' — 일치 ' + exact +
      ' · rating다름 ' + d.rating + ' · 승패다름 ' + d.winlose +
      ' · 판수다름 ' + d.played + ' · placement다름 ' + d.placement + ' · 없음 ' + d.missing,
  )
}
await prisma.$disconnect()
