/** 감점·무기별 킬데스 진단 — 읽기만 한다. */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  const league = await prisma.league.findUnique({ where: { slug: 'supply' }, select: { id: true } })
  if (!league) return

  console.log('## 상위 10명 — 마지막 경기 · 감점')
  const top = await prisma.leaguePlayer.findMany({
    where: { leagueId: league.id, placement: false },
    orderBy: [{ rating: 'desc' }, { id: 'asc' }],
    take: 10,
    select: {
      rating: true,
      internalRating: true,
      activityPenalty: true,
      lastRatedAt: true,
      win: true,
      lose: true,
      kill: true,
      death: true,
      player: { select: { name: true } },
      weaponStats: {
        select: { weapon: true, games: true, knownStatGames: true, kill: true, death: true, ratingDelta: true },
      },
    },
  })
  console.table(
    top.map((r) => ({
      선수: r.player.name,
      점수: r.rating,
      내부: Math.round(r.internalRating),
      감점: Math.round(r.activityPenalty),
      '마지막 경기': r.lastRatedAt ? r.lastRatedAt.toISOString().slice(0, 10) : '없음',
      판수: r.win + r.lose,
      '누적 킬': r.kill,
      '누적 데스': r.death,
    })),
  )

  console.log('\n## 상위 5명 — 무기별 기록')
  for (const r of top.slice(0, 5)) {
    console.log(`\n[${r.player.name}]`)
    console.table(
      r.weaponStats.map((w) => ({
        무기: w.weapon === 1 ? '스나' : '라플',
        판수: w.games,
        'KDA 아는 판': w.knownStatGames,
        킬: w.kill,
        데스: w.death,
        증감: w.ratingDelta,
      })),
    )
  }

  console.log('\n## 시즌0 창에서 킬/데스를 아는 참가행 비율')
  const known = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT COUNT(*)::int AS "참가행",
           COUNT(s.kill)::int AS "킬 있음",
           COUNT(s.weapon)::int AS "무기 있음",
           COUNT(*) FILTER (WHERE s.kill IS NOT NULL AND s.weapon IS NOT NULL)::int AS "둘 다 있음"
      FROM "MatchPlayerStat" s JOIN "Match" m ON m.id = s."matchId"
     WHERE m."leagueId" = ${league.id} AND m.origin = '3rd.supply'
       AND m."startAt" >= '2026-01-01' AND m."startAt" < '2026-07-01'`
  console.table(known)

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
