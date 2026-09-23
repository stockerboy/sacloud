import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
const league = await p.league.findFirst({ where: { slug: 'supply' }, select: { id: true } })
const clans = await p.clan.findMany({ where: { OR: [{ name: { contains: 'deluxe', mode: 'insensitive' } }, { name: { contains: 'amaryllis', mode: 'insensitive' } }, { name: { contains: 'hardcores', mode: 'insensitive' } }] }, select: { id: true, slug: true, name: true, leagueClans: { where: { leagueId: league.id }, select: { id: true, status: true, win: true, lose: true } } } })
console.log('clans', JSON.stringify(clans))
const pid = 'cmtler9ah00lavlew9wb734vt'
const lp = await p.leaguePlayer.findMany({ where: { playerId: pid }, select: { id: true, leagueId: true, clanId: true, win: true, lose: true, rating: true } })
console.log('leaguePlayers', JSON.stringify(lp))
const since = new Date(Date.now() - 4 * 86400000)
const st = await p.matchPlayerStat.findMany({ where: { playerId: pid, match: { startAt: { gte: since } } }, select: { match: { select: { id: true, startAt: true, leagueId: true, redClan: { select: { clan: { select: { name: true } } } }, blueClan: { select: { clan: { select: { name: true } } } } } } }, orderBy: { match: { startAt: 'desc' } } })
console.log('player stats last 4d', st.length)
for (const s of st) console.log(' ', s.match.startAt.toISOString().slice(5, 16), s.match.id, s.match.redClan.clan.name, 'vs', s.match.blueClan.clan.name)
const last = await p.matchPlayerStat.findFirst({ where: { playerId: pid }, orderBy: { match: { startAt: 'desc' } }, select: { match: { select: { startAt: true } } } })
console.log('latest stat', last?.match.startAt)
for (const c of clans) for (const lc of c.leagueClans) {
  const n = await p.match.count({ where: { startAt: { gte: since }, OR: [{ redLeagueClanId: lc.id }, { blueLeagueClanId: lc.id }] } })
  const newest = await p.match.findFirst({ where: { OR: [{ redLeagueClanId: lc.id }, { blueLeagueClanId: lc.id }] }, orderBy: { startAt: 'desc' }, select: { startAt: true } })
  console.log('clan', c.name, 'LC', lc.id, 'matches last4d', n, 'newest', newest?.startAt)
}
await p.$disconnect()
