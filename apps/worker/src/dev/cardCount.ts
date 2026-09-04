import { prisma } from '@sacloud/db'
const n = await prisma.leaguePlayerSeason.count()
const s = await prisma.season.count({ where: { number: { lt: -100 } } })
console.info(`LeaguePlayerSeason ${n}행 · 근본 시즌 행 ${s}개`)
await prisma.$disconnect()
