import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
const league = await p.league.findFirst({ where: { slug: 'supply' }, select: { id: true } })
const players = await p.player.findMany({ where: { name: '자이언트' }, select: { id: true, name: true, clan: { select: { slug: true, name: true } }, sourcePlayerId: true } })
console.log('players', JSON.stringify(players))
const deluxe = await p.leagueClan.findFirst({ where: { leagueId: league.id, clan: { slug: 'deluxe' } }, select: { id: true, clanId: true, clan: { select: { name: true } } } })
console.log('deluxe LC', JSON.stringify(deluxe))
const since = new Date(Date.now() - 4 * 86400000)
const ms = await p.match.findMany({ where: { leagueId: league.id, startAt: { gte: since }, OR: [{ redLeagueClanId: deluxe.id }, { blueLeagueClanId: deluxe.id }] }, orderBy: { startAt: 'desc' }, select: { id: true, sourceMatchId: true, startAt: true, origin: true, lineupStatus: true, participantCompleteness: true, supersededAt: true, winnerSide: true, redClan: { select: { clan: { select: { name: true } } } }, blueClan: { select: { clan: { select: { name: true } } } }, _count: { select: { stats: true } } } })
console.log('deluxe matches last 4d:', ms.length)
for (const m of ms) console.log(m.startAt.toISOString().slice(5,16), m.id, m.origin, m.lineupStatus, m.participantCompleteness, 'stats', m._count.stats, m.redClan.clan.name, 'vs', m.blueClan.clan.name, m.supersededAt ? 'SUPERSEDED' : '')
for (const pl of players) {
  const n = await p.matchPlayerStat.count({ where: { playerId: pl.id, match: { leagueId: league.id, startAt: { gte: since } } } })
  const last = await p.matchPlayerStat.findFirst({ where: { playerId: pl.id, match: { leagueId: league.id } }, orderBy: { match: { startAt: 'desc' } }, select: { match: { select: { startAt: true, id: true } } } })
  console.log('player', pl.id, 'stats last4d', n, 'latest', last?.match.startAt)
}
await p.$disconnect()
