/** IPL 참가 기록 적재 상태를 **읽기만** 한다 (D-255 후속 · 부분 적재 확인용) */
import { prisma } from '@sacloud/db'
async function main() {
  const league = await prisma.league.findUnique({ where: { slug: 'nolink' }, select: { id: true } })
  if (!league) throw new Error('nolink 없음')
  const stats = await prisma.matchPlayerStat.count({ where: { match: { leagueId: league.id } } })
  const matches = (
    await prisma.matchPlayerStat.findMany({
      where: { match: { leagueId: league.id } },
      select: { matchId: true },
      distinct: ['matchId'],
    })
  ).length
  const players = (
    await prisma.matchPlayerStat.findMany({
      where: { match: { leagueId: league.id } },
      select: { playerId: true },
      distinct: ['playerId'],
    })
  ).length
  const brk = await prisma.player.count({ where: { sourcePlayerId: { startsWith: 'BRK-' } } })
  const brkOrigin = await prisma.player.count({ where: { origin: 'nexon_barracks' } })
  const lp = await prisma.leaguePlayer.count({ where: { leagueId: league.id } })
  console.info(`nolink MatchPlayerStat  ${stats}행 · 경기 ${matches} · 선수 ${players}`)
  console.info(`Player sourcePlayerId LIKE 'BRK-%'  ${brk}명 · origin='nexon_barracks'  ${brkOrigin}명`)
  console.info(`LeaguePlayer(nolink)  ${lp}명`)

  /* 4단계(season0-apply) 뒤 대조용 — 래더가 실제로 매겨졌는지 본다 */
  if (lp > 0) {
    const agg = await prisma.leaguePlayer.aggregate({
      where: { leagueId: league.id },
      _min: { rating: true },
      _max: { rating: true },
      _avg: { rating: true },
      _sum: { win: true, lose: true, kill: true, death: true },
    })
    const placement = await prisma.leaguePlayer.count({
      where: { leagueId: league.id, placement: true },
    })
    const weapon = await prisma.leaguePlayerWeaponStat.count({
      where: { leaguePlayer: { leagueId: league.id } },
    })
    console.info(
      `  래더 ${agg._min.rating} ~ ${agg._max.rating} · 평균 ${Math.round(agg._avg.rating ?? 0)}`,
    )
    console.info(`  배치고사(placement=true)  ${placement}명 / ${lp}`)
    console.info(
      `  승 ${agg._sum.win} · 패 ${agg._sum.lose} · 킬 ${agg._sum.kill} · 데스 ${agg._sum.death}`,
    )
    console.info(`  LeaguePlayerWeaponStat  ${weapon}행`)
  }
  await prisma.$disconnect()
}
void main()
