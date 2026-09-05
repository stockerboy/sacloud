import { prisma } from '@sacloud/db'
const league = await prisma.league.findFirst({ where: { slug: 'nolink' }, select: { id: true } })
const n = await prisma.matchPlayerStat.count({ where: { match: { leagueId: league!.id } } })
console.info('nolink 참가 기록 ' + n.toLocaleString() + '줄  (' + new Date().toISOString() + ')')
await prisma.$disconnect()
