import { prisma } from '@sacloud/db'

const n = await prisma.leaguePlayerSeason.count()
console.info('지난시즌 카드 표(LeaguePlayerSeason) 행 수: ' + n.toLocaleString())

const seasons = await prisma.season.findMany({
  select: { number: true, seasonType: true, league: { select: { slug: true } } },
  orderBy: { number: 'asc' },
})
console.info('만들어진 시즌: ' + (seasons.length ? '' : '(없음)'))
for (const s of seasons) console.info('  ' + s.league.slug.padEnd(9) + ' 번호 ' + s.number + ' ' + s.seasonType)
await prisma.$disconnect()
