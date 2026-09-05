import { prisma } from '@sacloud/db'
const r = await prisma.$queryRawUnsafe(`
  SELECT c.name, COUNT(DISTINCT c.id)::int AS clan_rows,
         STRING_AGG(DISTINCT l.slug, '+' ORDER BY l.slug) AS leagues,
         STRING_AGG(DISTINCT c.slug, ' | ') AS clan_slugs
  FROM "Clan" c JOIN "LeagueClan" lc ON lc."clanId"=c.id JOIN "League" l ON l.id=lc."leagueId"
  WHERE l.slug IN ('nolink','supply','sanply') AND lc."expelledAt" IS NULL
  GROUP BY c.name HAVING COUNT(DISTINCT l.slug) > 1
  ORDER BY c.name`)
console.info('★이름으로 묶으면 여러 리그로 보이는 곳★')
console.info(JSON.stringify(r, null, 1))
const byId = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*)::int AS n FROM (
    SELECT lc."clanId" FROM "LeagueClan" lc JOIN "League" l ON l.id=lc."leagueId"
    WHERE l.slug IN ('nolink','supply','sanply') AND lc."expelledAt" IS NULL
    GROUP BY 1 HAVING COUNT(DISTINCT lc."leagueId") > 1) t`)
console.info('\n★클랜 id 로 묶으면★ ' + JSON.stringify(byId))
await prisma.$disconnect()
