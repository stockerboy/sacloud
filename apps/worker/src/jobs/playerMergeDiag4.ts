/** 랭킹 오염 진단 — 읽기 전용. */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  const league = await prisma.league.findUniqueOrThrow({ where: { slug: 'supply' } })

  console.log('## 개인랭킹 상위 30 (rating desc) — 실제 판수와 함께')
  const top = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT p.name, p.origin, p."sourcePlayerId" IS NOT NULL AS "srcId",
           lp.rating, lp.win, lp.lose, lp.placement,
           (SELECT COUNT(*) FROM "MatchPlayerStat" s JOIN "Match" m ON m.id=s."matchId"
             WHERE s."playerId"=p.id AND m."leagueId"=${league.id})::int AS stats
      FROM "LeaguePlayer" lp JOIN "Player" p ON p.id=lp."playerId"
     WHERE lp."leagueId"=${league.id}
     ORDER BY lp.rating DESC LIMIT 30`
  console.table(top)

  console.log('\n## origin 별 rating 분포 (supply LeaguePlayer)')
  const dist = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT p.origin, p."sourcePlayerId" IS NOT NULL AS "srcId", COUNT(*)::int AS n,
           MIN(lp.rating)::int AS min, ROUND(AVG(lp.rating))::int AS avg, MAX(lp.rating)::int AS max,
           ROUND(AVG(lp.win+lp.lose))::int AS "평균판수"
      FROM "LeaguePlayer" lp JOIN "Player" p ON p.id=lp."playerId"
     WHERE lp."leagueId"=${league.id} GROUP BY 1,2 ORDER BY 3 DESC`
  console.table(dist)

  console.log('\n## 랭킹 상위 100 중 판수 10 미만')
  const junk = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT COUNT(*)::int AS n FROM (
      SELECT lp.win+lp.lose AS g FROM "LeaguePlayer" lp
       WHERE lp."leagueId"=${league.id} ORDER BY lp.rating DESC LIMIT 100) t WHERE g < 10`
  console.table(junk)

  console.log('\n## 12명 경기 샘플 — 중복 정체 확인')
  const m12 = await prisma.$queryRaw<Array<{ matchId: string }>>`
    SELECT s."matchId" FROM "MatchPlayerStat" s JOIN "Match" m ON m.id=s."matchId"
     WHERE m.origin='3rd.supply' GROUP BY s."matchId" HAVING COUNT(*)=12 LIMIT 2`
  for (const { matchId } of m12) {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT s.side, p.id AS "playerId", p.name, p.origin, p."sourcePlayerId",
             s."sourceRatingDelta", s.mvp, s.kill, s.death
        FROM "MatchPlayerStat" s JOIN "Player" p ON p.id=s."playerId"
       WHERE s."matchId"=${matchId} ORDER BY s.side, p.name`
    console.log('경기', matchId)
    console.table(rows)
  }

  await prisma.$disconnect()
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
