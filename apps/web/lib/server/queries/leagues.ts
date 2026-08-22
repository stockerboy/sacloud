import { prisma } from '@sacloud/db'
import {
  killPerMatch,
  kdRate,
  winRate,
  type ClanRankRow,
  type League,
  type LeagueClan,
  type LeagueListItem,
  type PlayerRankRow,
  type PlayerLimit,
} from '@sacloud/contract'
import { cursorPage, paginateArray, type CursorPage } from '../cursorPage'
import { toKstIso } from '../format'
import {
  CLAN_SUMMARY_SELECT,
  LEAGUE_SUMMARY_SELECT,
  PLAYER_SUMMARY_SELECT,
  USER_SUMMARY_SELECT,
  toClanSummary,
  toClanSummaryOrNull,
  toLeagueSummary,
  toPlayerSummary,
  toUserSummaryOrNull,
} from '../mappers'
import { isCareerPublic, PUBLIC_CAREER_WHERE } from './visibility'

/**
 * 리그 · 랭킹 조회.
 *
 * Mock의 `store.ts`와 **같은 결과**를 내야 한다. 정렬·필터·파생값 규칙을 그대로 옮겼다.
 * 다른 점은 데이터를 메모리 배열이 아니라 DB에서 읽는다는 것뿐이다.
 *
 * 정렬에는 항상 **고유 키(id)를 마지막 기준으로** 넣는다.
 * 동점이 흔한 데이터라(래더·승패) 타이브레이커가 없으면 커서 페이지네이션이 흔들린다.
 */

/* -------------------------------- 리그 목록 ------------------------------- */

export async function listLeagues(cursor: string | null, size: number): Promise<CursorPage<LeagueListItem>> {
  const leagues = await prisma.league.findMany({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      ...LEAGUE_SUMMARY_SELECT,
      createdAt: true,
      owner: { select: USER_SUMMARY_SELECT },
      _count: { select: { clans: true } },
      // 목록에 노출되는 대표 클랜 (관측: 3개)
      clans: {
        take: 3,
        orderBy: { joinedAt: 'asc' },
        select: { clan: { select: CLAN_SUMMARY_SELECT } },
      },
    },
  })

  const rows: LeagueListItem[] = leagues.map((league) => ({
    ...toLeagueSummary(league),
    user: toUserSummaryOrNull(league.owner),
    clan_count: league._count.clans,
    created_at: toKstIso(league.createdAt),
    clans: league.clans.map((entry) => toClanSummary(entry.clan)),
  }))

  // 리그는 소수(관측 4개)라 전량을 읽어도 무리가 없다
  return paginateArray(rows, cursor, size, (item) => item.id)
}

/* --------------------------------- 리그 상세 ------------------------------ */

export async function getLeague(leagueSlug: string): Promise<League | null> {
  const league = await prisma.league.findUnique({
    where: { slug: leagueSlug },
    select: {
      ...LEAGUE_SUMMARY_SELECT,
      description: true,
      status: true,
      createdAt: true,
      owner: { select: USER_SUMMARY_SELECT },
      maps: { select: { map: { select: { id: true, name: true } } } },
      playerLimits: { select: { playerCount: true } },
      _count: { select: { clans: true } },
      seasons: {
        where: { status: 'active' },
        orderBy: { number: 'desc' },
        take: 1,
        select: { number: true },
      },
    },
  })
  if (!league) return null

  return {
    ...toLeagueSummary(league),
    description: league.description,
    user: toUserSummaryOrNull(league.owner),
    maps: league.maps.map((entry) => entry.map),
    player_limits: league.playerLimits
      .map((entry) => entry.playerCount)
      .sort((a, b) => a - b) as PlayerLimit[],
    clan_count: league._count.clans,
    status: league.status,
    created_at: toKstIso(league.createdAt),
    season: league.seasons[0]?.number ?? 0,
  }
}

export async function getLeagueIdBySlug(leagueSlug: string): Promise<string | null> {
  const league = await prisma.league.findUnique({ where: { slug: leagueSlug }, select: { id: true } })
  return league?.id ?? null
}

/**
 * 경로의 리그 식별자를 리그 ID로 바꾼다.
 *
 * **슬러그와 ID를 모두 받는다.** 계약은 랭킹·매치 경로를 `:leagueId`로 적어 두었지만,
 * 화면은 이 자리에 **슬러그를 넣어 호출한다**
 * (`app/league/[leagueSlug]/rank/...`가 URL의 슬러그를 그대로 넘긴다).
 * Mock 핸들러도 둘 다 받아 왔기 때문에 그동안 드러나지 않았다.
 * ID만 받도록 두면 랭킹·기록실이 전부 404가 난다 (실제로 그렇게 났다).
 */
export async function resolveLeagueId(value: string): Promise<string | null> {
  const league = await prisma.league.findFirst({
    where: { OR: [{ id: value }, { slug: value }] },
    select: { id: true },
  })
  return league?.id ?? null
}

