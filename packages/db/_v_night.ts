import { prisma } from '@sacloud/db'
const INIT = 3000
async function main() {
  console.log('=== 잰 것: 운영 DB(Supabase) 의 현재 상태. 로그가 아니라 행을 센다 ===\n')
  const leagues = await prisma.league.findMany({ select: { id: true, slug: true, name: true } })
  console.log('--- 1) 리그별 LeaguePlayer (개인랭킹 모집단은 placement=false) ---')
  for (const l of leagues) {
    const total = await prisma.leaguePlayer.count({ where: { leagueId: l.id } })
    const shown = await prisma.leaguePlayer.count({ where: { leagueId: l.id, placement: false } })
    const moved = await prisma.leaguePlayer.count({ where: { leagueId: l.id, rating: { not: INIT } } })
    const movedShown = await prisma.leaguePlayer.count({ where: { leagueId: l.id, placement: false, rating: { not: INIT } } })
    const agg = await prisma.leaguePlayer.aggregate({ where: { leagueId: l.id, placement: false }, _min: { rating: true }, _max: { rating: true }, _avg: { rating: true } })
    const played = await prisma.leaguePlayer.count({ where: { leagueId: l.id, placementPlayed: { gt: 0 } } })
    console.log(`  ${l.slug.padEnd(8)} (${l.name}) 전체 ${total} · 노출 ${shown} · rating≠3000 ${moved} (노출 중 ${movedShown}) · placementPlayed>0 ${played}`)
    console.log(`           노출 선수 rating  최저 ${agg._min.rating} · 평균 ${agg._avg.rating?.toFixed(1)} · 최고 ${agg._max.rating}`)
  }

  console.log('\n--- 2) 리그별 LeagueClan ---')
  for (const l of leagues) {
    const total = await prisma.leagueClan.count({ where: { leagueId: l.id } })
    const shown = await prisma.leagueClan.count({ where: { leagueId: l.id, placement: false } })
    const moved = await prisma.leagueClan.count({ where: { leagueId: l.id, rating: { not: INIT } } })
    const agg = await prisma.leagueClan.aggregate({ where: { leagueId: l.id, placement: false }, _min: { rating: true }, _max: { rating: true } })
    console.log(`  ${l.slug.padEnd(8)} 전체 ${total} · 노출 ${shown} · rating≠3000 ${moved} · 노출 rating ${agg._min.rating}~${agg._max.rating}`)
  }

  console.log('\n--- 3) IPL(nolink) 경기·참가기록 ---')
  const nolink = leagues.find(l => l.slug === 'nolink')!
  const byOrigin = await prisma.$queryRawUnsafe<any[]>(
    `SELECT m."origin", COUNT(DISTINCT m.id)::int AS matches, COUNT(s.id)::int AS stats, COUNT(DISTINCT s."playerId")::int AS players
     FROM "Match" m LEFT JOIN "MatchPlayerStat" s ON s."matchId" = m.id
     WHERE m."leagueId" = $1 GROUP BY m."origin"`, nolink.id)
  console.log('  origin 별:', byOrigin)
  const totMatch = await prisma.match.count({ where: { leagueId: nolink.id } })
  const totStat = await prisma.matchPlayerStat.count({ where: { match: { leagueId: nolink.id } } })
  const distinct = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(DISTINCT s."playerId")::int AS n FROM "MatchPlayerStat" s JOIN "Match" m ON m.id=s."matchId" WHERE m."leagueId"=$1`, nolink.id)
  console.log(`  합계 경기 ${totMatch} · 참가기록 ${totStat} · 서로 다른 선수 ${distinct[0].n}`)

  console.log('\n--- 4) Player origin 분포 ---')
  const po = await prisma.$queryRawUnsafe<any[]>(`SELECT "origin", COUNT(*)::int AS n FROM "Player" GROUP BY "origin" ORDER BY n DESC`)
  console.log('  ', po)

  console.log('\n--- 5) 중복 선수 검사 ---')
  const dupName = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "name", COUNT(*)::int AS n, array_agg(DISTINCT "origin") AS origins
     FROM "Player" GROUP BY "name" HAVING COUNT(*) > 1 ORDER BY n DESC LIMIT 15`)
  console.log(`  같은 이름이 2행 이상인 경우: ${dupName.length ? dupName.length + '건(상위 15)' : '없음'}`)
  for (const d of dupName) console.log(`    "${d.name}" ${d.n}행 origins=${d.origins}`)
  const dupNameTotal = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS groups, COALESCE(SUM(c-1),0)::int AS extra FROM (SELECT COUNT(*) AS c FROM "Player" GROUP BY "name" HAVING COUNT(*)>1) t`)
  console.log(`  이름 중복 그룹 ${dupNameTotal[0].groups} · 초과 행 ${dupNameTotal[0].extra}`)
  const dupSrc = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS n FROM (SELECT "sourcePlayerId" FROM "Player" WHERE "sourcePlayerId" IS NOT NULL GROUP BY "sourcePlayerId" HAVING COUNT(*)>1) t`)
  console.log(`  sourcePlayerId 중복: ${dupSrc[0].n}`)
  const dupOuid = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS n FROM (SELECT "nexonOuid" FROM "Player" WHERE "nexonOuid" IS NOT NULL GROUP BY "nexonOuid" HAVING COUNT(*)>1) t`)
  console.log(`  nexonOuid 중복: ${dupOuid[0].n}`)
  // 같은 경기에 같은 선수가 두 번
  const dupInMatch = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS n FROM (SELECT "matchId","playerId" FROM "MatchPlayerStat" GROUP BY 1,2 HAVING COUNT(*)>1) t`)
  console.log(`  ★같은 경기에 같은 선수가 두 행: ${dupInMatch[0].n}`)
  // 같은 리그에 같은 선수 두 번
  const dupLP = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS n FROM (SELECT "leagueId","playerId" FROM "LeaguePlayer" GROUP BY 1,2 HAVING COUNT(*)>1) t`)
  console.log(`  같은 리그에 같은 선수 두 행: ${dupLP[0].n}`)

  console.log('\n--- 6) PlayerPositionProfile 연결 ---')
  const ppp = await prisma.playerPositionProfile.count()
  const linked = await prisma.playerPositionProfile.count({ where: { playerId: { not: null } } })
  const dist = await prisma.playerPositionProfile.findMany({ where: { playerId: { not: null } }, select: { playerId: true }, distinct: ['playerId'] })
  console.log(`  전체 ${ppp} · playerId 연결 ${linked} · 고유 선수 ${dist.length}`)
}
main().finally(() => prisma.$disconnect())
