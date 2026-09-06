/**
 * ★불완전한 라인업이 개인 통계로 새지 않는가★ (2026-09-06 · Part 4 완료조건). ★읽기만 한다.★
 *
 * > «불완전한 라인업을 ★개인 KD / 개인 랭킹 / 선수 통계에 사용하지 않음★»
 *
 * ★말로 「안 쓴다」고 하지 않는다.★ 개인 통계의 재료는 `MatchPlayerStat` 하나뿐이므로
 * ★그 표에 줄이 없으면 새어 나갈 길 자체가 없다.★ 그것을 센다.
 */
import { prisma } from '@sacloud/db'
const CUT = "TIMESTAMP '2026-09-02 22:00:00'"

const [r] = await prisma.$queryRawUnsafe<Array<Record<string, number>>>(`
  SELECT
    (SELECT COUNT(*)::int FROM "Match" WHERE "lineupStatus"='incomplete')            AS "불완전으로 표시된 경기",
    (SELECT COUNT(*)::int FROM "Match" m
      WHERE m."lineupStatus"='incomplete'
        AND EXISTS (SELECT 1 FROM "MatchPlayerStat" s WHERE s."matchId" = m.id))     AS "그중 참가기록이 있는 경기",
    (SELECT COUNT(*)::int FROM "MatchPlayerStat" s JOIN "Match" m ON m.id = s."matchId"
      WHERE m."lineupStatus"='incomplete')                                          AS "불완전 경기에 달린 참가기록 줄",
    (SELECT COUNT(*)::int FROM "Match" WHERE "lineupStatus"='complete')              AS "완전으로 표시된 경기",
    (SELECT COUNT(*)::int FROM "Match" m
      WHERE m."lineupStatus"='complete'
        AND NOT EXISTS (SELECT 1 FROM "MatchPlayerStat" s WHERE s."matchId" = m.id)) AS "완전인데 참가기록이 없는 경기",
    (SELECT COUNT(*)::int FROM (
       SELECT s."matchId" FROM "MatchPlayerStat" s JOIN "Match" m ON m.id = s."matchId"
        WHERE m."startAt" >= ${CUT} GROUP BY 1 HAVING COUNT(*) <> 10) t)             AS "신규 경기 중 10명이 아닌 것",
    (SELECT COUNT(*)::int FROM "Match" WHERE "lineupStatus" IS NOT NULL AND "startAt" < ${CUT}) AS "과거에 상태가 적힌 줄"`)

for (const [k, v] of Object.entries(r ?? {}))
  console.info(`  ${k.padEnd(28)} ${String(v).padStart(6)}`)
console.info(
  '\n  ★「그중 참가기록이 있는 경기」가 0 이면 개인 KD·랭킹으로 샐 길이 없다.★\n' +
    '  개인 통계는 전부 `MatchPlayerStat` 에서 나온다 — 그 표에 줄이 없기 때문이다.',
)
await prisma.$disconnect()
