/** 시즌0 범위(2026-01-01 ~ 2026-06-30) 실측 — 읽기만 한다. */
import { prisma } from '@sacloud/db'

const START = new Date('2026-01-01T00:00:00.000Z')
const END = new Date('2026-07-01T00:00:00.000Z')

async function main(): Promise<void> {
  const leagues = await prisma.league.findMany({ select: { id: true, slug: true, name: true } })
  for (const l of leagues) {
    const total = await prisma.match.count({ where: { leagueId: l.id, origin: '3rd.supply' } })
    if (total === 0) continue
    const inWindow = await prisma.match.count({
      where: { leagueId: l.id, origin: '3rd.supply', startAt: { gte: START, lt: END } },
    })
    const players = await prisma.matchPlayerStat.findMany({
      where: { match: { leagueId: l.id, origin: '3rd.supply', startAt: { gte: START, lt: END } } },
      select: { playerId: true },
      distinct: ['playerId'],
    })
    const clans = await prisma.match.findMany({
      where: { leagueId: l.id, origin: '3rd.supply', startAt: { gte: START, lt: END } },
      select: { redLeagueClanId: true, blueLeagueClanId: true },
    })
    const clanIds = new Set(clans.flatMap((m) => [m.redLeagueClanId, m.blueLeagueClanId]))

    /* 라인업이 10명인 경기 = 우리 공식이 계산할 수 있는 경기 */
    const lineup = await prisma.$queryRaw<Array<{ n: number; matches: bigint }>>`
      SELECT n, COUNT(*) AS matches FROM (
        SELECT s."matchId", COUNT(*)::int AS n
          FROM "MatchPlayerStat" s JOIN "Match" m ON m.id = s."matchId"
         WHERE m."leagueId" = ${l.id} AND m.origin = '3rd.supply'
           AND m."startAt" >= ${START} AND m."startAt" < ${END}
         GROUP BY s."matchId") t
      GROUP BY n ORDER BY n`

    console.log(`\n=== ${l.slug} (${l.name})`)
    console.log(`  미러 경기 전체 ${total} · 시즌0 범위 ${inWindow}`)
    console.log(`  선수 ${players.length}명 · 클랜 ${clanIds.size}개`)
    console.table(lineup.map((r) => ({ '라인업 인원': r.n, 경기: Number(r.matches) })))
  }
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
