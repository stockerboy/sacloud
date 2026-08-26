import { prisma } from '@sacloud/db'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const snap = JSON.parse(readFileSync(path.join(process.cwd(),'..','..','packages','db','data','supply-official-matches.json'),'utf8'))
const L = await prisma.league.findUnique({ where: { slug: 'supply' }, select: { id: true } })
if (!L) throw new Error('no league')
const lcs = await prisma.leagueClan.findMany({ where: { leagueId: L.id }, select: { id: true, clan: { select: { sourceClanId: true, name: true } } } })
const bySource = new Map<string, string>(); const nameOf = new Map<string, string>()
for (const r of lcs) { if (r.clan.sourceClanId) bySource.set(r.clan.sourceClanId, r.id); nameOf.set(r.id, r.clan.name) }
let dbWins = 0, snapWins = 0, tie = 0, shown = 0
for (const m of snap.matches) {
  const id = String(m.id)
  const db = await prisma.match.findFirst({ where: { OR: [{ id }, { sourceMatchId: id }] },
    select: { id: true, redLeagueClanId: true, blueLeagueClanId: true, redRatingUpdate: true,
              stats: { select: { side: true, rosterLeagueClanId: true } } } })
  if (!db || db.redRatingUpdate === null) continue
  const p = (m.perspectives || [])[0]; if (!p) continue
  const mine = bySource.get(String(p.clan_id)), opp = bySource.get(String(p.opponent_clan_id))
  if (!mine || !opp) continue
  const sBlue = p.blue_team ? mine : opp, sRed = p.blue_team ? opp : mine
  if (sRed === db.redLeagueClanId && sBlue === db.blueLeagueClanId) continue
  // 참가자의 원소속(rosterLeagueClanId) 근거로 어느 판정이 더 맞는지 센다
  const score = (redId: string, blueId: string) =>
    db.stats.filter(s => s.rosterLeagueClanId === (s.side === 'red' ? redId : blueId)).length
  const dbScore = score(db.redLeagueClanId, db.blueLeagueClanId)
  const snapScore = score(sRed, sBlue)
  if (dbScore > snapScore) dbWins++; else if (snapScore > dbScore) snapWins++; else tie++
  if (shown++ < 6) console.info(`  ${db.id} DB근거 ${dbScore} vs 스냅샷근거 ${snapScore}  (DB: ${nameOf.get(db.redLeagueClanId)} vs ${nameOf.get(db.blueLeagueClanId)} / 스냅: ${nameOf.get(sRed)} vs ${nameOf.get(sBlue)})`)
}
console.info(`\n불일치 래더경기 판정 — DB 가 더 맞음 ${dbWins} · 스냅샷이 더 맞음 ${snapWins} · 동점 ${tie}`)
await prisma.$disconnect()
