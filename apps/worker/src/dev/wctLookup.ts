/** recent.wct- 후보를 우리 DB 에서 찾는다 (읽기 전용 · 임시) */
import { prisma } from '@sacloud/db'
async function main(): Promise<void> {
  const rows = await prisma.clan.findMany({
    where: { name: { contains: 'recent', mode: 'insensitive' } },
    select: { id: true, slug: true, name: true, category: true, tier: true },
  })
  for (const r of rows) {
    const games = await prisma.leagueClan.findMany({
      where: { clanId: r.id },
      select: { id: true, league: { select: { slug: true } } },
    })
    const ids = games.map((g) => g.id)
    const n = ids.length
      ? await prisma.match.count({
          where: { OR: [{ redLeagueClanId: { in: ids } }, { blueLeagueClanId: { in: ids } }] },
        })
      : 0
    console.info(
      `${r.name.padEnd(16)} slug=${r.slug.padEnd(18)} category=${r.category} tier=${r.tier ?? '-'} 리그=${games.map((g) => g.league.slug).join(',') || '없음'} 경기=${n}`,
    )
  }
  console.info(`\n총 ${rows.length}곳`)
}
main().catch((e) => console.error(String(e).slice(0, 400))).finally(() => prisma.$disconnect())
