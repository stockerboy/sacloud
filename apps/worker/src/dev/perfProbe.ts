/**
 * **어느 질의가 느린지 재는 자** (2026-09-01).
 *
 * ```
 * node scripts/prod-run.mjs perf-probe              # 운영 DB
 * pnpm --filter @sacloud/worker exec tsx src/dev/perfProbe.ts   # 로컬 DB
 * ```
 *
 * ── 왜 필요한가
 *   `/api/home/top` 이 로컬에서는 warm 0.18초인데 **운영에서는 10.4초**다.
 *   코드는 같으니 범인은 **DB 에서 도는 질의**다. 그런데 화면 쪽 타이밍만 봐서는
 *   그 10초가 어느 질의에서 나오는지 알 수 없다. 여기서 하나씩 따로 잰다.
 *
 * ── **읽기만 한다.** `count` · `findMany` · `groupBy` 뿐이고 쓰는 구문이 없다.
 *
 * ⚠ 이건 진단 도구다. 고치는 것은 이 결과를 보고 따로 한다.
 */
import { prisma } from '@sacloud/db'

/* 화면과 같은 값이어야 의미가 있다 (`apps/worker/src/lib/season0Window.ts`) */
const SEASON0_FROM = new Date('2026-06-30T15:00:00.000Z')
const SEASON0_ORIGINS = ['3rd.supply', 'nexon'] as const
const HOME_SLUGS = ['supply', 'nolink', 'sanply']
const TOP_SIZE = 3

/** 한 번 재고 밀리초를 돌려준다 */
async function time<T>(label: string, run: () => Promise<T>): Promise<T> {
  const started = process.hrtime.bigint()
  const result = await run()
  const ms = Number(process.hrtime.bigint() - started) / 1e6
  const size = Array.isArray(result) ? ` (${result.length}건)` : ''
  console.info(`  ${ms.toFixed(0).padStart(7)} ms  ${label}${size}`)
  return result
}

console.info('연결을 먼저 연다 (첫 질의에 접속 시간이 섞이지 않게)')
await time('워밍업 SELECT 1', () => prisma.$queryRaw`SELECT 1`)

console.info('\n── /api/home/top 이 실제로 던지는 질의들')

const leagues = await time('① League.findMany (홈 3리그)', () =>
  prisma.league.findMany({
    where: { slug: { in: HOME_SLUGS } },
    select: { id: true, slug: true, name: true },
  }),
)

for (const league of leagues) {
  console.info(`\n  [${league.slug}]`)

  const top = await time('② LeaguePlayer.findMany (rating desc, 3건)', () =>
    prisma.leaguePlayer.findMany({
      where: { leagueId: league.id, placement: false },
      take: TOP_SIZE,
      orderBy: [{ rating: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        rating: true,
        player: { select: { id: true, name: true } },
        weaponStats: { select: { knownStatGames: true } },
      },
    }),
  )

  const first = top[0]
  if (!first) {
    console.info('       (선수가 없다 — 아래 질의는 건너뛴다)')
    continue
  }

  await time('③ LeaguePlayer.count (내 위에 몇 명인가)', () =>
    prisma.leaguePlayer.count({
      where: {
        leagueId: league.id,
        placement: false,
        OR: [{ rating: { gt: first.rating } }, { rating: first.rating, id: { lt: first.id } }],
      },
    }),
  )

  await time('④ MatchPlayerStat.groupBy (평균킬 분모 · 여기가 의심스럽다)', () =>
    prisma.matchPlayerStat.groupBy({
      by: ['playerId'],
      where: {
        playerId: { in: top.map((row) => row.player.id) },
        match: {
          leagueId: league.id,
          startAt: { gte: SEASON0_FROM },
          OR: [
            { redRatingUpdate: { not: null } },
            { origin: { in: [...SEASON0_ORIGINS] } },
          ],
        },
      },
      _count: { _all: true },
    }),
  )
}

console.info('\n── 표 크기 (질의가 왜 무거운지 가늠용)')
await time('Match.count', () => prisma.match.count())
await time('MatchPlayerStat.count', () => prisma.matchPlayerStat.count())
await time('LeaguePlayer.count', () => prisma.leaguePlayer.count())

console.info('\n── 이 표들에 인덱스가 무엇이 걸려 있나')
const indexes = await prisma.$queryRaw<{ tablename: string; indexname: string; indexdef: string }[]>`
  SELECT tablename, indexname, indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename IN ('Match', 'MatchPlayerStat', 'LeaguePlayer')
  ORDER BY tablename, indexname
`
for (const row of indexes) {
  console.info(`  ${row.tablename.padEnd(16)} ${row.indexdef.replace(/^CREATE (UNIQUE )?INDEX /, '')}`)
}

await prisma.$disconnect()
