/**
 * 리그별 **클랜 수**를 센다 — 「고용가능 클랜」 목록 설계용 (r5). **읽기만 한다.**
 *
 * ```
 * node scripts/prod-run.mjs league-clan-count
 * ```
 *
 * 세 가지를 따로 센다. 무엇을 「전부」로 볼지 아직 안 정해졌기 때문이다:
 *   등록      LeagueClan 전량
 *   활성      clan.active = true AND expelledAt IS NULL   (지금 랭킹이 쓰는 조건 · D-124 · D-147)
 *   배치제외  거기에 placement = false 까지 (지금 랭킹이 실제로 보여 주는 수)
 */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  const leagues = await prisma.league.findMany({
    select: { id: true, slug: true, name: true, divisionCount: true },
    orderBy: { createdAt: 'asc' },
  })
  for (const league of leagues) {
    const base = { leagueId: league.id }
    const active = { ...base, clan: { active: true }, expelledAt: null }
    const [registered, activeCount, ranked, played] = await Promise.all([
      prisma.leagueClan.count({ where: base }),
      prisma.leagueClan.count({ where: active }),
      prisma.leagueClan.count({ where: { ...active, placement: false } }),
      prisma.leagueClan.count({ where: { ...active, OR: [{ win: { gt: 0 } }, { lose: { gt: 0 } }] } }),
    ])
    console.info(
      `${league.slug.padEnd(9)} ${league.name.padEnd(12)} 부리그 ${league.divisionCount} · ` +
        `등록 ${String(registered).padStart(4)} · 활성 ${String(activeCount).padStart(4)} · ` +
        `랭킹표시 ${String(ranked).padStart(4)} · 경기한곳 ${String(played).padStart(4)}`,
    )
  }
  await prisma.$disconnect()
}

void main()
