import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
const leagues = await p.league.findMany({ select: { id: true, slug: true, name: true } })
console.log('leagues', JSON.stringify(leagues))
const names = ['deluxe', 'amaryllis', 'hardcores']
for (const n of names) {
  const c = await p.clan.findFirst({ where: { name: n }, select: { id: true, slug: true, leagueClans: { select: { id: true, leagueId: true, status: true, win: true, lose: true, joinedAt: true } } } })
  console.log('clan', n, JSON.stringify(c))
}
/* 자이언트 최근 기록이 9/19 까지 — 그 경기의 리그·클랜 */
const pid = 'cmtler9ah00lavlew9wb734vt'
const recent = await p.matchPlayerStat.findMany({ where: { playerId: pid }, orderBy: { match: { startAt: 'desc' } }, take: 5, select: { match: { select: { id: true, startAt: true, leagueId: true, redLeagueClanId: true, blueLeagueClanId: true, redClan: { select: { clanId: true, clan: { select: { name: true } } } }, blueClan: { select: { clanId: true, clan: { select: { name: true } } } } } } } })
for (const s of recent) console.log(' recent', s.match.startAt.toISOString().slice(0,16), s.match.leagueId, s.match.redClan.clan.name, s.match.redLeagueClanId, 'vs', s.match.blueClan.clan.name, s.match.blueLeagueClanId)
/* 원문(NexonMatch)에 이 선수의 최근 경기가 들어왔나 — 참가자 표로 */
const since = new Date(Date.now() - 4 * 86400000)
const partCols = Object.keys(p.nexonMatchParticipant.fields ?? {})
console.log('participant fields', partCols.join(','))
await p.$disconnect()
