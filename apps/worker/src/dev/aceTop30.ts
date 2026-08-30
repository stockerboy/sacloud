/** DPL(supply) 개인랭킹 상위 30명 — 분석 정답 집단 (읽기 전용 · 임시) */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  const league = await prisma.league.findUnique({ where: { slug: 'supply' }, select: { id: true } })
  if (!league) return
  const rows = await prisma.leaguePlayer.findMany({
    where: { leagueId: league.id, placement: false },
    orderBy: { rating: 'desc' },
    take: 30,
    select: {
      playerId: true,
      rating: true,
      win: true,
      lose: true,
      player: { select: { name: true } },
      clan: { select: { name: true } },
    },
  })
  const ids = rows.map((r) => r.playerId)

  /* 라운드 복원 자료가 있는가 */
  const round = await prisma.playerRoundProfile.findMany({
    where: { playerId: { in: ids } },
    select: { playerId: true, matches: true, alone: true, outnumbered: true },
  })
  const roundBy = new Map(round.map((r) => [r.playerId, r]))

  /* 주무기 */
  const stats = await prisma.matchPlayerStat.groupBy({
    by: ['playerId', 'weapon'],
    where: { playerId: { in: ids }, weapon: { in: [0, 1] } },
    _count: { _all: true },
  })
  const w = new Map<string, { r: number; s: number }>()
  for (const s of stats) {
    const cur = w.get(s.playerId) ?? { r: 0, s: 0 }
    if (s.weapon === 0) cur.r = s._count._all
    else cur.s = s._count._all
    w.set(s.playerId, cur)
  }

  console.info('순위 닉네임              래더   승-패      주무기  라운드복원  혼자남음 둘남음  id')
  rows.forEach((r, i) => {
    const rd = roundBy.get(r.playerId)
    const ww = w.get(r.playerId) ?? { r: 0, s: 0 }
    const main = ww.s > ww.r ? '스나' : ww.r > ww.s ? '라플' : '?'
    console.info(
      `${String(i + 1).padStart(3)} ${r.player.name.padEnd(18)} ${String(r.rating).padStart(5)} ` +
        `${String(r.win).padStart(4)}-${String(r.lose).padEnd(4)} ${main}  ` +
        `${String(rd?.matches ?? 0).padStart(9)} ${String(rd?.alone ?? 0).padStart(8)} ${String(rd?.outnumbered ?? 0).padStart(6)}  ${r.playerId}`,
    )
  })
  const withRound = rows.filter((r) => (roundBy.get(r.playerId)?.matches ?? 0) > 0).length
  console.info(`\n라운드 복원 자료가 있는 사람 ${withRound}/30`)
}

main().catch((e) => console.error(String(e).slice(0, 500))).finally(() => prisma.$disconnect())
