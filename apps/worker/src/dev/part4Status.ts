/** ★라인업 상태가 적히고 있나★ (2026-09-06). ★읽기만 한다.★ */
import { prisma } from '@sacloud/db'
const CUT = "TIMESTAMP '2026-09-02 22:00:00'"
const r = await prisma.$queryRawUnsafe<
  Array<{ slug: string; status: string | null; reason: string | null; n: number }>
>(`
  SELECT l.slug, m."lineupStatus" AS status, m."lineupSkipReason" AS reason, COUNT(*)::int AS n
  FROM "Match" m JOIN "League" l ON l.id = m."leagueId"
  WHERE m."lineupStatus" IS NOT NULL GROUP BY 1,2,3 ORDER BY 1,2,3`)
console.info('  리그      상태          사유                  줄')
for (const x of r)
  console.info(
    `  ${x.slug.padEnd(8)} ${(x.status ?? '-').padEnd(12)} ${(x.reason ?? '-').padEnd(20)} ${x.n}`,
  )
const [past] = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
  `SELECT COUNT(*)::int AS n FROM "Match" WHERE "lineupStatus" IS NOT NULL AND "startAt" < ${CUT}`)
console.info(`\n  ★과거 경기에 상태가 적힌 줄★ ${past?.n ?? 0}개 (0 이어야 한다)`)
await prisma.$disconnect()
