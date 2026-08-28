/** 병합 근거 진단 — 읽기 전용. 남은 넥슨 잔재 행이 미러의 누구인지 경기로 대조한다. */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  const league = await prisma.league.findUniqueOrThrow({ where: { slug: 'supply' } })

  console.log('## Neronator — 전 리그')
  const nero = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT p.id, p.name, p.origin, p."sourcePlayerId", l.slug, lp.rating, lp.win, lp.lose
      FROM "Player" p JOIN "LeaguePlayer" lp ON lp."playerId"=p.id JOIN "League" l ON l.id=lp."leagueId"
     WHERE p.name ILIKE '%neronator%'`
  console.table(nero)

  console.log('\n## sourcePlayerId 없는 nexon Player 48 — 이름·판수')
  const left = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT p.id, p.name, lp.rating, lp.win+lp.lose AS games,
           (SELECT COUNT(*) FROM "MatchPlayerStat" s WHERE s."playerId"=p.id)::int AS stats
      FROM "Player" p JOIN "LeaguePlayer" lp ON lp."playerId"=p.id AND lp."leagueId"=${league.id}
     WHERE p.origin='nexon' AND p."sourcePlayerId" IS NULL
     ORDER BY lp.rating DESC`
  console.table(left)

  console.log('\n## 넥슨 경기 ↔ 미러 경기 중복 여부 (같은 sourceMatchId / id)')
  const overlap = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT COUNT(*)::int AS "nexon경기",
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM "Match" x WHERE x.origin='3rd.supply'
               AND x."leagueId"=n."leagueId"
               AND COALESCE(x."sourceMatchId", x.id) = COALESCE(n."sourceMatchId", n.id)))::int AS "미러에도 있음"
      FROM "Match" n WHERE n.origin='nexon'`
  console.table(overlap)

  console.log('\n## huwho 의 넥슨 경기 3건 — 같은 경기번호의 미러 라인업')
  const hus = await prisma.$queryRaw<Array<{ matchId: string; sourceMatchId: string | null }>>`
    SELECT s."matchId", m."sourceMatchId" FROM "MatchPlayerStat" s JOIN "Match" m ON m.id=s."matchId"
     WHERE s."playerId"='OBS-a7d2ab22a864bd2c7e59db70'`
  console.table(hus)
  for (const h of hus) {
    const mirror = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT m.id, m.origin, p.name, s.side, s.kill, s.death
        FROM "Match" m JOIN "MatchPlayerStat" s ON s."matchId"=m.id JOIN "Player" p ON p.id=s."playerId"
       WHERE COALESCE(m."sourceMatchId", m.id)=${h.sourceMatchId ?? h.matchId}
       ORDER BY m.origin, s.side, s.kill DESC NULLS LAST`
    console.log('경기번호', h.sourceMatchId ?? h.matchId)
    console.table(mirror)
  }

  console.log('\n## NexonNickname 으로 huwho ↔ 후후시치 를 잇는 근거가 있는가')
  const nn = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT * FROM "NexonNickname" WHERE nickname IN ('huwho','후후시치') LIMIT 20`
  console.table(nn)

  console.log('\n## 라인업 중복 이름 741건 샘플')
  const dup = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT s."matchId", p.name, COUNT(*)::int AS c,
           string_agg(p.id, ' | ') AS ids, string_agg(COALESCE(p."sourcePlayerId",'-'), ' | ') AS srcs
      FROM "MatchPlayerStat" s JOIN "Player" p ON p.id=s."playerId"
     GROUP BY s."matchId", p.name HAVING COUNT(*)>1 LIMIT 10`
  console.table(dup)

  await prisma.$disconnect()
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
