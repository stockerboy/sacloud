import { prisma } from '@sacloud/db'
import {
  killPerMatch,
  kdRate,
  showsDivision,
  winRate,
  type ClanSummary,
  type PlayerSummary,
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
import { ladderMatchWhere } from './ladderScope'
/* 화면 표기는 계약이 정한다 — 베타는 `시즌0` (D-178) */
import { seasonDisplayLabel as seasonLabel } from '@sacloud/contract'
import { seasonWindowWhere } from './season0Scope'

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
 *
 * ── `expelledAt` 도 함께 본다 (2026-08-30)
 *   추방(등록 해제)된 클랜은 그 리그의 목록·랭킹·개수에서 빠져야 한다.
 *   그런데 이 값은 지금까지 투영 잡만 보고 **공개 질의는 아무도 보지 않았다** —
 *   추방해도 랭킹에 그대로 남아 등록 해제가 되지 않았다.
 *   여기 한 곳에 넣어 목록과 개수가 **같은 조건**을 쓰게 한다 (D-147 과 같은 이유).
 *   **경기 기록은 지우지 않는다.** 순위와 명단에서만 빠진다.
 */
const ACTIVE_CLAN = { clan: { active: true }, expelledAt: null } as const

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
 * 개인랭킹 **모집단** — 목록 · 순위 계산 · 메인 TOP3 가 같은 조건을 써야 한다.
 *
 * 리그 안의 선수는 **전원** 들어간다 (D-107). 클랜으로 거르지 않는다 —
 * 무소속 선수는 `clanId` 가 null 이라 클랜 조건을 걸면 통째로 빠진다.
 */
function playerRankWhere(leagueId: string): { leagueId: string; placement: boolean } {
  return { leagueId, placement: false }
}

/**
 * 클랜랭킹에서 **부리그를 나누지 않는 축**의 정렬 (2026-09-01 사용자 지시).
 *
 * ```
 * 공식리그(SPL)   부리그를 섞어 래더 순으로 한 줄     RANK_ORDER 그대로
 * 무소속리그(IPL) 티어를 유지한 채 한 줄 + 티어 경계선 TIER_ORDER
 * ```
 *
 * 티어는 운영자가 정하는 값이라 래더로 자동 정렬되지 않는다 (D-104).
 * 그래서 IPL 은 **티어 오름차순 → 그 안에서 래더 내림차순**이다.
 * `id` 는 언제나 마지막 타이브레이커다 — 없으면 커서 페이지네이션이 흔들린다.
 */
const TIER_ORDER = [{ division: 'asc' }, { rating: 'desc' }, { id: 'asc' }] as const
const TIER_ORDER_REVERSED = [{ division: 'desc' }, { rating: 'asc' }, { id: 'desc' }] as const

/** 부리그를 나누지 않고 한 줄로 세울 때 쓰는 표시값 (API `division=0`) */
export const ALL_DIVISIONS = 0

/**
 * 페이지 첫 행의 순위를 구한다.
 *
 * 커서 페이지네이션은 offset을 모르기 때문에, 정렬 기준상 **앞에 오는 행의 개수**를 세서
 * 순위를 만든다. 정렬이 `rating desc, id asc`이므로
 * "래더가 더 높거나 / 같은데 id가 앞선" 행의 수 + 1이 순위다.
 *
 * `division <= 0`(전체)이면 부리그 조건을 빼고 센다. 이때 정렬이 티어 축이면
 * "앞에 오는 행" 의 뜻도 함께 바뀐다 — **목록과 같은 정렬로 세지 않으면 순위가 어긋난다.**
 */
async function rankOfFirstClan(
  leagueId: string,
  division: number,
  first: { rating: number; id: string; division: number } | undefined,
  byTier: boolean,
): Promise<number> {
  if (!first) return 1
  const ahead = byTier
    ? [
        { division: { lt: first.division } },
        { division: first.division, rating: { gt: first.rating } },
        { division: first.division, rating: first.rating, id: { lt: first.id } },
      ]
    : [{ rating: { gt: first.rating } }, { rating: first.rating, id: { lt: first.id } }]

  const before = await prisma.leagueClan.count({
    /* **목록과 같은 조건으로 센다** (D-147 과 같은 이유).
       `getClanRanks` 는 `ACTIVE_CLAN` 으로 비활성 클랜을 빼고 보여 주는데
       여기서 빼지 않으면, 앞자리에 놓인 비활성 클랜이 순위에만 더해져
       "1위인데 rank=2" 처럼 목록에 없는 자리가 생긴다. */
    where: {
      leagueId,
      ...(division > 0 ? { division } : {}),
      placement: false,
      ...ACTIVE_CLAN,
      OR: ahead,
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
    /* 여기에는 `ACTIVE_CLAN` 을 넣지 않는다. 개인 랭킹 목록(`getPlayerRanks`)이
       클랜으로 거르지 않기 때문이다 — 리그 안의 선수는 **전원** 들어간다 (D-107).
       무소속 선수는 `clanId` 가 null 이라 클랜 조건을 걸면 통째로 빠진다. */
    where: {
      ...playerRankWhere(leagueId),
      OR: [{ rating: { gt: first.rating } }, { rating: first.rating, id: { lt: first.id } }],
    },
  })
  return before + 1
}

/**
 * 클랜랭킹.
 *
 * `division >= 1` 이면 예전 그대로 **그 부리그만** 준다 (부리그 탭 화면이 쓴다).
 *
 * ── `division <= 0` = 부리그를 나누지 않는다 (2026-09-01 사용자 지시)
 *   *"SPL은 1,2부 나누지 말고 그냥 순위대로 배열하고, IPL도 세로로 일열 배열하는데
 *     우리가 정해놨던 티어별로 선을 그어서 나눠줘"*
 *
 *   같은 「전체」인데 정렬이 둘로 갈린다 —
 *   공식리그는 부리그를 **섞어** 래더 순, 무소속리그는 티어를 **유지**한 채 래더 순이다.
 *   화면이 티어 경계선을 그릴 수 있도록 `division` 값은 행마다 그대로 나간다.
 *
 *   **없던 데이터를 만들지 않는다.** 걸러 내는 조건(배치고사 · `ACTIVE_CLAN`)은 그대로다.
 */
export async function getClanRanks(
  leagueId: string,
  division: number,
  cursor: string | null,
  size: number,
): Promise<CursorPage<ClanRankRow> | null> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true, slug: true, category: true },
  })
  if (!league) return null

  /* 전체 보기에서만 티어 축을 쓴다. 부리그 탭(division >= 1)은 예전 정렬 그대로다.

     ⚠ 2026-09-02 (지시 #9 후속 · D-265 ③) — **부리그를 화면에 내지 않는 리그는 티어 축도 쓰지 않는다.**
       사장님 뜻이 «1·2부 구분을 없앤다» 라서, 경계선만 지우고 티어 우선 정렬을 남기면
       순위는 그대로인데 래더 숫자가 위아래로 섞여 보인다(2티어 1,100점 위에 1티어 900점).
       스위치는 계약(`leagueScreen`)의 것과 같다 — 화면과 서버가 한 표를 본다.
       스위치를 끄면(`nolink: WITH_LADDER`) 아래가 예전처럼 티어 우선으로 돌아온다.
       `division` 값·API 모양·`rankOfFirstClan` 은 그대로다 — 후자는 같은 `byTier` 를 받는다. */
  const byTier =
    division <= 0 && league.category === 'independent' && showsDivision(league.slug)
  const order = byTier ? TIER_ORDER : RANK_ORDER
  const orderReversed = byTier ? TIER_ORDER_REVERSED : RANK_ORDER_REVERSED

  const where = {
    leagueId,
    ...(division > 0 ? { division } : {}),
    placement: false,
    ...ACTIVE_CLAN,
  }

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
    orderBy: [...order],
    reversedOrderBy: [...orderReversed],
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

  /* **첫 쪽이면 세지 않는다** (2026-09-01 · D-239 후속).
     목록과 순위 계산이 같은 조건·같은 정렬을 쓰므로, 커서가 없을 때 첫 줄보다
     앞에 오는 행은 **정의상 0개**다. 세러 가는 왕복 한 번이 통째로 사라진다.
     커서가 있을 때만 예전처럼 센다 */
  const startRank =
    cursor === null ? 1 : await rankOfFirstClan(leagueId, division, page.items[0], byTier)

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
       분모도 래더 경기를 센다. `official` 라벨은 D-145 에서 래더와 무관해졌다 (D-148).
     *
     * `redRatingUpdate` 하나만 보면 안 된다 — 그건 **우리 공식(D-145)이 계산한** 값이라
     * 미러링한 3rd.supply 경기에는 들어 있지 않다. 실측: supply 리그 13만 경기 중
     * `redRatingUpdate` 가 있는 것은 98건뿐이라 분모가 0이 됐고, 화면에 평균킬이
     * 전부 `0.0킬` 로 나왔다. 미러 경기는 전부 래더 경기다 (원본이 래더 경기만 준다).
     *
     * 분자(`LeaguePlayer.kill`)는 **시즌0 창 안**만 담는다(엔진 집계). 그래서 분모에도
     * 같은 창을 건다 (D-178). 창이 없으면 분모만 전 기간이 되어 평균킬이 `0.29킬` 처럼
     * 터무니없이 작아진다 — D-172 가 고친 것과 같은 종류의 어긋남이다. */
    where: {
      playerId: { in: playerIds },
      match: { leagueId, ...seasonWindowWhere(), ...ladderMatchWhere() },
    },
    _count: { _all: true },
  })
  return new Map(grouped.map((row) => [row.playerId, row._count._all]))
}

