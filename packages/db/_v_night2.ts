import { prisma } from '@sacloud/db'
async function main() {
  const nolink = await prisma.league.findFirst({ where: { slug: 'nolink' }, select: { id: true } })
  console.log('=== A) IPL 경기 중 참가기록이 있는 경기가 몇인가 ===')
  const r = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS matches,
            COUNT(*) FILTER (WHERE s.n > 0)::int AS with_stats,
            COUNT(*) FILTER (WHERE s.n = 0)::int AS without_stats
     FROM "Match" m
     LEFT JOIN LATERAL (SELECT COUNT(*)::int AS n FROM "MatchPlayerStat" x WHERE x."matchId"=m.id) s ON true
     WHERE m."leagueId" = $1`, nolink!.id)
  console.log('  ', r[0])
  const dist = await prisma.$queryRawUnsafe<any[]>(
    `SELECT s.n AS 참가자수, COUNT(*)::int AS 경기수 FROM "Match" m
     LEFT JOIN LATERAL (SELECT COUNT(*)::int AS n FROM "MatchPlayerStat" x WHERE x."matchId"=m.id) s ON true
     WHERE m."leagueId"=$1 GROUP BY s.n ORDER BY s.n`, nolink!.id)
  console.log('   경기당 참가기록 수 분포:', dist)

  console.log('\n=== B) 래더가 언제 계산됐나 (lastRatedAt) ===')
  const lr = await prisma.$queryRawUnsafe<any[]>(
    `SELECT l."slug", COUNT(*)::int AS n,
            MIN(lp."lastRatedAt") AS 가장이른, MAX(lp."lastRatedAt") AS 가장늦은,
            COUNT(*) FILTER (WHERE lp."lastRatedAt" IS NULL)::int AS null인행
     FROM "LeaguePlayer" lp JOIN "League" l ON l.id = lp."leagueId" GROUP BY l."slug"`)
  console.log('  ', lr)
  const cfg = await prisma.$queryRawUnsafe<any[]>(
    `SELECT l."slug", rc."formulaVersion", rc."divisionKey", rc."effectiveFrom" FROM "RatingConfig" rc JOIN "League" l ON l.id=rc."leagueId"`)
  console.log('  RatingConfig:', cfg)

  console.log('\n=== C) nexon_barracks 선수가 기존 선수와 이름이 겹치는가 ===')
  const col = await prisma.$queryRawUnsafe<any[]>(
    `SELECT p1."name", p1."origin" AS o1, p2."origin" AS o2, p1."sourcePlayerId" AS s1, p2."sourcePlayerId" AS s2
     FROM "Player" p1 JOIN "Player" p2 ON p1."name" = p2."name" AND p1.id < p2.id
     WHERE p1."origin" = 'nexon_barracks' OR p2."origin" = 'nexon_barracks' LIMIT 20`)
  console.log(`  nexon_barracks 가 낀 이름 충돌: ${col.length}건 (상위 20)`)
  for (const c of col) console.log(`    "${c.name}" ${c.o1}(${c.s1}) ↔ ${c.o2}(${c.s2})`)
  const colN = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS n FROM "Player" p1 JOIN "Player" p2 ON p1."name"=p2."name" AND p1.id<p2.id
     WHERE p1."origin"='nexon_barracks' OR p2."origin"='nexon_barracks'`)
  console.log(`  총 ${colN[0].n}건`)

  console.log('\n=== D) IPL LeaguePlayer 는 어디서 왔나 — Player.origin 별 ===')
  const src = await prisma.$queryRawUnsafe<any[]>(
    `SELECT p."origin", COUNT(*)::int AS n, MIN(lp."rating")::int AS 최저, MAX(lp."rating")::int AS 최고
     FROM "LeaguePlayer" lp JOIN "Player" p ON p.id=lp."playerId"
     WHERE lp."leagueId"=$1 GROUP BY p."origin"`, nolink!.id)
  console.log('  ', src)

  console.log('\n=== E) 대룰리그 래더가 이상한가 ===')
  const dr = await prisma.$queryRawUnsafe<any[]>(
    `SELECT l."slug", COUNT(*)::int AS n,
       COUNT(*) FILTER (WHERE lp."rating" < 1000)::int AS 천미만,
       COUNT(*) FILTER (WHERE lp."rating" = 0)::int AS 영점,
       MIN(lp."internalRating")::int AS 내부최저, MAX(lp."internalRating")::int AS 내부최고
     FROM "LeaguePlayer" lp JOIN "League" l ON l.id=lp."leagueId" WHERE lp."placement"=false GROUP BY l."slug"`)
  console.log('  ', dr)
}
main().finally(() => prisma.$disconnect())
