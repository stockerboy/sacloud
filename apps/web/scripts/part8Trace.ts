/**
 * ★★Part 8 — 화면 하나가 DB 를 몇 번 두드리는가★★ (2026-09-06 · 사장님 지시 5).
 * ★읽기만 한다. 아무것도 안 고친다.★
 *
 * ```
 * pnpm exec tsx apps/web/scripts/part8Trace.ts
 * ```
 *
 * ── 어떻게 세나
 *   Prisma 의 `$on('query')` 로 ★실제로 나간 질의★ 를 센다. 코드를 읽어 짐작하지 않는다.
 *   같은 모양의 질의가 여러 번 나가면 ★N+1★ 이다 — 그것도 같이 센다.
 */
import { prisma } from '@sacloud/db'
import { getHomeTop } from '../lib/server/queries/homeTop'
import { getPlayerRanks, getClanRanks, ALL_DIVISIONS } from '../lib/server/queries/leagues'
import { getPlayerRanksByWeapon } from '../lib/server/queries/rankings'
import {
  getLeaguePlayerDetail,
  getLeagueClanShow,
  getLeaguePlayerSeasons,
} from '../lib/server/queries/records'
import { getLeagueMatches, getMatch } from '../lib/server/queries/matches'

interface Seen {
  count: number
  /** 질의 모양 → 몇 번 */
  shapes: Map<string, number>
  ms: number
}

/** 질의 문을 「모양」으로 줄인다 — 값이 달라도 같은 모양이면 한 무리다 */
function shapeOf(sql: string): string {
  return sql
    .replace(/\$\d+/g, '?')
    .replace(/\s+/g, ' ')
    .replace(/IN \([^)]*\)/gi, 'IN (?)')
    .slice(0, 110)
}

/*
 * ── ★질의를 어떻게 세나★
 *   공유 클라이언트는 `query` 이벤트를 안 낸다 (`log: ['error']`).
 *   ★그 파일을 고치지 않는다★ — 대신 이 스크립트 안에서 ★호출을 감싸서★ 센다.
 *   Prisma 연산 한 번 ≒ DB 왕복 한 번이라, ★N+1 을 보기에는 이걸로 충분하다.★
 */
const MODELS = [
  'league', 'leaguePlayer', 'leagueClan', 'match', 'matchPlayerStat', 'player', 'clan',
  'leaguePlayerSeason', 'leagueClanSeason', 'leaguePlayerWeaponStat', 'season',
  'matchClanHexV2', 'leagueRosterMembership', 'nexonIdentity',
] as const
const OPS = ['findMany', 'findUnique', 'findFirst', 'findUniqueOrThrow', 'findFirstOrThrow',
  'count', 'aggregate', 'groupBy'] as const

let current: Seen | null = null
function install(): void {
  const client = prisma as unknown as Record<string, Record<string, unknown>>
  for (const model of MODELS) {
    const delegate = client[model]
    if (!delegate) continue
    for (const op of OPS) {
      const fn = delegate[op]
      if (typeof fn !== 'function') continue
      delegate[op] = (...args: unknown[]) => {
        if (current) {
          current.count += 1
          const k = `${model}.${op}`
          current.shapes.set(k, (current.shapes.get(k) ?? 0) + 1)
        }
        return (fn as (...a: unknown[]) => unknown).apply(delegate, args)
      }
    }
  }
  for (const raw of ['$queryRaw', '$queryRawUnsafe'] as const) {
    const fn = (prisma as unknown as Record<string, unknown>)[raw]
    if (typeof fn !== 'function') continue
    ;(prisma as unknown as Record<string, unknown>)[raw] = (...args: unknown[]) => {
      if (current) {
        current.count += 1
        const first = typeof args[0] === 'string' ? shapeOf(args[0]) : '$queryRaw(템플릿)'
        const k = `raw · ${first}`
        current.shapes.set(k, (current.shapes.get(k) ?? 0) + 1)
      }
      return (fn as (...a: unknown[]) => unknown).apply(prisma, args)
    }
  }
}

async function measure<T>(label: string, run: () => Promise<T>): Promise<{ label: string; seen: Seen; value: T }> {
  const seen: Seen = { count: 0, shapes: new Map(), ms: 0 }
  current = seen
  const started = Date.now()
  const value = await run()
  seen.ms = Date.now() - started
  current = null
  return { label, seen, value }
}

async function main(): Promise<void> {
  const slug = process.argv[2] ?? 'nolink'
  install()
  const league = await prisma.league.findUniqueOrThrow({
    where: { slug },
    select: { id: true, divisionCount: true },
  })

  /* 표본 하나씩 고른다 */
  const [top] = await prisma.leaguePlayer.findMany({
    where: { leagueId: league.id, placement: false },
    orderBy: [{ rating: 'desc' }, { id: 'asc' }],
    take: 1,
    select: { id: true, playerId: true, clan: { select: { slug: true } } },
  })
  const [someMatch] = await prisma.match.findMany({
    where: { leagueId: league.id },
    orderBy: [{ startAt: 'desc' }],
    take: 1,
    select: { id: true },
  })
  const [someClan] = await prisma.leagueClan.findMany({
    where: { leagueId: league.id, expelledAt: null, placement: false },
    orderBy: [{ rating: 'desc' }],
    take: 1,
    select: { clan: { select: { slug: true } } },
  })

  const runs: Array<{ label: string; seen: Seen }> = []

  runs.push(await measure('홈 · TOP3+최근경기 (getHomeTop)', () => getHomeTop()))
  runs.push(await measure('개인 랭킹 20 (getPlayerRanks)', () => getPlayerRanks(league.id, null, 20)))
  runs.push(
    await measure('개인 랭킹 · 스나 20 (getPlayerRanksByWeapon)', () =>
      getPlayerRanksByWeapon(league.id, 'sniper', null, 20),
    ),
  )
  runs.push(await measure('클랜 랭킹 20 (getClanRanks)', () => getClanRanks(league.id, ALL_DIVISIONS, null, 20)))
  runs.push(await measure('경기 목록 20 (getLeagueMatches)', () => getLeagueMatches(league.id, null, 20)))
  if (someMatch)
    runs.push(await measure('경기 상세 (getMatch)', () => getMatch(league.id, someMatch.id, null)))
  if (top)
    runs.push(
      await measure('선수 상세 (getLeaguePlayerDetail)', () =>
        getLeaguePlayerDetail(slug, top.playerId),
      ),
    )
  if (top)
    runs.push(
      await measure('지난 시즌 카드 (getLeaguePlayerSeasons)', () => getLeaguePlayerSeasons(top.id)),
    )
  if (someClan)
    runs.push(
      await measure('클랜 상세 (getLeagueClanShow)', () => getLeagueClanShow(slug, someClan.clan.slug)),
    )

  console.info(`══ 화면 한 번에 나가는 질의 (리그 ${slug}) ══\n`)
  console.info('  화면                                      질의수   걸린시간   ★같은 모양이 여러 번★')
  for (const r of runs) {
    const repeats = [...r.seen.shapes.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1])
    const worst = repeats[0]
    console.info(
      `  ${r.label.padEnd(40)} ${String(r.seen.count).padStart(5)}회 ${String(r.seen.ms).padStart(7)}ms   ` +
        (worst ? `★${worst[1]}회 반복★` : '없음'),
    )
    for (const [shape, n] of repeats.slice(0, 3)) {
      console.info(`        ${n}회 · ${shape}`)
    }
  }
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
