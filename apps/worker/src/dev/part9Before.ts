/** ★자연 회차 전 값을 박아 둔다★ (2026-09-06 · Part 9 ⑥). ★읽기만 한다.★ */
import { prisma } from '@sacloud/db'
const CUT = "TIMESTAMP '2026-09-02 22:00:00'"
const rows = await prisma.$queryRawUnsafe<
  Array<{ slug: string; ranked: number; sumWin: number; sumKill: number; lastUpdated: Date | null; weapon: number }>
>(`
  SELECT l.slug,
         COUNT(*) FILTER (WHERE NOT lp.placement)::int      AS ranked,
         COALESCE(SUM(lp.win),0)::int                       AS "sumWin",
         COALESCE(SUM(lp.kill),0)::int                      AS "sumKill",
         MAX(lp."updatedAt")                                AS "lastUpdated",
         (SELECT COUNT(*)::int FROM "LeaguePlayerWeaponStat" ws
            JOIN "LeaguePlayer" lp2 ON lp2.id = ws."leaguePlayerId"
           WHERE lp2."leagueId" = l.id)                     AS weapon
    FROM "LeaguePlayer" lp JOIN "League" l ON l.id = lp."leagueId"
   WHERE l.slug IN ('nolink','supply','sanply') GROUP BY 1, l.id ORDER BY 1`)
for (const r of rows)
  console.info(
    `  ${r.slug.padEnd(8)} 랭킹 ${String(r.ranked).padStart(5)}명 · 승합 ${String(r.sumWin).padStart(6)} · ` +
      `킬합 ${String(r.sumKill).padStart(7)} · 무기행 ${String(r.weapon).padStart(5)} · 갱신 ${r.lastUpdated?.toISOString().slice(0, 19) ?? '-'}`,
  )
const [g] = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
  SELECT (SELECT COUNT(*)::int FROM "Match" WHERE origin='3rd.supply' AND "startAt" >= ${CUT}) AS "미러신규",
         (SELECT COUNT(*)::int FROM "LeaguePlayerSeason" p JOIN "Season" s ON s.id=p."seasonId" WHERE s.number=-107) AS "시즌7",
         (SELECT COUNT(*)::int FROM "LeaguePlayerSeason" p JOIN "Season" s ON s.id=p."seasonId" WHERE s.number<-100 AND s.number<>-107) AS "시즌1_6",
         (SELECT COUNT(*)::int FROM "Match" WHERE "startAt" < ${CUT}) AS "과거경기",
         ("lastAppliedStartedAt")::text AS "마지막쓴판"
    FROM "CollectorLease" WHERE name='season0-apply'`)
console.info(`\n  ${JSON.stringify(g)}`)
await prisma.$disconnect()