/**
 * 평균킬의 분모 — **집계에 실제로 들어간 판수** (D-172).
 *
 * `matchCountByPlayer` 는 그 리그의 래더 경기를 **전부** 센다. 시즌 단위로 집계하기
 * 시작하면서 분자(`LeaguePlayer.kill`)는 그 시즌 것만 담게 됐는데 분모는 전 기간이라,
 * 실측에서 평균킬이 `0.29킬` 처럼 터무니없이 작게 나왔다.
 *
 * `LeaguePlayerWeaponStat.knownStatGames` 는 **같은 집계에서 나온 값**이고
 * K/D 를 아는 경기만 센다 (D-149). 그래서 분자와 분모의 출처가 같아진다.
 * 무기별 행이 하나도 없으면 예전 방식으로 물러난다.
 */
function knownGamesOf(rows: { knownStatGames: number }[]): number {
  return rows.reduce((sum, row) => sum + row.knownStatGames, 0)
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
    weaponStats: { knownStatGames: number }[]
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
        where: playerRankWhere(leagueId),
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
          /* 평균킬 분모 — 분자와 같은 집계에서 나온 판수를 쓴다 (D-172) */
          weaponStats: { select: { knownStatGames: true } },
        },
      }),
  })

  /* 평균킬 분모는 `knownStatGames` 가 **먼저**다 (D-172). 그것이 있는 선수는
     `matchCountByPlayer` 를 부를 이유가 없다 — 결과를 쓰지도 않는다.
     그런데 예전에는 **전원 분을 항상** 물었다. 운영 실측에서 그 `groupBy` 하나가
     DPL 1.3초 · 열산 0.3초였다 (2026-09-01 · D-223).
     그래서 **모르는 선수만** 모아서 묻는다. 아무도 없으면 질의 자체가 사라진다.

     두 질의를 `Promise.all` 로 묶은 것도 같은 이유다. 서로 아무 관계가 없는데
     줄줄이 기다리고 있었다 — 왕복 시간이 그대로 두 번 더해졌다. */
  const unknownGames = page.items.filter((row) => knownGamesOf(row.weaponStats) === 0)
  const [startRank, counts] = await Promise.all([
    /* **첫 쪽이면 세지 않는다** (2026-09-01 · D-239 후속).
       목록과 순위 계산이 같은 조건·같은 정렬이라, 커서가 없을 때 첫 줄보다 앞에 오는 행은
       **정의상 0개**다. 메인 TOP3·랭킹 첫 화면에서 왕복 한 번이 사라진다 */
    cursor === null ? Promise.resolve(1) : rankOfFirstPlayer(leagueId, page.items[0]),
    matchCountByPlayer(
      leagueId,
      unknownGames.map((row) => row.player.id),
    ),
  ])

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
      /* 무소속리그면 **top100 밖만** 누적 킬뎃을 비운다 (2026-09-02).
         순위·승패·평균킬은 언제나 그대로 나간다. 옛 규칙(전원 감춤)은 D-107 */
      kd_rate: cumulativeKdRate(league, kdRate(row.kill, row.death), startRank + index),
      kill_per_match: killPerMatch(
        row.kill,
        knownGamesOf(row.weaponStats) || (counts.get(row.player.id) ?? 0),
      ),
      rating: row.rating,
    })),
  }
}