export async function isSlugTaken(slug: string): Promise<boolean> {
  const league = await prisma.league.findUnique({ where: { slug }, select: { id: true } })
  return league !== null
}

/* ----------------------------- 리그 참여 클랜 ----------------------------- */

const LEAGUE_CLAN_ORDER = [{ division: 'asc' }, { rating: 'desc' }, { id: 'asc' }] as const
const LEAGUE_CLAN_ORDER_REVERSED = [
  { division: 'desc' },
  { rating: 'asc' },
  { id: 'desc' },
] as const

export async function getLeagueClans(
  leagueSlug: string,
  cursor: string | null,
  size: number,
): Promise<CursorPage<LeagueClan> | null> {
  const leagueId = await getLeagueIdBySlug(leagueSlug)
  if (!leagueId) return null

  return cursorPage<LeagueClan>({
    cursor,
    size,
    orderBy: [...LEAGUE_CLAN_ORDER],
    reversedOrderBy: [...LEAGUE_CLAN_ORDER_REVERSED],
    idOf: (row) => row.id,
    fetch: async (args) => {
      const rows = await prisma.leagueClan.findMany({
        where: { leagueId },
        take: args.take,
        orderBy: args.orderBy as never,
        ...(args.cursor ? { cursor: args.cursor, skip: args.skip } : {}),
        select: {
          id: true,
          leagueId: true,
          rating: true,
          division: true,
          win: true,
          lose: true,
          placement: true,
          status: true,
          joinedAt: true,
          clan: { select: CLAN_SUMMARY_SELECT },
        },
      })
      return rows.map((row) => ({
        id: row.id,
        league_id: row.leagueId,
        clan: toClanSummary(row.clan),
        rating: row.rating,
        division: row.division,
        win: row.win,
        lose: row.lose,
        win_rate: winRate(row.win, row.lose),
        placement: row.placement,
        status: row.status,
        joined_at: toKstIso(row.joinedAt),
      }))
    },
  })
}

/* ---------------------------------- 랭킹 --------------------------------- */

/**
 * 랭킹은 **배치고사가 끝난 대상만** 노출한다(관측).
 * 원본은 1시간 주기 배치로 만들지만 여기서는 요청 시 정렬한다.
 * 배치(`RankSnapshot`) 재현은 Phase 9에서 다룬다.
 */
const RANK_ORDER = [{ rating: 'desc' }, { id: 'asc' }] as const
const RANK_ORDER_REVERSED = [{ rating: 'asc' }, { id: 'desc' }] as const

/**
 * 페이지 첫 행의 순위를 구한다.
 *
 * 커서 페이지네이션은 offset을 모르기 때문에, 정렬 기준상 **앞에 오는 행의 개수**를 세서
 * 순위를 만든다. 정렬이 `rating desc, id asc`이므로
 * "래더가 더 높거나 / 같은데 id가 앞선" 행의 수 + 1이 순위다.
 */
async function rankOfFirstClan(
  leagueId: string,
  division: number,
  first: { rating: number; id: string } | undefined,
): Promise<number> {
  if (!first) return 1
  const before = await prisma.leagueClan.count({
    where: {
      leagueId,
      division,
      placement: false,
      OR: [{ rating: { gt: first.rating } }, { rating: first.rating, id: { lt: first.id } }],
    },
  })
  return before + 1
}

async function rankOfFirstPlayer(
  leagueId: string,
  first: { rating: number; id: string } | undefined,
): Promise<number> {
  if (!first) return 1
  const before = await prisma.leaguePlayer.count({
    where: {
      leagueId,
      placement: false,
      // 목록에서 뺀 선수는 순위 계산 모집단에서도 빼야 한다.
      // 안 그러면 "5,582명 중 302위"에서 명수와 등수의 기준이 어긋난다 (D-102)
      ...PUBLIC_CAREER_WHERE,
      OR: [{ rating: { gt: first.rating } }, { rating: first.rating, id: { lt: first.id } }],
    },
  })
  return before + 1
}

export async function getClanRanks(
  leagueId: string,
  division: number,
  cursor: string | null,
  size: number,
): Promise<CursorPage<ClanRankRow> | null> {
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { id: true } })
  if (!league) return null

  const where = { leagueId, division, placement: false }

  const page = await cursorPage<{
    id: string
    rating: number
    division: number
    win: number
    lose: number
    clan: { id: string; slug: string; name: string; markBgUrl: string | null; markFrontUrl: string | null }
  }>({
    cursor,
    size,
    orderBy: [...RANK_ORDER],
    reversedOrderBy: [...RANK_ORDER_REVERSED],
    idOf: (row) => row.id,
    fetch: (args) =>
      prisma.leagueClan.findMany({
        where,
        take: args.take,
        orderBy: args.orderBy as never,
        ...(args.cursor ? { cursor: args.cursor, skip: args.skip } : {}),
        select: {
          id: true,
          rating: true,
          division: true,
          win: true,
          lose: true,
          clan: { select: CLAN_SUMMARY_SELECT },
        },
      }),
  })

  const startRank = await rankOfFirstClan(leagueId, division, page.items[0])

  return {
    cursor: page.cursor,
    items: page.items.map((row, index) => ({
      rank: startRank + index,
      league_clan_id: row.id,
      clan: toClanSummary(row.clan),
      division: row.division,
      win: row.win,
      lose: row.lose,
      win_rate: winRate(row.win, row.lose),
      rating: row.rating,
    })),
  }
}

