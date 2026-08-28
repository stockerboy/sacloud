import { prisma } from '@sacloud/db'
const leagues = await prisma.league.findMany({ select: { id: true, slug: true, name: true, _count: { select: { players: true } } } })
console.log(leagues.map(l=>`${l.slug} ${l.name} players=${l._count.players}`).join('\n'))
for (const l of leagues) {
  const withSrc = await prisma.leaguePlayer.count({ where: { leagueId: l.id, sourceLeaguePlayerId: { not: null } } })
  console.log(`${l.slug}: sourceLeaguePlayerId set = ${withSrc}`)
}
const seasons = await prisma.season.findMany({ select: { id:true, leagueId:true, number:true, seasonType:true, status:true } })
console.log('seasons', JSON.stringify(seasons))
console.log('LeaguePlayerSeason rows', await prisma.leaguePlayerSeason.count())
const sample = await prisma.leaguePlayer.findFirst({ where: { sourceLeaguePlayerId: { not: null } }, select: { sourceLeaguePlayerId:true, player: { select: { name: true, sourcePlayerId: true } } } })
console.log('sample', JSON.stringify(sample))
const p = await prisma.player.count({ where: { sourcePlayerId: { not: null } } })
console.log('players with sourcePlayerId', p)
await prisma.$disconnect()