/**
 * 메인페이지 TOP3 가 쓰는 **가벼운 개인랭킹 첫 줄** (2026-09-01 · D-239 후속).
 *
 * ── 왜 `getPlayerRanks` 를 그대로 부르지 않는가
 *   메인은 `rank · player · clan · rating` **네 칸만** 그린다 (`HomeLeagueTop`).
 *   그런데 `getPlayerRanks` 는 킬뎃과 평균킬을 만드느라 선수마다 `weaponStats` 를
 *   더 읽고, 필요하면 `matchCountByPlayer` 까지 부른다. **메인은 그 값을 버린다.**
 *   리그 세 개니까 버릴 값을 만드느라 왕복이 리그마다 두 번씩 더 났다.
 *   실측: `/api/home/top` 이 왕복 13번 → 8번.
 *
 * ── 규칙은 여전히 한 곳에서 나온다
 *   모집단(`playerRankWhere`)과 정렬(`RANK_ORDER`)을 **랭킹 화면과 같은 상수**로 쓴다.
 *   여기에 조건이나 정렬을 새로 적으면 두 화면이 조용히 갈라진다.
 *
 * ── 순위는 세지 않는다
 *   첫 쪽이라 첫 줄이 1위다 (`getPlayerRanks` 의 같은 판단과 근거가 같다).
 */
