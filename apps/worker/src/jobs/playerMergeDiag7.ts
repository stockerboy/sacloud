/** MVP 정합 진단 — 읽기 전용. */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  console.log('## 미러 경기: MVP 가 승리팀인가 / 그 팀 최다킬인가 (최근 3000경기 표본)')
  const r = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    WITH m AS (
      SELECT id, "winnerSide", "mvpPlayerId" FROM "Match"
       WHERE origin='3rd.supply' AND "mvpPlayerId" IS NOT NULL
       ORDER BY "startAt" DESC LIMIT 3000)
    SELECT COUNT(*)::int AS "표본",
           COUNT(*) FILTER (WHERE mv.side = m."winnerSide")::int AS "승리팀 MVP",
           COUNT(*) FILTER (WHERE mv.kill = top.k)::int AS "팀 최다킬 MVP",
           COUNT(*) FILTER (WHERE mv."playerId" IS NULL)::int AS "라인업에 없음"
      FROM m
      LEFT JOIN "MatchPlayerStat" mv ON mv."matchId"=m.id AND mv."playerId"=m."mvpPlayerId"
      LEFT JOIN LATERAL (SELECT MAX(s.kill) AS k FROM "MatchPlayerStat" s
                          WHERE s."matchId"=m.id AND s.side=m."winnerSide") top ON TRUE`
  console.table(r)

  console.log('\n## mvp 플래그가 경기당 정확히 1명인가')
  const c = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT n, COUNT(*)::int AS matches FROM (
      SELECT s."matchId", COUNT(*) FILTER (WHERE s.mvp IS TRUE) AS n
        FROM "MatchPlayerStat" s JOIN "Match" m ON m.id=s."matchId"
       WHERE m.origin='3rd.supply' GROUP BY s."matchId") t GROUP BY n ORDER BY n`
  console.table(c)
  await prisma.$disconnect()
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
