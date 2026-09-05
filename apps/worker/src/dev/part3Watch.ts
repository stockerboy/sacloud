import { prisma } from '@sacloud/db'
const r = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
  SELECT
    (SELECT COUNT(DISTINCT "subject")::int FROM "BarracksClanMatchRaw"
       JOIN "Clan" c ON c.slug = "subject"
       JOIN "LeagueClan" lc ON lc."clanId"=c.id AND lc."expelledAt" IS NULL
       JOIN "League" l ON l.id=lc."leagueId" AND l.slug='sanply') AS "열산수집클랜",
    (SELECT COUNT(*)::int FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
      WHERE l.slug='sanply' AND m.origin='nexon_barracks' AND m."supersededAt" IS NULL) AS "열산자체수집",
    (SELECT COUNT(*)::int FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
      WHERE l.slug='supply' AND m.origin='nexon_barracks' AND m."supersededAt" IS NULL) AS "SPL자체수집",
    (SELECT COUNT(*)::int FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
      WHERE l.slug='nolink' AND m.origin='nexon_barracks' AND m."supersededAt" IS NULL) AS "IPL자체수집",
    (SELECT COUNT(*)::int FROM "Match" WHERE origin='3rd.supply'
       AND "startAt" >= TIMESTAMP '2026-09-02 22:00:00') AS "미러신규",
    (SELECT COUNT(*)::int FROM "BarracksClanMatchRaw") AS "원문"`)
console.info(JSON.stringify(r[0]))
await prisma.$disconnect()