export async function getTopPlayerRows(
  leagueId: string,
  size: number,
): Promise<{ rank: number; player: PlayerSummary; clan: ClanSummary | null; rating: number }[]> {
  const rows = await prisma.leaguePlayer.findMany({
    where: playerRankWhere(leagueId),
    take: size,
    orderBy: [...RANK_ORDER],
    select: {
      rating: true,
      player: { select: PLAYER_SUMMARY_SELECT },
      clan: { select: CLAN_SUMMARY_SELECT },
    },
  })
  return rows.map((row, index) => ({
    rank: index + 1,
    player: toPlayerSummary(row.player),
    clan: toClanSummaryOrNull(row.clan),
    rating: row.rating,
  }))
}

/* ------------------------- 순위 (개별 대상 조회용) ------------------------- */

export async function clanRankOf(leagueClan: {
  id: string
  leagueId: string
  division: number
  rating: number
  placement: boolean
}): Promise<{ rank: number | null; rankCount: number | null }> {
  /* `rankCount` 는 클랜랭킹의 **모집단 크기**다. 랭킹 목록(`getClanRanks`)이
     비활성 클랜을 빼고 내보내므로 분모도 같은 집합이어야 한다.
     아니면 "3 / 7 위" 처럼 목록에 7번째가 없는 분모가 나온다 (D-147 과 같은 이유).
   *
   * ── **왕복 두 번을 한 번으로 줄였다** (2026-09-01 · D-239 후속)
   *   예전에는 `count(모집단)` 과 `count(앞에 오는 행)` 을 **줄줄이** 던졌다.
   *   운영은 `connection_limit=1` 이라 그 둘이 병렬로 돌지도 않는다 — 왕복 두 번이
   *   그대로 더해진다. 같은 표를 두 번 훑을 이유가 없어 `FILTER` 로 한 번에 센다.
   *
   *   ⚠ 조건은 위의 Prisma 판(`ACTIVE_CLAN` · `placement: false`)과 **한 글자도 다르면 안
   *     된다.** `getClanRanks` 목록과 모집단이 갈리는 순간 "목록에 없는 분모" 가 생긴다.
   *     `Clan.active` 와 `LeagueClan.expelledAt` 이 그 조건이다.
   *
   *   ⚠ 배치고사면 예전에도 `rankCount` 를 **읽고 나서** 버렸다. 지금도 읽고 버린다 —
   *     한 질의라 버리는 값이 공짜다. 밖으로 나가는 값은 그대로 `null` 이다. */
  const [row] = await prisma.$queryRaw<{ rankCount: number; above: number }[]>`
    SELECT COUNT(*)::int AS "rankCount",
           COUNT(*) FILTER (
             WHERE lc."rating" > ${leagueClan.rating}
                OR (lc."rating" = ${leagueClan.rating} AND lc."id" < ${leagueClan.id})
           )::int AS "above"
      FROM "LeagueClan" lc
      JOIN "Clan" c ON c."id" = lc."clanId"
     WHERE lc."leagueId" = ${leagueClan.leagueId}
       AND lc."division" = ${leagueClan.division}
       AND lc."placement" = false
       AND lc."expelledAt" IS NULL
       AND c."active" = true
  `
  const rankCount = row?.rankCount ?? 0
  if (leagueClan.placement) return { rank: null, rankCount: null }
  return { rank: (row?.above ?? 0) + 1, rankCount }
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
export interface WeaponRankResult {
  rank: number | null
  rankCount: number | null
  games: number
  knownGames: number
  kill: number
  death: number
  assist: number
  kdRate: number | null
}

const EMPTY_WEAPON_RANK: WeaponRankResult = {
  rank: null,
  rankCount: null,
  games: 0,
  knownGames: 0,
  kill: 0,
  death: 0,
  assist: 0,
  kdRate: null,
}

/** 순위를 매기는 데 필요한 무기 버킷 한 줄 */
export interface WeaponStatRow {
  weapon: number
  ratingDelta: number
  games: number
  knownStatGames: number
  kill: number
  death: number
  assist: number
  isMain: boolean
}

/**
 * 무기 버킷 한 줄에서 **기록**과 「순위를 받을 자격이 있는가」를 정한다.
 * 순위 숫자는 여기서 만들지 않는다 — 그건 모집단을 세야 나온다.
 */
function weaponStatOf(
  mine: WeaponStatRow | undefined,
  placement: boolean,
): { stat: WeaponRankResult; ranked: boolean } {
  // 그 무기로 뛴 기록이 아예 없으면 만들어 내지 않는다
  if (!mine || mine.games === 0) return { stat: EMPTY_WEAPON_RANK, ranked: false }

  const stat: WeaponRankResult = {
    ...EMPTY_WEAPON_RANK,
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
  /* 주무기가 아니면 그 무기 랭킹의 모집단이 아니다 (D-173).
     기록은 그대로 돌려주고 **순위만** 주지 않는다 —
     목록(`rankings.ts`)과 모집단이 같아야 "N위 / M명" 이 어긋나지 않는다 */
  const ranked = !placement && mine.knownStatGames > 0 && mine.isMain
  return { stat, ranked }
}

/**
 * 무기 축의 **모집단 크기와 앞선 인원**을 한 질의로 센다 (2026-09-01 · D-239 후속).
 *
 * 예전에는 무기마다 `count(모집단)` · `count(앞선 사람)` 을 **줄줄이** 던졌다.
 * 스나·라플 둘 다 순위를 받는 선수면 왕복이 네 번이다. 운영은 `connection_limit=1` 이라
 * 그 넷이 병렬로 돌지도 않는다 (D-239). 같은 표를 네 번 훑는 대신 `FILTER` 로 한 번에 센다.
 *
 * ⚠ 조건은 `rankings.ts` 의 `weaponRankWhere()` 와 **한 글자도 다르면 안 된다.**
 *   한쪽만 달라지면 프로필의 "N위 / M명" 과 목록의 줄 수가 어긋난다.
 */
async function weaponRankCounts(
  leagueId: string,
  targets: readonly { weapon: 0 | 1; ratingDelta: number }[],
): Promise<Map<number, { rankCount: number; above: number }>> {
  const out = new Map<number, { rankCount: number; above: number }>()
  if (targets.length === 0) return out

  const weapons = targets.map((target) => target.weapon)
  /* `CASE` 는 두 무기를 모두 받는다. 목록에 없는 무기의 값은 어차피 세지 않는다 */
  const rifleDelta = targets.find((target) => target.weapon === 0)?.ratingDelta ?? 0
  const sniperDelta = targets.find((target) => target.weapon === 1)?.ratingDelta ?? 0

  const rows = await prisma.$queryRaw<{ weapon: number; rankCount: number; above: number }[]>`
    SELECT w."weapon" AS "weapon",
           COUNT(*)::int AS "rankCount",
           COUNT(*) FILTER (
             WHERE w."ratingDelta" > (CASE w."weapon" WHEN 0 THEN ${rifleDelta} ELSE ${sniperDelta} END)
           )::int AS "above"
      FROM "LeaguePlayerWeaponStat" w
      JOIN "LeaguePlayer" p ON p."id" = w."leaguePlayerId"
     WHERE p."leagueId" = ${leagueId}
       AND p."placement" = false
       AND w."knownStatGames" > 0
       AND w."isMain" = true
       AND w."weapon" = ANY(${weapons}::int[])
     GROUP BY w."weapon"
  `
  for (const row of rows) out.set(row.weapon, { rankCount: row.rankCount, above: row.above })
  return out
}

/**
 * 스나·라플 **두 축을 한꺼번에** 만든다 (2026-09-01 · D-239 후속).
 *
 * 기록실이 `playerWeaponRankOf` 를 두 번 부르면 왕복이 최대 여섯 번이었다.
 * 무기 버킷은 이미 `weapon_stats` 를 만들며 읽어 두므로 그것을 넘겨받고,
 * 모집단은 위의 한 질의로 센다 — **왕복 한 번**으로 끝난다.
 * 순위를 받을 사람이 아무도 없으면 질의 자체가 사라진다.
 */
export async function playerWeaponRanksOf(
  leagueId: string,
  placement: boolean,
  rows: readonly WeaponStatRow[],
): Promise<Map<0 | 1, WeaponRankResult>> {
  const resolved = new Map<0 | 1, { stat: WeaponRankResult; ranked: boolean; delta: number }>()
  for (const weapon of [0, 1] as const) {
    const mine = rows.find((row) => row.weapon === weapon)
    const { stat, ranked } = weaponStatOf(mine, placement)
    resolved.set(weapon, { stat, ranked, delta: mine?.ratingDelta ?? 0 })
  }

  const targets = [...resolved.entries()]
    .filter(([, value]) => value.ranked)
    .map(([weapon, value]) => ({ weapon, ratingDelta: value.delta }))
  const counts = await weaponRankCounts(leagueId, targets)

  const out = new Map<0 | 1, WeaponRankResult>()
  for (const [weapon, value] of resolved) {
    const count = value.ranked ? counts.get(weapon) : undefined
    out.set(
      weapon,
      count ? { ...value.stat, rank: count.above + 1, rankCount: count.rankCount } : value.stat,
    )
  }
  return out
}

/**
 * **옛 진입점** — 무기 하나만 따로 묻는다 (`CLAUDE.md` 10-4: 옛 버전을 남긴다).
 *
 * 화면은 이제 `playerWeaponRanksOf` 로 둘을 한꺼번에 받는다.
 * 이쪽도 왕복은 두 번으로 줄었다(버킷 한 줄 + 모집단 한 번).
 */
export async function playerWeaponRankOf(
  leaguePlayerId: string,
  leagueId: string,
  weapon: 0 | 1,
): Promise<WeaponRankResult> {
  const mine = await prisma.leaguePlayerWeaponStat.findUnique({
    where: { leaguePlayerId_weapon: { leaguePlayerId, weapon } },
    select: {
      weapon: true,
      ratingDelta: true,
      games: true,
      knownStatGames: true,
      kill: true,
      death: true,
      assist: true,
      isMain: true,
      leaguePlayer: { select: { placement: true } },
    },
  })
  if (!mine) return EMPTY_WEAPON_RANK

  const { stat, ranked } = weaponStatOf(mine, mine.leaguePlayer.placement)
  if (!ranked) return stat

  const counts = await weaponRankCounts(leagueId, [{ weapon, ratingDelta: mine.ratingDelta }])
  const count = counts.get(weapon)
  return count ? { ...stat, rank: count.above + 1, rankCount: count.rankCount } : stat
}

export async function playerRankOf(leaguePlayer: {
  id: string
  leagueId: string
  rating: number
  placement: boolean
}): Promise<{ rank: number | null; rankCount: number | null }> {
  /* **왕복 두 번을 한 번으로 줄였다** (2026-09-01 · D-239 후속) — `clanRankOf` 와 같은 이유다.
     모집단(`placement: false`)도 `rankOfFirstPlayer` 의 조건도 그대로다.
     여기에 `ACTIVE_CLAN` 을 넣지 않는 이유는 위 `rankOfFirstPlayer` 주석에 있다 —
     개인 랭킹 목록은 클랜으로 거르지 않는다 (D-107). 무소속 선수가 통째로 빠진다 */
  const [row] = await prisma.$queryRaw<{ rankCount: number; above: number }[]>`
    SELECT COUNT(*)::int AS "rankCount",
           COUNT(*) FILTER (
             WHERE lp."rating" > ${leaguePlayer.rating}
                OR (lp."rating" = ${leaguePlayer.rating} AND lp."id" < ${leaguePlayer.id})
           )::int AS "above"
      FROM "LeaguePlayer" lp
     WHERE lp."leagueId" = ${leaguePlayer.leagueId}
       AND lp."placement" = false
  `
  const rankCount = row?.rankCount ?? 0
  if (leaguePlayer.placement) return { rank: null, rankCount: null }
  // 무소속리그 선수도 자기 리그 안에서 정상으로 순위를 받는다 (D-107)
  return { rank: (row?.above ?? 0) + 1, rankCount }
}
