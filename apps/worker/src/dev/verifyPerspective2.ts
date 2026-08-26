import { prisma } from '@sacloud/db'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const snap = JSON.parse(readFileSync(path.join(process.cwd(),'..','..','packages','db','data','supply-official-matches.json'),'utf8'))
const L = await prisma.league.findUnique({ where: { slug: 'supply' }, select: { id: true } })
if (!L) throw new Error('no league')
const lcs = await prisma.leagueClan.findMany({ where: { leagueId: L.id }, select: { id: true, clan: { select: { sourceClanId: true } } } })
const bySource = new Map<string, string>()
for (const r of lcs) if (r.clan.sourceClanId) bySource.set(r.clan.sourceClanId, r.id)
let agreeRated = 0, agreeUnrated = 0, disagreeRated = 0, disagreeUnrated = 0
for (const m of snap.matches) {
  const id = String(m.id)
  const db = await prisma.match.findFirst({ where: { OR: [{ id }, { sourceMatchId: id }] }, select: { redLeagueClanId: true, blueLeagueClanId: true, redRatingUpdate: true, participantCompleteness: true } })
  if (!db) continue
  const p = (m.perspectives || [])[0]
  if (!p) continue
  const mine = bySource.get(String(p.clan_id)), opp = bySource.get(String(p.opponent_clan_id))
  if (!mine || !opp) continue
  const blueId = p.blue_team ? mine : opp
  const redId  = p.blue_team ? opp : mine
  const agree = redId === db.redLeagueClanId && blueId === db.blueLeagueClanId
  const rated = db.redRatingUpdate !== null
  if (agree && rated) agreeRated++
  else if (agree) agreeUnrated++
  else if (rated) disagreeRated++
  else disagreeUnrated++
}
console.info(`일치+래더반영   ${agreeRated}`)
console.info(`일치+래더미반영 ${agreeUnrated}`)
console.info(`불일치+래더반영 ${disagreeRated}   <-- 여기가 중요`)
console.info(`불일치+미반영   ${disagreeUnrated}`)
await prisma.$disconnect()
