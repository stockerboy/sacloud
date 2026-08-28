/** 추가 진단 — 읽기 전용. 특정 sourcePlayerId / 닉네임 추적. */
import { prisma } from '@sacloud/db'

const LEAGUE = 'supply'

async function main(): Promise<void> {
  const league = await prisma.league.findUniqueOrThrow({ where: { slug: LEAGUE } })

  console.log('## sourcePlayerId 1561236212 / 705646627 를 가진 Player')
  const byS = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT p.id, p.name, p.origin, p."sourcePlayerId",
           (SELECT COUNT(*) FROM "MatchPlayerStat" s JOIN "Match" m ON m.id=s."matchId"
             WHERE s."playerId"=p.id AND m."leagueId"=${league.id})::int AS stats
      FROM "Player" p WHERE p."sourcePlayerId" IN ('1561236212','705646627')`
  console.table(byS)

  console.log('\n## huwho LeaguePlayer 집계 (랭킹에 보이는 값)')
  const lp = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT lp.id, p.name, p.id AS "playerId", p."sourcePlayerId", lp.rating, lp.win, lp.lose,
           lp.kill, lp.death, lp."mvpCount", lp.placement, lp."sourceLeaguePlayerId"
      FROM "LeaguePlayer" lp JOIN "Player" p ON p.id=lp."playerId"
     WHERE lp."leagueId"=${league.id} AND p.name IN ('huwho','Neronator')`
  console.table(lp)

  console.log('\n## Player.origin 분포 (supply 리그 LeaguePlayer 보유)')
  const byOrigin = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT p.origin, COUNT(*)::int AS players,
           COUNT(p."sourcePlayerId")::int AS "withSourceId"
      FROM "Player" p
     WHERE EXISTS (SELECT 1 FROM "LeaguePlayer" lp WHERE lp."playerId"=p.id AND lp."leagueId"=${league.id})
     GROUP BY p.origin`
  console.table(byOrigin)

  console.log('\n## LeaguePlayer 전체 / sourceLeaguePlayerId 보유')
  const lpAll = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT COUNT(*)::int AS total,
           COUNT("sourceLeaguePlayerId")::int AS "withSourceId",
           COUNT(*) FILTER (WHERE win=0 AND lose=0)::int AS "zeroRecord"
      FROM "LeaguePlayer" WHERE "leagueId"=${league.id}`
  console.table(lpAll)

  console.log('\n## MatchPlayerStat 이 붙은 Player 중 LeaguePlayer 가 없는 것')
  const orphan = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT COUNT(DISTINCT s."playerId")::int AS "playersWithStats",
           COUNT(DISTINCT s."playerId") FILTER (
             WHERE NOT EXISTS (SELECT 1 FROM "LeaguePlayer" lp
                                WHERE lp."playerId"=s."playerId" AND lp."leagueId"=${league.id}))::int AS "noLeaguePlayer"
      FROM "MatchPlayerStat" s JOIN "Match" m ON m.id=s."matchId"
     WHERE m."leagueId"=${league.id}`
  console.table(orphan)

  console.log('\n## huwho 가 실제로 뛴 경기 (경기 참가 이름 기준 아님 — playerId 기준)')
  for (const pid of ['OBS-a7d2ab22a864bd2c7e59db70', 'OBS-d0d0f16db3068ebb2ec468f2']) {
    const r = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT m.origin, COUNT(*)::int AS stats FROM "MatchPlayerStat" s
        JOIN "Match" m ON m.id=s."matchId"
       WHERE s."playerId"=${pid} AND m."leagueId"=${league.id} GROUP BY m.origin`
    console.log(pid, r)
  }

  console.log('\n## 미러 경기 한 건 샘플 — 증감/ MVP')
  const sample = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT m.id, m."winnerSide", m."redSourceRating", m."redSourceRatingUpdate",
           m."blueSourceRating", m."blueSourceRatingUpdate", m."mvpPlayerId"
      FROM "Match" m WHERE m."leagueId"=${league.id} AND m.origin='3rd.supply'
        AND m."redSourceRatingUpdate" IS NOT NULL
     ORDER BY m."startAt" DESC LIMIT 3`
  console.table(sample)
  for (const s of sample) {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT s.side, p.name, s."sourceRating", s."sourceRatingDelta", s.mvp, s.kill, s.death
        FROM "MatchPlayerStat" s JOIN "Player" p ON p.id=s."playerId"
       WHERE s."matchId"=${String(s.id)} ORDER BY s.side, s.kill DESC NULLS LAST`
    console.log('경기', s.id)
    console.table(rows)
  }

  await prisma.$disconnect()
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
