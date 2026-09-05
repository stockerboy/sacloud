/**
 * ★이번 작업이 과거를 건드리나★ (2026-09-05 · Part 4 원칙 7). ★읽기만 한다.★
 *
 * 사장님: «기준시각 이전 과거 Match 는 이번 작업에서 건드리지 마라»
 * ★말로 「안 건드린다」고 하지 않고 대상을 세어서 답한다.★
 */
import { prisma } from '@sacloud/db'
const CUT = "TIMESTAMP '2026-09-02 22:00:00'"

const rows = await prisma.$queryRawUnsafe<
  Array<{ slug: string; when: string; n: number; noStat: number }>
>(`
  SELECT l.slug,
         CASE WHEN m."startAt" >= ${CUT} THEN '기준시각 이후' ELSE '★기준시각 이전(과거)★' END AS when,
         COUNT(*)::int AS n,
         COUNT(*) FILTER (WHERE x."matchId" IS NULL)::int AS "noStat"
  FROM "Match" m
  JOIN "League" l ON l.id = m."leagueId"
  JOIN (SELECT DISTINCT "matchKey" FROM "BarracksBattleLogRaw"
        WHERE "subjectKind"='clan' AND "status"='ok') r ON r."matchKey" = m."sourceMatchId"
  LEFT JOIN (SELECT DISTINCT "matchId" FROM "MatchPlayerStat") x ON x."matchId" = m.id
  WHERE m.origin = 'nexon_barracks' AND m."supersededAt" IS NULL
    AND l.slug IN ('nolink','supply','sanply')
  GROUP BY 1,2 ORDER BY 1,2`)

console.info('══ `--all-leagues` 가 손댈 수 있는 경기 ══\n')
console.info('  리그      구간                    이어지는 경기  그중 라인업 없는 것')
for (const r of rows)
  console.info(
    `  ${r.slug.padEnd(8)} ${r.when.padEnd(22)} ${String(r.n).padStart(9)} ${String(r.noStat).padStart(14)}`,
  )
console.info(
  '\n  ★SPL·열산은 과거 경기가 원래 미러(3rd.supply) 것이라 origin 조건에서 이미 빠진다★',
)
await prisma.$disconnect()
