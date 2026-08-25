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
  type SeasonType,
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
import { cumulativeKdRate } from './visibility'
import { publicOriginWhere } from './publicScope'
import { seasonLabel } from '@sacloud/db/ops'

/**
 * 리그 · 랭킹 조회.
 *
 * Mock의 `store.ts`와 **같은 결과**를 내야 한다. 정렬·필터·파생값 규칙을 그대로 옮겼다.
 * 다른 점은 데이터를 메모리 배열이 아니라 DB에서 읽는다는 것뿐이다.
 *
 * 정렬에는 항상 **고유 키(id)를 마지막 기준으로** 넣는다.
 * 동점이 흔한 데이터라(래더·승패) 타이브레이커가 없으면 커서 페이지네이션이 흔들린다.
 */

/**
 * 공개 화면에 내보내는 참가 클랜 조건.
 *
 * `Clan.active`는 스키마 주석대로 **삭제 대신 쓰는 값**이다.
 * 경기가 걸려 있어 지울 수 없는 dev 잔존 클랜을 목록·랭킹·집계에서 빼는 데 쓴다.
 * 이걸 반영하지 않으면 "확인된 44개"에 잔존 4개가 섞여 48처럼 보인다 (D-124).
 */
const ACTIVE_CLAN = { clan: { active: true } } as const

/* -------------------------------- 리그 목록 ------------------------------- */

