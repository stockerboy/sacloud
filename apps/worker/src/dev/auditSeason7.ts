/**
 * supply Season 7에 무엇이 들어 있는지 조사한다 (읽기 전용 · Phase 11-A).
 *
 *   pnpm --filter @sacloud/worker exec tsx src/dev/auditSeason7.ts
 *
 * 왜 필요한가
 *   Season 7의 최종 source of truth는 **3rd.supply의 Season 7 기록**이다.
 *   그런데 우리 DB의 supply Season 7에는 Phase 10 E2E 검증 과정에서 생긴 행이 섞여 있다.
 *   legacy 스냅샷을 넣기 전에 **무엇이 실제 기록이고 무엇이 검증 잔재인지** 먼저 가른다.
 *
 * 아무것도 지우지 않는다. 지울 대상을 고르지도 않는다. 목록만 만든다.
 */
import { prisma } from '@sacloud/db'

/** Phase 10 E2E가 만든 행은 id에 표식이 있다 (`E2E-…` / `E2E-OUID-…`) */
const E2E_PREFIX = 'E2E-'

async function main(): Promise<void> {
  const league = await prisma.league.findUnique({
    where: { slug: 'supply' },
    select: { id: true, name: true },
  })
  if (!league) {
    console.error('supply 리그가 없다')
    process.exitCode = 1
    return
  }

  const seasons = await prisma.season.findMany({
    where: { leagueId: league.id },
    orderBy: { number: 'asc' },
    select: { id: true, number: true, status: true, startedAt: true, endedAt: true, imported: true },
  })
  console.info(`리그 ${league.name} (${league.id})`)
  for (const season of seasons) {
    console.info(
      `  Season ${season.number}  ${season.status}  imported=${season.imported}  ` +
        `${season.startedAt.toISOString().slice(0, 10)} ~ ${season.endedAt?.toISOString().slice(0, 10) ?? '진행중'}`,
    )
  }

  /* --- 이 리그에 달린 경기 --- */
  const matches = await prisma.match.findMany({
    where: { leagueId: league.id },
    select: {
      id: true,
      origin: true,
      official: true,
      sourceMatchId: true,
      startAt: true,
      seasonId: true,
      _count: { select: { stats: true } },
    },
    orderBy: { startAt: 'asc' },
  })
  console.info(`\n경기 ${matches.length}건`)
  for (const match of matches) {
    console.info(
      `  ${match.id}  origin=${match.origin}  official=${match.official}  ` +
        `참가 ${match._count.stats}  season=${match.seasonId ?? '(미귀속)'}  src=${match.sourceMatchId ?? '-'}`,
    )
  }

  /* --- 참가자가 E2E가 만든 Player인가 --- */
  const stats = await prisma.matchPlayerStat.findMany({
    where: { match: { leagueId: league.id } },
    select: { playerId: true, player: { select: { name: true } } },
  })
  const playerIds = [...new Set(stats.map((row) => row.playerId))]
  const e2ePlayers = playerIds.filter((id) => id.startsWith(E2E_PREFIX))
  console.info(
    `\n참가 선수 ${playerIds.length}명 중 Phase 10 E2E가 만든 선수 ${e2ePlayers.length}명`,
  )
  console.info(`  ${e2ePlayers.join(', ') || '(없음)'}`)

  /* --- 리그에 등록된 클랜·로스터·리그플레이어 --- */
  const [leagueClans, roster, leaguePlayers] = await Promise.all([
    prisma.leagueClan.findMany({
      where: { leagueId: league.id },
      select: { id: true, rating: true, win: true, lose: true, clan: { select: { slug: true, name: true, category: true } } },
    }),
    prisma.leagueRosterMembership.count({ where: { leagueClan: { leagueId: league.id } } }),
    prisma.leaguePlayer.findMany({
      where: { leagueId: league.id },
      select: { id: true, playerId: true, rating: true, win: true, lose: true, kill: true, death: true },
    }),
  ])
  console.info(`\n리그클랜 ${leagueClans.length}곳 · 로스터 ${roster}건 · 리그플레이어 ${leaguePlayers.length}명`)
  for (const entry of leagueClans) {
    console.info(
      `  ${entry.clan.slug.padEnd(24)} ${entry.clan.name}  ${entry.clan.category}  ` +
        `래더 ${entry.rating}  ${entry.win}승 ${entry.lose}패`,
    )
  }

  const dirtyPlayers = leaguePlayers.filter(
    (entry) => entry.win + entry.lose + entry.kill + entry.death > 0,
  )
  console.info(
    `\n누적이 0이 아닌 리그플레이어 ${dirtyPlayers.length}명 ` +
      `(비공식 경기만 있으므로 0이어야 정상)`,
  )
  for (const entry of dirtyPlayers) {
    console.info(`  ${entry.playerId}  ${entry.win}승 ${entry.lose}패 ${entry.kill}/${entry.death}`)
  }

  /* --- 시즌 스냅샷이 이미 있는가 --- */
  const snapshots = await prisma.leaguePlayerSeason.count({
    where: { seasonRef: { leagueId: league.id } },
  })
  const clanSnapshots = await prisma.leagueClanSeason.count({
    where: { seasonRef: { leagueId: league.id } },
  })
  console.info(`\n시즌 스냅샷: 개인 ${snapshots}행 · 클랜 ${clanSnapshots}행`)

  console.info(
    '\n판정\n' +
      `  실제 사용자/history 데이터   0건 (이 리그는 아직 공개 운영된 적이 없다)\n` +
      `  Phase 10 E2E/test 데이터     경기 ${matches.length}건 · 선수 ${e2ePlayers.length}명\n` +
      `  mock/fixture 데이터          0건 (mock은 officialmain 등 별도 리그)`,
  )
}

main()
  .catch((error: unknown) => console.error(error))
  .finally(() => prisma.$disconnect())