/**
 * 리그별 플레이어의 경기 수.
 *
 * `kill_per_match`(평균킬) 계산에 필요하다. 한 페이지(20건)치만 세므로 비용이 크지 않다.
 * 누적 승/패 합계가 아니라 **실제 참가 경기 수**를 쓴다 (store.ts와 동일).
 */
export async function matchCountByPlayer(
  leagueId: string,
  playerIds: string[],
): Promise<Map<string, number>> {
  if (playerIds.length === 0) return new Map()
  const grouped = await prisma.matchPlayerStat.groupBy({
    by: ['playerId'],
    where: { playerId: { in: playerIds }, match: { leagueId } },
    _count: { _all: true },
  })
  return new Map(grouped.map((row) => [row.playerId, row._count._all]))
}

export async function getPlayerRanks(
  leagueId: string,
  cursor: string | null,
  size: number,
): Promise<CursorPage<PlayerRankRow> | null> {
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { id: true } })
  if (!league) return null

  const page = await cursorPage<{
    id: string
    rating: number
    win: number
    lose: number
    kill: number
    death: number
    player: { id: string; name: string }
    clan: { id: string; slug: string; name: string; markBgUrl: string | null; markFrontUrl: string | null } | null
  }>({
    cursor,
    size,
    orderBy: [...RANK_ORDER],
    reversedOrderBy: [...RANK_ORDER_REVERSED],
    idOf: (row) => row.id,
    fetch: (args) =>
      prisma.leaguePlayer.findMany({
        // 무소속 선수의 **누적 개인 기록**은 공개하지 않는다 (D-102).
        // 점수는 DB에 그대로 있고 클랜 래더 계산에도 계속 쓰인다. 목록에만 넣지 않는다
        where: { leagueId, placement: false, ...PUBLIC_CAREER_WHERE },
        take: args.take,
        orderBy: args.orderBy as never,
        ...(args.cursor ? { cursor: args.cursor, skip: args.skip } : {}),
        select: {
          id: true,
          rating: true,
          win: true,
          lose: true,
          kill: true,
          death: true,
          player: { select: PLAYER_SUMMARY_SELECT },
          clan: { select: CLAN_SUMMARY_SELECT },
        },
      }),
  })

  const startRank = await rankOfFirstPlayer(leagueId, page.items[0])
  const counts = await matchCountByPlayer(
    leagueId,
    page.items.map((row) => row.player.id),
  )

  return {
    cursor: page.cursor,
    items: page.items.map((row, index) => ({
      rank: startRank + index,
      league_player_id: row.id,
      player: toPlayerSummary(row.player),
      clan: toClanSummaryOrNull(row.clan),
      win: row.win,
      lose: row.lose,
      win_rate: winRate(row.win, row.lose),
      kd_rate: kdRate(row.kill, row.death),
      kill_per_match: killPerMatch(row.kill, counts.get(row.player.id) ?? 0),
      rating: row.rating,
    })),
  }
}

/* ------------------------- 순위 (개별 대상 조회용) ------------------------- */

export async function clanRankOf(leagueClan: {
  id: string
  leagueId: string
  division: number
  rating: number
  placement: boolean
}): Promise<{ rank: number | null; rankCount: number | null }> {
  const where = { leagueId: leagueClan.leagueId, division: leagueClan.division, placement: false }
  const rankCount = await prisma.leagueClan.count({ where })
  if (leagueClan.placement) return { rank: null, rankCount: null }
  const rank = await rankOfFirstClan(leagueClan.leagueId, leagueClan.division, leagueClan)
  return { rank, rankCount }
}

export async function playerRankOf(leaguePlayer: {
  id: string
  leagueId: string
  rating: number
  placement: boolean
}): Promise<{ rank: number | null; rankCount: number | null }> {
  const rankCount = await prisma.leaguePlayer.count({
    where: { leagueId: leaguePlayer.leagueId, placement: false, ...PUBLIC_CAREER_WHERE },
  })
  if (leaguePlayer.placement) return { rank: null, rankCount: null }
  // 무소속 선수는 공개 랭킹에 등장하지 않는다. 점수는 그대로 있다 (D-102)
  if (!(await isCareerPublic(leaguePlayer.id))) {
    return { rank: null, rankCount: null }
  }
  const rank = await rankOfFirstPlayer(leaguePlayer.leagueId, leaguePlayer)
  return { rank, rankCount }
}
