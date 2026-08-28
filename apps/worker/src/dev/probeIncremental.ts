/** 임시 조사 스크립트 — 증분 동기화 설계용 실측. 읽기만 한다. */
import { prisma } from '@sacloud/db'

async function main() {
  const leagues = await prisma.league.findMany({ select: { id: true, slug: true } })
  const now = new Date()

  for (const league of leagues) {
    const count = await prisma.match.count({
      where: { leagueId: league.id, origin: '3rd.supply' },
    })
    if (count === 0) continue
    console.log(`\n=== ${league.slug} · 미러 경기 ${count} ===`)

    const t0 = Date.now()
    const red = await prisma.match.groupBy({
      by: ['redLeagueClanId'],
      where: { leagueId: league.id, origin: '3rd.supply' },
      _max: { startAt: true },
    })
    const blue = await prisma.match.groupBy({
      by: ['blueLeagueClanId'],
      where: { leagueId: league.id, origin: '3rd.supply' },
      _max: { startAt: true },
    })
    console.log(`groupBy 2회 ${Date.now() - t0}ms · red ${red.length} · blue ${blue.length}`)

    const last = new Map<string, Date>()
    for (const row of red) {
      const at = row._max.startAt
      if (at && (!last.has(row.redLeagueClanId) || last.get(row.redLeagueClanId)! < at))
        last.set(row.redLeagueClanId, at)
    }
    for (const row of blue) {
      const at = row._max.startAt
      if (at && (!last.has(row.blueLeagueClanId) || last.get(row.blueLeagueClanId)! < at))
        last.set(row.blueLeagueClanId, at)
    }

    const buckets = { '<6h': 0, '<24h': 0, '<3d': 0, '<7d': 0, '<21d': 0, '21d+': 0 }
    for (const at of last.values()) {
      const hours = (now.getTime() - at.getTime()) / 3600_000
      if (hours < 6) buckets['<6h'] += 1
      else if (hours < 24) buckets['<24h'] += 1
      else if (hours < 72) buckets['<3d'] += 1
      else if (hours < 168) buckets['<7d'] += 1
      else if (hours < 504) buckets['<21d'] += 1
      else buckets['21d+'] += 1
    }
    console.log('클랜별 마지막 경기 분포:', buckets, `(총 ${last.size})`)

    /* 최근 30일 경기의 시간대 분포 (KST) */
    const since = new Date(now.getTime() - 30 * 86400_000)
    const recent = await prisma.match.findMany({
      where: { leagueId: league.id, origin: '3rd.supply', startAt: { gte: since } },
      select: { startAt: true, redLeagueClanId: true, blueLeagueClanId: true },
    })
    const byHour = new Array(24).fill(0)
    const clansByHour: Set<string>[] = Array.from({ length: 24 }, () => new Set())
    for (const row of recent) {
      const kst = new Date(row.startAt.getTime() + 9 * 3600_000)
      const h = kst.getUTCHours()
      byHour[h] += 1
      clansByHour[h]!.add(row.redLeagueClanId)
      clansByHour[h]!.add(row.blueLeagueClanId)
    }
    console.log(`최근 30일 경기 ${recent.length}건 · 시간대별(KST) 일평균:`)
    console.log(
      byHour
        .map((n, h) => `${String(h).padStart(2, '0')}시=${(n / 30).toFixed(1)}(클랜${clansByHour[h]!.size})`)
        .join(' '),
    )

    /* ingestedAt 최근 분포 */
    const ing = await prisma.match.aggregate({
      where: { leagueId: league.id, origin: '3rd.supply' },
      _max: { ingestedAt: true },
      _min: { ingestedAt: true },
    })
    console.log('ingestedAt', ing._min.ingestedAt, '→', ing._max.ingestedAt)

    const lp = await prisma.leaguePlayer.count({ where: { leagueId: league.id } })
    const lc = await prisma.leagueClan.count({ where: { leagueId: league.id } })
    console.log(`LeaguePlayer ${lp} · LeagueClan ${lc}`)
  }

  const stats = await prisma.matchPlayerStat.count()
  console.log(`\n전체 MatchPlayerStat ${stats}`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
