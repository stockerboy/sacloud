import { prisma } from '@sacloud/db'
const r = await prisma.$queryRawUnsafe(`
  SELECT g.name, COUNT(*)::int AS n FROM "Match" m
  JOIN "League" l ON l.id=m."leagueId" JOIN "GameMap" g ON g.id=m."mapId"
  WHERE l.slug='nolink' GROUP BY 1 ORDER BY 2 DESC`)
console.info(JSON.stringify(r))
await prisma.$disconnect()
