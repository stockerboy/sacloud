/** IPL(무소속리그 `nolink`) 현재 상태 실측 (임시 조사) */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  const league = await prisma.league.findUnique({
    where: { slug: 'nolink' },
    select: { id: true, name: true, divisionCount: true, category: true, status: true },
  })
  console.info('리그:', JSON.stringify(league))
  if (!league) return

  const clans = await prisma.leagueClan.findMany({
    where: { leagueId: league.id },
    select: { division: true, clan: { select: { slug: true, name: true, tier: true, category: true } } },
    orderBy: [{ division: 'asc' }],
  })
  console.info(`\n등록 클랜 ${clans.length}곳`)
  const byTier = new Map<number, string[]>()
  for (const c of clans) {
    const t = c.division
    byTier.set(t, [...(byTier.get(t) ?? []), c.clan.name])
  }
  for (const [t, names] of [...byTier.entries()].sort((a, b) => a[0] - b[0])) {
    console.info(`  ${t}티어 ${String(names.length).padStart(3)}곳  ${names.slice(0, 6).join(', ')}${names.length > 6 ? ' …' : ''}`)
  }

  const matches = await prisma.match.groupBy({
    by: ['origin'],
    where: { leagueId: league.id },
    _count: { _all: true },
    _min: { startAt: true },
    _max: { startAt: true },
  })
  console.info('\nIPL 경기:', JSON.stringify(matches))

  /* Clan.category=independent 인 클랜 전체 (리그 등록과 별개) */
  const indep = await prisma.clan.count({ where: { category: 'independent' } })
  const indepTier = await prisma.clan.groupBy({
    by: ['tier'],
    where: { category: 'independent' },
    _count: { _all: true },
  })
  console.info(`\nClan.category='independent' ${indep}곳 · 티어분포`, JSON.stringify(indepTier))

  /* 2026-04-01 이후 그 클랜들이 뛴 경기가 다른 리그에 얼마나 있나 */
  const since = new Date('2026-04-01T00:00:00+09:00')
  const indepClans = await prisma.clan.findMany({ where: { category: 'independent' }, select: { id: true } })
  const lcs = await prisma.leagueClan.findMany({
    where: { clanId: { in: indepClans.map((c) => c.id) } },
    select: { id: true, leagueId: true },
  })
  const lcIds = lcs.map((l) => l.id)
  const inWindow = await prisma.match.count({
    where: {
      startAt: { gte: since },
      OR: [{ redLeagueClanId: { in: lcIds } }, { blueLeagueClanId: { in: lcIds } }],
    },
  })
  console.info(`\n무소속 클랜이 뛴 2026-04-01 이후 경기 ${inWindow}건 (리그 무관)`)
}

main().catch((e) => console.error(String(e).slice(0, 600))).finally(() => prisma.$disconnect())
