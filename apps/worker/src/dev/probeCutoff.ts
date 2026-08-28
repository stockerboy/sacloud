/** 임시 조사 — 하루치 새 경기에 해당하는 ingestedAt 컷오프를 찾는다. 읽기만 한다. */
import { prisma } from '@sacloud/db'

const WANT: Record<string, number> = { supply: 46, daerule: 2, sanply: 114 }

async function main() {
  for (const [slug, n] of Object.entries(WANT)) {
    const league = await prisma.league.findUnique({ where: { slug }, select: { id: true } })
    if (!league) continue
    const rows = await prisma.match.findMany({
      where: { leagueId: league.id, origin: '3rd.supply' },
      select: { ingestedAt: true },
      orderBy: { ingestedAt: 'desc' },
      take: n,
    })
    const cutoff = rows[rows.length - 1]?.ingestedAt
    const after = await prisma.match.count({
      where: { leagueId: league.id, origin: '3rd.supply', ingestedAt: { gte: cutoff } },
    })
    console.log(`${slug}: 목표 ${n} → cutoff ${cutoff?.toISOString()} · 실제 대상 ${after}`)
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
