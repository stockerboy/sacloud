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
  await prisma.$disconnect()
}
void main()
