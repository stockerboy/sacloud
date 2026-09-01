import { prisma } from '@sacloud/db'
async function main() {
  const l = await prisma.$queryRawUnsafe<any[]>(`SELECT "slug","name","official","origin","divisionCount" FROM "League"`)
  console.log('League 행:', l)
  console.log('\n=== 이름이 겹치는 nexon_barracks 5명 — 같은 리그에 둘 다 있나 (이중계상 위험) ===')
  const names = ['빨기장인','이영빈','헌이마르','한빈','winteriz']
  for (const n of names) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT p.id, p."origin", p."sourcePlayerId",
              (SELECT string_agg(lg."slug", ',') FROM "LeaguePlayer" lp JOIN "League" lg ON lg.id=lp."leagueId" WHERE lp."playerId"=p.id) AS 리그,
              (SELECT COUNT(*)::int FROM "MatchPlayerStat" s WHERE s."playerId"=p.id) AS 참가기록
       FROM "Player" p WHERE p."name" = $1`, n)
    console.log(`  "${n}":`)
    for (const r of rows) console.log(`     ${r.origin.padEnd(15)} src=${r.sourcePlayerId} 리그=[${r.리그 ?? '-'}] 참가기록 ${r.참가기록}`)
  }
  console.log('\n=== IPL 참가기록 없는 경기 23,100건은 무엇인가 ===')
  const s = await prisma.$queryRawUnsafe<any[]>(
    `SELECT to_char(m."startAt",'YYYY-MM') AS 월, COUNT(*)::int AS n
     FROM "Match" m LEFT JOIN LATERAL (SELECT COUNT(*)::int AS c FROM "MatchPlayerStat" x WHERE x."matchId"=m.id) t ON true
     WHERE m."leagueId"=(SELECT id FROM "League" WHERE slug='nolink') AND t.c=0
     GROUP BY 1 ORDER BY 1 DESC LIMIT 8`)
  console.log('  월별:', s)
  const ex = await prisma.$queryRawUnsafe<any[]>(
    `SELECT m."sourceMatchId", m."startAt", m."redScore", m."blueScore", m."formulaVersion",
            (SELECT c."name" FROM "LeagueClan" lc JOIN "Clan" c ON c.id=lc."clanId" WHERE lc.id=m."redLeagueClanId") AS red,
            (SELECT c."name" FROM "LeagueClan" lc JOIN "Clan" c ON c.id=lc."clanId" WHERE lc.id=m."blueLeagueClanId") AS blue
     FROM "Match" m LEFT JOIN LATERAL (SELECT COUNT(*)::int AS c FROM "MatchPlayerStat" x WHERE x."matchId"=m.id) t ON true
     WHERE m."leagueId"=(SELECT id FROM "League" WHERE slug='nolink') AND t.c=0 LIMIT 5`)
  console.log('  예시 5건:', ex)
}
main().finally(() => prisma.$disconnect())
