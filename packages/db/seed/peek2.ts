import { prisma } from '../src/index.js'
const rows = await prisma.leaguePlayerSeason.findMany({ take: 3, select: { leaguePlayerId: true, season: true, rank: true } })
console.info(JSON.stringify(rows))
const lp = rows[0] ? await prisma.leaguePlayer.findUnique({ where: { id: rows[0].leaguePlayerId }, select: { playerId: true, league: { select: { slug: true } } } }) : null
console.info(JSON.stringify(lp))
await prisma.$disconnect()
