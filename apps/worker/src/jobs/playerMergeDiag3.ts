/** 전 리그 진단 — 읽기 전용. MVP 결측 · 라인업 중복 · 증감 표기. */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  console.log('## 리그별 경기/ MVP / 증감')
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT l.slug, m.origin, COUNT(*)::int AS matches,
           COUNT(m."mvpPlayerId")::int AS "mvpId",
           COUNT(m."redSourceRatingUpdate")::int AS "redSrcUpd",
           COUNT(m."blueSourceRatingUpdate")::int AS "blueSrcUpd",
           COUNT(m."redRatingUpdate")::int AS "redOurUpd"
      FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
     GROUP BY l.slug, m.origin ORDER BY 3 DESC`
  console.table(rows)

  console.log('\n## 참가행: MVP / sourceRatingDelta 결측')
  const st = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT l.slug, m.origin, COUNT(*)::int AS stats,
           COUNT(*) FILTER (WHERE s.mvp IS TRUE)::int AS "mvpTrue",
           COUNT(*) FILTER (WHERE s.mvp IS NULL)::int AS "mvpNull",
           COUNT(s."sourceRatingDelta")::int AS "srcDelta",
           COUNT(s."ratingUpdate")::int AS "ourDelta"
      FROM "MatchPlayerStat" s JOIN "Match" m ON m.id=s."matchId"
      JOIN "League" l ON l.id=m."leagueId"
     GROUP BY l.slug, m.origin ORDER BY 3 DESC`
  console.table(st)

  console.log('\n## 라인업에 같은 이름이 두 번 나오는 경기 (중복 Player 행 증거)')
  const dupLineup = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT COUNT(*)::int AS n FROM (
      SELECT s."matchId", p.name FROM "MatchPlayerStat" s JOIN "Player" p ON p.id=s."playerId"
       GROUP BY s."matchId", p.name HAVING COUNT(*) > 1) t`
  console.table(dupLineup)

  console.log('\n## 참가자 수 분포 (미러 경기)')
  const cnt = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT c AS participants, COUNT(*)::int AS matches FROM (
      SELECT s."matchId", COUNT(*) AS c FROM "MatchPlayerStat" s
        JOIN "Match" m ON m.id=s."matchId" WHERE m.origin='3rd.supply'
       GROUP BY s."matchId") t GROUP BY c ORDER BY c`
  console.table(cnt)

  console.log('\n## 중복 그룹: sourcePlayerId 있는 행 vs 없는 행')
  const dupKind = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      COUNT(*) FILTER (WHERE "withId" > 0 AND "noId" > 0)::int AS "혼합(가짜중복 후보)",
      COUNT(*) FILTER (WHERE "withId" > 1)::int AS "sourceId 여럿(진짜 다른 사람 가능)",
      COUNT(*) FILTER (WHERE "withId" = 0)::int AS "전부 sourceId 없음"
    FROM (
      SELECT p.name,
             COUNT(*) FILTER (WHERE p."sourcePlayerId" IS NOT NULL) AS "withId",
             COUNT(*) FILTER (WHERE p."sourcePlayerId" IS NULL) AS "noId"
        FROM "Player" p GROUP BY p.name HAVING COUNT(*) > 1) t`
  console.table(dupKind)

  console.log('\n## sourcePlayerId 없는 Player 중 미러 경기 참가행이 0 인 것 (넥슨 잔재)')
  const legacy = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT p.origin, COUNT(*)::int AS players,
           SUM(CASE WHEN mirror=0 THEN 1 ELSE 0 END)::int AS "미러참가 0",
           SUM(nexon)::int AS "넥슨참가행합"
      FROM (
        SELECT p.id, p.origin,
               (SELECT COUNT(*) FROM "MatchPlayerStat" s JOIN "Match" m ON m.id=s."matchId"
                 WHERE s."playerId"=p.id AND m.origin='3rd.supply') AS mirror,
               (SELECT COUNT(*) FROM "MatchPlayerStat" s JOIN "Match" m ON m.id=s."matchId"
                 WHERE s."playerId"=p.id AND m.origin='nexon') AS nexon
          FROM "Player" p WHERE p."sourcePlayerId" IS NULL) p
     GROUP BY p.origin`
  console.table(legacy)

  await prisma.$disconnect()
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
