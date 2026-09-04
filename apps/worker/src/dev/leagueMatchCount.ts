import { prisma } from '@sacloud/db'
const r = await prisma.$queryRawUnsafe(
  `SELECT l.slug, COUNT(*)::int AS n FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
   WHERE l.slug IN ('supply','sanply','nolink') GROUP BY 1 ORDER BY 1`)
console.info(JSON.stringify(r))
await prisma.$disconnect()
