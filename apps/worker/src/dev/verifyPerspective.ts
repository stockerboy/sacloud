import { prisma } from '@sacloud/db'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const snap = JSON.parse(readFileSync(path.join(process.cwd(),'..','..','packages','db','data','supply-official-matches.json'),'utf8'))
const L = await prisma.league.findUnique({ where: { slug: 'supply' }, select: { id: true } })
if (!L) throw new Error('no league')
const lcs = await prisma.leagueClan.findMany({ where: { leagueId: L.id }, select: { id: true, clan: { select: { sourceClanId: true, name: true } } } })
const bySource = new Map<string, { id: string; name: string }>()
for (const r of lcs) if (r.clan.sourceClanId) bySource.set(r.clan.sourceClanId, { id: r.id, name: r.clan.name })
let checked = 0, ok = 0, bad = 0, noPersp = 0, notMapped = 0
const samples: string[] = []
for (const m of snap.matches) {
  const id = String(m.id)
  const db = await prisma.match.findFirst({ where: { OR: [{ id }, { sourceMatchId: id }] }, select: { redLeagueClanId: true, blueLeagueClanId: true } })
  if (!db) continue
  checked++
  const p = (m.perspectives || [])[0]
  if (!p || p.clan_id == null || p.opponent_clan_id == null) { noPersp++; continue }
  const mine = bySource.get(String(p.clan_id)), opp = bySource.get(String(p.opponent_clan_id))
  if (!mine || !opp) { notMapped++; continue }
  const blueId = p.blue_team ? mine.id : opp.id
  const redId  = p.blue_team ? opp.id : mine.id
  if (redId === db.redLeagueClanId && blueId === db.blueLeagueClanId) ok++
  else { bad++; if (samples.length < 5) samples.push(`${id} persp(red=${redId},blue=${blueId}) db(red=${db.redLeagueClanId},blue=${db.blueLeagueClanId})`) }
}
console.info(`기존 경기 대조 ${checked}건 — 일치 ${ok} · 불일치 ${bad} · perspective 없음 ${noPersp} · 리그클랜 매핑 안됨 ${notMapped}`)
for (const s of samples) console.info('  ' + s)
await prisma.$disconnect()
