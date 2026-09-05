/** ★넣기 전/후를 같은 자로 잰다★ (2026-09-05 · Part 4). ★읽기만 한다.★ */
import { prisma } from '@sacloud/db'
const CUT = "TIMESTAMP '2026-09-02 22:00:00'"
const [r] = await prisma.$queryRawUnsafe<Array<Record<string, number>>>(`
  SELECT
    (SELECT COUNT(*)::int FROM "MatchPlayerStat" s JOIN "Match" m ON m.id=s."matchId"
      WHERE m."startAt" <  ${CUT})                                        AS "과거참가기록",
    (SELECT COUNT(*)::int FROM "MatchPlayerStat" s JOIN "Match" m ON m.id=s."matchId"
      WHERE m."startAt" >= ${CUT})                                        AS "신규참가기록",
    (SELECT COUNT(*)::int FROM (SELECT "matchId" FROM "MatchPlayerStat"
      GROUP BY 1 HAVING COUNT(*) > 10) t)                                 AS "열명넘는경기",
    (SELECT COUNT(*)::int FROM (SELECT "matchId","playerId" FROM "MatchPlayerStat"
      GROUP BY 1,2 HAVING COUNT(*) > 1) t)                                AS "같은선수두번",
    (SELECT COUNT(*)::int FROM "Match" WHERE origin='3rd.supply' AND "startAt" >= ${CUT}) AS "미러신규",
    (SELECT COUNT(*)::int FROM "Match" WHERE "startAt" < ${CUT})          AS "과거경기",
    (SELECT COUNT(*)::int FROM "LeaguePlayerSeason")                      AS "근본시즌행"`)
for (const [k, v] of Object.entries(r ?? {})) console.info(`  ${k.padEnd(14)} ${v}`)
await prisma.$disconnect()
