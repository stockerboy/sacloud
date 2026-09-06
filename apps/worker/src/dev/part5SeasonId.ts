import { prisma } from '@sacloud/db'
const r = await prisma.$queryRawUnsafe<Array<{ league: string; num: string; n: number }>>(`
  SELECT l.slug AS league, COALESCE(s.number::text,'★없음(null)★') AS num, COUNT(*)::int AS n
    FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
    LEFT JOIN "Season" s ON s.id = m."seasonId"
   WHERE m."startAt" >= TIMESTAMP '2026-09-02 22:00:00' AND m."supersededAt" IS NULL
   GROUP BY 1,2 ORDER BY 1,2`)
console.info('  기준시각 이후 Match 의 seasonId')
for (const x of r) console.info(`  ${x.league.padEnd(8)} 시즌번호 ${x.num.padEnd(14)} ${x.n}건`)
const p = await prisma.$queryRawUnsafe<Array<{ league: string; num: string; n: number }>>(`
  SELECT l.slug AS league, COALESCE(s.number::text,'★없음(null)★') AS num, COUNT(*)::int AS n
    FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
    LEFT JOIN "Season" s ON s.id = m."seasonId"
   WHERE m."startAt" < TIMESTAMP '2026-09-02 22:00:00'
   GROUP BY 1,2 ORDER BY 1,2`)
console.info('\n  기준시각 이전 Match 의 seasonId')
for (const x of p) console.info(`  ${x.league.padEnd(8)} 시즌번호 ${x.num.padEnd(14)} ${x.n}건`)
await prisma.$disconnect()