export async function listLeagues(cursor: string | null, size: number): Promise<CursorPage<LeagueListItem>> {
  const leagues = await prisma.league.findMany({
    // 개발용 시드 리그는 공개 목록에 넣지 않는다 (D-116)
    where: { ...publicOriginWhere() },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      ...LEAGUE_SUMMARY_SELECT,
      createdAt: true,
      owner: { select: USER_SUMMARY_SELECT },
      _count: { select: { clans: { where: ACTIVE_CLAN } } },
      // 목록에 노출되는 대표 클랜 (관측: 3개)
      clans: {
        /* **개수와 같은 조건으로 거른다** (D-147).
           `_count` 는 `ACTIVE_CLAN` 으로 44개를 세는데 이 미리보기에는 필터가 없어서,
           비활성 처리된 개발용 클랜(`real-` 접두 4개)이 공개 리그 목록에 그대로 나왔다.
           세는 집합과 보여 주는 집합이 다르면 안 된다. */
        where: ACTIVE_CLAN,
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
  const league = await prisma.league.findFirst({
    // 시드 리그는 **없는 것처럼** 다룬다. 숨김이 아니라 404다 (D-116)
    where: { slug: leagueSlug, ...publicOriginWhere() },
    select: {
      ...LEAGUE_SUMMARY_SELECT,
      description: true,
      status: true,
      createdAt: true,
      owner: { select: USER_SUMMARY_SELECT },
      maps: { select: { map: { select: { id: true, name: true } } } },
      playerLimits: { select: { playerCount: true } },
      _count: { select: { clans: { where: ACTIVE_CLAN } } },
      seasons: {
        where: { status: 'active' },
        orderBy: { number: 'desc' },
        take: 1,
        select: { number: true, seasonType: true },
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
    /* 베타는 내부 번호가 0이다. 화면이 "Season 0"이라고 쓰지 않도록
       표시용 이름을 서버가 만들어서 내려 준다 (D-098) */
    season_type: (league.seasons[0]?.seasonType ?? 'official') as SeasonType,
    season_label: seasonLabel({
      number: league.seasons[0]?.number ?? 0,
      seasonType: league.seasons[0]?.seasonType ?? 'official',
    }),
  }
}

export async function getLeagueIdBySlug(leagueSlug: string): Promise<string | null> {
  const league = await prisma.league.findFirst({
    where: { slug: leagueSlug, ...publicOriginWhere() },
    select: { id: true },
  })
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
    // 시드 리그는 여기서 막는다. 리그 스코프 공개 경로가 전부 이 함수를 지나므로
    // 한 곳만 막으면 랭킹·기록실·매치 상세가 함께 닫힌다 (D-116)
    where: { OR: [{ id: value }, { slug: value }], ...publicOriginWhere() },
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
        where: { leagueId, ...ACTIVE_CLAN },
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

  const where = { leagueId, division, placement: false, ...ACTIVE_CLAN }

  const page = await cursorPage<{
    id: string
    rating: number
    division: number
    win: number
    lose: number
    clan: {
      id: string
      slug: string
      name: string
      markBgUrl: string | null
      markFrontUrl: string | null
      category: string
    }
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
          clan: { select: { ...CLAN_SUMMARY_SELECT, category: true } },
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
      category: row.clan.category,
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
    /* 평균킬의 **분모**다. 분자(`LeaguePlayer.kill`)는 래더 경기를 누적하므로
       분모도 래더 경기를 센다. `official` 라벨은 D-145 에서 래더와 무관해졌다 (D-148). */
    where: { playerId: { in: playerIds }, match: { leagueId, redRatingUpdate: { not: null } } },
    _count: { _all: true },
  })
  return new Map(grouped.map((row) => [row.playerId, row._count._all]))
}

export async function getPlayerRanks(
  leagueId: string,
  cursor: string | null,
  size: number,
): Promise<CursorPage<PlayerRankRow> | null> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true, category: true },
  })
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
        /* 리그 안의 선수는 **전원** 랭킹에 들어간다 (D-107).
           무소속리그에도 개인 랭킹이 있다. 리그가 다르면 애초에 다른 목록이라
           여기서 걸러 낼 것이 없다. 무소속리그에서 감추는 것은 누적 킬뎃 컬럼뿐이다. */
        where: { leagueId, placement: false },
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
      // 무소속리그면 누적 킬뎃만 비운다. 순위·승패·평균킬은 그대로 나간다 (D-107)
      kd_rate: cumulativeKdRate(league, kdRate(row.kill, row.death)),
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

/**
 * 무기별 랭킹 (D-146).
 *
 * `LeaguePlayerWeaponStat.ratingDelta` 기준이다 — 무기 분리는 **기록만** 나누고
 * 통합 래더 값을 바꾸지 않는다 (LADDER_IMPLEMENTATION_SPEC 6장).
 *
 * **넥슨 Open API 는 무기를 주지 않는다** (D-034). 그래서 무기가 확인된 경기가 없는
 * 선수는 `null` 이다 — 표본이 없는데 순위를 만들어 내지 않는다.
 * 화면은 `null` 을 "집계 없음" 으로 표시한다.
 */
/**
 * 무기별 전적 + 그 무기 안에서의 순위 (D-149).
 *
 * ── 순위 기준
 *   `ratingDelta` — **그 무기로 뛴 경기에서 얻은 래더 증감의 합**이다.
 *   새 점수식을 만든 것이 아니다. D-145 통합 공식이 이미 계산해 둔 `ratingUpdate` 를
 *   무기에 따라 나눠 담기만 한다 (`CLAUDE.md` 3-B 1번 — 무기별 공식은 없다).
 *   개인 래더(`LeaguePlayer.rating`)는 무기별로 쪼개지 않는다.
 *
 *   D-149 이전에는 이 값이 항상 0이라 전원 동점이었고 모두 1위로 나왔다.
 *
 * ── 모집단
 *   **K/D 를 아는 경기가 한 판이라도 있는 선수**만 순위에 넣는다 (`knownStatGames > 0`).
 *   무기만 알고 기록을 모르는 선수를 순위에 넣으면 비교할 실적이 없는 사람이 등수를 받는다.
 *   배치고사 중인 선수는 기존 규칙 그대로 순위를 받지 않는다.
 */
export async function playerWeaponRankOf(
  leaguePlayerId: string,
  leagueId: string,
  weapon: 0 | 1,
): Promise<{
  rank: number | null
  rankCount: number | null
  games: number
  knownGames: number
  kill: number
  death: number
  assist: number
  kdRate: number | null
}> {
  const empty = {
    rank: null,
    rankCount: null,
    games: 0,
    knownGames: 0,
    kill: 0,
    death: 0,
    assist: 0,
    kdRate: null,
  }
  const mine = await prisma.leaguePlayerWeaponStat.findUnique({
    where: { leaguePlayerId_weapon: { leaguePlayerId, weapon } },
    select: {
      ratingDelta: true,
      games: true,
      knownStatGames: true,
      kill: true,
      death: true,
      assist: true,
      leaguePlayer: { select: { placement: true } },
    },
  })
  // 그 무기로 뛴 기록이 아예 없으면 만들어 내지 않는다
  if (!mine || mine.games === 0) return empty

  const stat = {
    games: mine.games,
    knownGames: mine.knownStatGames,
    kill: mine.kill,
    death: mine.death,
    assist: mine.assist,
    /* K/D 정의는 통합 킬뎃과 **같다** — `킬 / (킬 + 데스) × 100`.
       전체와 무기별이 다른 정의를 쓰면 나란히 놓았을 때 거짓말이 된다.
       아는 경기가 없으면 계산하지 않는다 (0%가 아니라 모르는 것이다) */
    kdRate: mine.knownStatGames === 0 ? null : kdRate(mine.kill, mine.death),
  }

  /* **본인이 랭킹 모집단에 들어가지 않으면 순위도 없다.**
     배치고사 중인 선수를 세지 않으면서 그 선수에게만 순위를 주면
     "0명중 1위" 같은 값이 나온다. 실제로 그렇게 나왔다. */
  if (mine.leaguePlayer.placement || mine.knownStatGames === 0) {
    return { ...empty, ...stat, rank: null, rankCount: null }
  }

  const where = {
    weapon,
    leaguePlayer: { leagueId, placement: false },
    knownStatGames: { gt: 0 },
  }
  const rankCount = await prisma.leaguePlayerWeaponStat.count({ where })
  const above = await prisma.leaguePlayerWeaponStat.count({
    where: { ...where, ratingDelta: { gt: mine.ratingDelta } },
  })
  return { ...stat, rank: above + 1, rankCount }
}

export async function playerRankOf(leaguePlayer: {
  id: string
  leagueId: string
  rating: number
  placement: boolean
}): Promise<{ rank: number | null; rankCount: number | null }> {
  const rankCount = await prisma.leaguePlayer.count({
    where: { leagueId: leaguePlayer.leagueId, placement: false },
  })
  if (leaguePlayer.placement) return { rank: null, rankCount: null }
  // 무소속리그 선수도 자기 리그 안에서 정상으로 순위를 받는다 (D-107)
  const rank = await rankOfFirstPlayer(leaguePlayer.leagueId, leaguePlayer)
  return { rank, rankCount }
}
