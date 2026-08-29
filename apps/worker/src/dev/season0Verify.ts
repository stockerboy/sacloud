/**
 * 시즌0 반영 결과 확인 — 화면이 읽는 조건 그대로 조회한다. 읽기만 한다.
 *
 * ```bash
 * pnpm --filter @sacloud/worker exec tsx src/dev/season0Verify.ts            # supply
 * pnpm --filter @sacloud/worker exec tsx src/dev/season0Verify.ts --league sanply
 * ```
 */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  const index = process.argv.indexOf('--league')
  const slug =
    index >= 0 && process.argv[index + 1]
      ? process.argv[index + 1]!
      : (process.argv.find((a) => a.startsWith('--league='))?.split('=')[1] ?? 'supply')
  const league = await prisma.league.findUnique({ where: { slug }, select: { id: true } })
  if (!league) {
    console.log(`리그를 찾을 수 없다: ${slug}`)
    return
  }
  console.log(`리그 ${slug}`)

  const ranked = await prisma.leaguePlayer.count({
    where: { leagueId: league.id, placement: false },
  })
  const held = await prisma.leaguePlayer.count({
    where: { leagueId: league.id, placement: true },
  })
  console.log(`랭킹에 뜨는 선수 ${ranked} · 배치고사/시즌0 무경기 ${held}`)

  console.log('\n## 개인 통합 TOP 15')
  const overall = await prisma.leaguePlayer.findMany({
    where: { leagueId: league.id, placement: false },
    orderBy: [{ rating: 'desc' }, { id: 'asc' }],
    take: 15,
    select: {
      rating: true,
      win: true,
      lose: true,
      kill: true,
      death: true,
      player: { select: { name: true } },
      clan: { select: { name: true } },
    },
  })
  console.table(
    overall.map((r, i) => ({
      순위: i + 1,
      선수: r.player.name,
      클랜: r.clan?.name ?? '-',
      점수: r.rating,
      판수: r.win + r.lose,
      승률: `${((r.win / Math.max(1, r.win + r.lose)) * 100).toFixed(1)}%`,
      KD: r.death > 0 ? (r.kill / r.death).toFixed(2) : '-',
    })),
  )

  for (const [label, weapon] of [
    ['스나', 1],
    ['라플', 0],
  ] as const) {
    const rows = await prisma.leaguePlayerWeaponStat.findMany({
      where: { weapon, knownStatGames: { gt: 0 }, leaguePlayer: { leagueId: league.id, placement: false } },
      orderBy: [{ ratingDelta: 'desc' }, { leaguePlayerId: 'asc' }],
      take: 10,
      select: {
        ratingDelta: true,
        win: true,
        lose: true,
        leaguePlayer: { select: { rating: true, player: { select: { name: true } } } },
      },
    })
    console.log(`\n## 개인 ${label} TOP 10 (증감 순)`)
    console.table(
      rows.map((r, i) => ({
        순위: i + 1,
        선수: r.leaguePlayer.player.name,
        '통합 점수': r.leaguePlayer.rating,
        증감: r.ratingDelta,
        판수: r.win + r.lose,
        승률: `${((r.win / Math.max(1, r.win + r.lose)) * 100).toFixed(1)}%`,
      })),
    )
  }

  console.log('\n## 클랜 TOP 15')
  const clans = await prisma.leagueClan.findMany({
    where: { leagueId: league.id, placement: false },
    orderBy: [{ rating: 'desc' }, { id: 'asc' }],
    take: 15,
    select: {
      rating: true,
      win: true,
      lose: true,
      compositionScore: true,
      clan: { select: { name: true } },
    },
  })
  console.table(
    clans.map((c, i) => ({
      순위: i + 1,
      클랜: c.clan?.name ?? '-',
      점수: c.rating,
      판수: c.win + c.lose,
      승률: `${((c.win / Math.max(1, c.win + c.lose)) * 100).toFixed(1)}%`,
    })),
  )

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
