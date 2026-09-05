/** ★plimit(한 팀 인원)이 리그마다 어떤 값인가★ (2026-09-05). ★읽기만 한다.★ */
import { prisma } from '@sacloud/db'
const CUT = "TIMESTAMP '2026-09-02 22:00:00'"
const rows = await prisma.$queryRawUnsafe<
  Array<{ slug: string; plimit: string | null; n: number; withStat: number }>
>(`
  SELECT l.slug, r."payload"->>'plimit' AS plimit, COUNT(DISTINCT m.id)::int AS n,
         COUNT(DISTINCT m.id) FILTER (WHERE x."matchId" IS NOT NULL)::int AS "withStat"
  FROM "Match" m JOIN "League" l ON l.id = m."leagueId"
  JOIN "BarracksClanMatchRaw" r ON r."matchKey" = m."sourceMatchId" AND r."status"='ok'
  LEFT JOIN (SELECT DISTINCT "matchId" FROM "MatchPlayerStat") x ON x."matchId" = m.id
  WHERE m."startAt" >= ${CUT} AND m."supersededAt" IS NULL AND m.origin='nexon_barracks'
    AND l.slug IN ('nolink','supply','sanply')
  GROUP BY 1,2 ORDER BY 1,2`)
console.info('  리그      plimit  경기수  라인업 있는 것')
for (const r of rows)
  console.info(
    `  ${r.slug.padEnd(8)} ${String(r.plimit ?? '(없음)').padStart(6)} ${String(r.n).padStart(7)} ${String(r.withStat).padStart(14)}`,
  )
console.info('\n  ★plimit 은 한 팀 인원이다 — 10 이면 5대5, 12 면 6대6★')
await prisma.$disconnect()
