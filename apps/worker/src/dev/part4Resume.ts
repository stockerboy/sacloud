/** ★수집이 이어지는지 볼 기준선★ (2026-09-06 · Part 4 최종확인). ★읽기만 한다.★ */
import { prisma } from '@sacloud/db'
const CUT = "TIMESTAMP '2026-09-02 22:00:00'"
const [r] = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
  SELECT
    (SELECT COUNT(*)::int FROM "BarracksClanMatchRaw")                                  AS "원문",
    (SELECT MAX("fetchedAt") FROM "BarracksClanMatchRaw")                               AS "원문마지막",
    (SELECT COUNT(*)::int FROM "BarracksBattleLogRaw")                                  AS "배틀로그",
    (SELECT COUNT(*)::int FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
      WHERE l.slug='nolink' AND m.origin='nexon_barracks' AND m."startAt" >= ${CUT})    AS "IPL신규",
    (SELECT COUNT(*)::int FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
      WHERE l.slug='supply' AND m.origin='nexon_barracks' AND m."startAt" >= ${CUT})    AS "SPL신규",
    (SELECT COUNT(*)::int FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
      WHERE l.slug='sanply' AND m.origin='nexon_barracks' AND m."startAt" >= ${CUT})    AS "열산신규",
    (SELECT COUNT(*)::int FROM "Match" WHERE origin='3rd.supply' AND "startAt" >= ${CUT}) AS "미러신규",
    (SELECT COUNT(*)::int FROM "Match" WHERE "startAt" < ${CUT})                        AS "과거경기",
    (SELECT COUNT(*)::int FROM "MatchPlayerStat" s JOIN "Match" m ON m.id=s."matchId"
      WHERE m."startAt" < ${CUT})                                                       AS "과거참가기록",
    (SELECT COUNT(*)::int FROM "LeaguePlayerSeason")                                    AS "근본시즌행"`)
for (const [k, v] of Object.entries(r ?? {}))
  console.info(`  ${k.padEnd(12)} ${v instanceof Date ? v.toISOString() : String(v)}`)
await prisma.$disconnect()
