import { prisma, type Prisma } from '@sacloud/db'
import {
  kdRate,
  kdRateOrNull,
  killPerMatch,
  winRate,
  winRateOrNull,
  type LeagueClanSeason,
  type LeagueClanShow,
  type LeaguePlayerDetail,
  type LeaguePlayerSeason,
  type MatchSummary,
  type OpponentSummaryEntry,
  type PlayerRankRow,
  type Streak,
  type SeasonType,
  type TeammateStat,
} from '@sacloud/contract'
import { cursorPage, type CursorPage } from '../cursorPage'
import { toKstIso } from '../format'
import {
  CLAN_SUMMARY_SELECT,
  LEAGUE_SUMMARY_SELECT,
  PLAYER_SUMMARY_SELECT,
  toClanSummary,
  toLeagueSummary,
  toPlayerSummary,
} from '../mappers'
import { seasonLabel } from '@sacloud/db/ops'
import { cumulativeKd, cumulativeKdRate, hidesCumulativeKd } from './visibility'
import { clanRankOf, matchCountByPlayer, playerRankOf } from './leagues'
import { leagueClanIdOfPlayer, sideOfLeagueClan } from './matches'

/**
 * 기록실 상세(상단 요약 · 사이드 통계) · 리그 클랜원 목록 · 지난시즌.
 *
 * Mock의 `packages/mock/src/store.ts` 668~907행과 **같은 응답**을 내야 한다.
 * `buildMatchSummary` / `buildTeammates`의 계산 규칙을 그대로 옮겼다.
 */

/** 관측: 최근 20전 기준 요약 */
const RECENT_MATCH_COUNT = 20

/**
 * 연승/연패는 **전체 경기**를 최근순으로 훑어야 한다.
 * 전량을 메모리에 올리지 않고 이 크기씩 끊어 읽다가 결과가 바뀌면 멈춘다.
 * 대부분 첫 묶음 안에서 끝난다.
 */
const STREAK_CHUNK = 200

const MATCH_ORDER = [{ startAt: 'desc' as const }, { id: 'desc' as const }]

/* -------------------------------------------------------------------------- */
/* 요약 계산에 필요한 컬럼                                                        */
/* -------------------------------------------------------------------------- */

/** 최근 20전 요약에 필요한 최소 컬럼. 매치마다 추가 쿼리를 내지 않도록 한 번에 읽는다. */
const SUMMARY_MATCH_SELECT = {
  winnerSide: true,
  redLeagueClanId: true,
  blueLeagueClanId: true,
  redClan: { select: { id: true, clan: { select: CLAN_SUMMARY_SELECT } } },
  blueClan: { select: { id: true, clan: { select: CLAN_SUMMARY_SELECT } } },
  stats: {
    select: {
      playerId: true,
      side: true,
      kill: true,
      death: true,
      player: { select: PLAYER_SUMMARY_SELECT },
    },
  },
} satisfies Prisma.MatchSelect

type SummaryMatchRow = Prisma.MatchGetPayload<{ select: typeof SUMMARY_MATCH_SELECT }>

/** 연승/연패 판정에 필요한 것만 */
const STREAK_MATCH_SELECT = {
  winnerSide: true,
  redLeagueClanId: true,
  blueLeagueClanId: true,
} satisfies Prisma.MatchSelect

type StreakMatchRow = Prisma.MatchGetPayload<{ select: typeof STREAK_MATCH_SELECT }>

/* -------------------------------------------------------------------------- */
/* 요약 / 사이드 통계                                                            */
/* -------------------------------------------------------------------------- */

/**
 * 최근 20전 요약.
 *
 * store.ts와 동일하게 `recent_count`는 **자른 20건 전부**를 센다.
 * 그 중 보는 클랜이 참여하지 않은 경기는 승패·상대 집계에서만 제외된다
 * (플레이어가 클랜을 옮긴 경우에만 생긴다).
 */
function buildMatchSummary(
  matches: SummaryMatchRow[],
  streak: Streak,
  leagueClanId: string,
  playerId: string | null,
): MatchSummary {
  let win = 0
  let lose = 0
  const opponentMap = new Map<
    string,
    { clan: SummaryMatchRow['redClan']['clan']; win: number; lose: number; kill: number; death: number }
  >()

  for (const match of matches) {
    const side = sideOfLeagueClan(match, leagueClanId)
    if (!side) continue
    const won = match.winnerSide === side
    if (won) win += 1
    else lose += 1

    const opponentClan = side === 'red' ? match.blueClan : match.redClan
    const entry = opponentMap.get(opponentClan.id) ?? {
      clan: opponentClan.clan,
      win: 0,
      lose: 0,
      kill: 0,
      death: 0,
    }
    if (won) entry.win += 1
    else entry.lose += 1
    for (const stat of match.stats) {
      if (stat.side !== side) continue
      if (playerId && stat.playerId !== playerId) continue
      entry.kill += stat.kill
      entry.death += stat.death
    }
    opponentMap.set(opponentClan.id, entry)
  }

  const opponents: OpponentSummaryEntry[] = []
  for (const entry of opponentMap.values()) {
    opponents.push({
      clan: toClanSummary(entry.clan),
      win: entry.win,
      lose: entry.lose,
      win_rate: winRate(entry.win, entry.lose),
      kd_rate: kdRate(entry.kill, entry.death),
    })
  }
  opponents.sort((a, b) => b.win + b.lose - (a.win + a.lose))

  return {
    recent_count: matches.length,
    win,
    lose,
    win_rate: winRate(win, lose),
    streak,
    opponents,
  }
}

/** 최근 20전에서 같은 편이었던 플레이어의 승률. 경기 수 내림차순 상위 10명. */
function buildTeammates(
  matches: SummaryMatchRow[],
  leagueClanId: string,
  playerId: string | null,
): TeammateStat[] {
  const stats = new Map<string, { player: { id: string; name: string }; win: number; lose: number }>()

  for (const match of matches) {
    const side = sideOfLeagueClan(match, leagueClanId)
    if (!side) continue
    const won = match.winnerSide === side
    for (const stat of match.stats) {
      if (stat.side !== side) continue
      if (playerId && stat.playerId === playerId) continue
      const entry = stats.get(stat.playerId) ?? { player: stat.player, win: 0, lose: 0 }
      if (won) entry.win += 1
      else entry.lose += 1
      stats.set(stat.playerId, entry)
    }
  }

  const rows: TeammateStat[] = []
  for (const entry of stats.values()) {
    rows.push({
      player: toPlayerSummary(entry.player),
      win: entry.win,
      lose: entry.lose,
      win_rate: winRate(entry.win, entry.lose),
    })
  }
  rows.sort((a, b) => b.win + b.lose - (a.win + a.lose))
  return rows.slice(0, 10)
}

/**
 * 연승/연패 — 최근 경기부터 같은 결과가 이어진 횟수.
 * 결과가 바뀌는 순간 멈추므로 전체를 다 읽는 일은 거의 없다.
 */
async function buildStreak(where: Prisma.MatchWhereInput, leagueClanId: string): Promise<Streak> {
  let type: Streak['type'] = 'none'
  let count = 0
  let skip = 0

  for (;;) {
    const rows: StreakMatchRow[] = await prisma.match.findMany({
      where,
      orderBy: MATCH_ORDER,
      skip,
      take: STREAK_CHUNK,
      select: STREAK_MATCH_SELECT,
    })
    if (rows.length === 0) return { type, count }

    for (const row of rows) {
      const side = sideOfLeagueClan(row, leagueClanId)
      if (!side) continue
      const current: Streak['type'] = row.winnerSide === side ? 'win' : 'lose'
      if (type === 'none') {
        type = current
        count = 1
      } else if (type === current) {
        count += 1
      } else {
        return { type, count }
      }
    }

    if (rows.length < STREAK_CHUNK) return { type, count }
    skip += STREAK_CHUNK
  }
}

/**
 * 최근 20전 + 연승/연패를 한 번에 만든다.
 *
 * **비공식 경기는 여기 들어오지 않는다** (정책 3 · 13).
 * 경기 목록에는 그대로 보이지만 승·패·승률·연승·킬뎃·팀원 집계에는 한 건도 넣지 않는다.
 * 실제로 이걸 빼기 전에는 비공식 경기 한 판이 `1전 1승 0패 (100%)`로 표시됐다.
 *
 * mock 픽스처는 전부 공식 경기라서(`official` 기본값 `true`) 이 조건이
 * mock↔live 대조 결과를 바꾸지 않는다.
 */
async function buildRecordSummary(
  where: Prisma.MatchWhereInput,
  leagueClanId: string,
  playerId: string | null,
): Promise<{ summary: MatchSummary; teammates: TeammateStat[] }> {
  const officialOnly: Prisma.MatchWhereInput = { ...where, official: true }
  const [recent, streak] = await Promise.all([
    prisma.match.findMany({
      where: officialOnly,
      orderBy: MATCH_ORDER,
      take: RECENT_MATCH_COUNT,
      select: SUMMARY_MATCH_SELECT,
    }),
    buildStreak(officialOnly, leagueClanId),
  ])

  return {
    summary: buildMatchSummary(recent, streak, leagueClanId, playerId),
    teammates: buildTeammates(recent, leagueClanId, playerId),
  }
}

/* -------------------------------------------------------------------------- */
/* 리그 내 클랜 상세                                                             */
/* -------------------------------------------------------------------------- */

/** GET /leagues/{leagueSlug}/clans/{clanSlug}/show */
export async function getLeagueClanShow(
  leagueSlug: string,
  clanSlug: string,
): Promise<LeagueClanShow | null> {
  const [league, clan] = await Promise.all([
    prisma.league.findUnique({ where: { slug: leagueSlug }, select: LEAGUE_SUMMARY_SELECT }),
    prisma.clan.findUnique({
      where: { slug: clanSlug },
      select: { id: true, _count: { select: { members: true } } },
    }),
  ])
  if (!league || !clan) return null

  const leagueClan = await prisma.leagueClan.findUnique({
    where: { leagueId_clanId: { leagueId: league.id, clanId: clan.id } },
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
  if (!leagueClan) return null

  const where: Prisma.MatchWhereInput = {
    OR: [{ redLeagueClanId: leagueClan.id }, { blueLeagueClanId: leagueClan.id }],
  }

  const [rank, record] = await Promise.all([
    clanRankOf({
      id: leagueClan.id,
      leagueId: leagueClan.leagueId,
      division: leagueClan.division,
      rating: leagueClan.rating,
      placement: leagueClan.placement,
    }),
    buildRecordSummary(where, leagueClan.id, null),
  ])

  return {
    id: leagueClan.id,
    league_id: leagueClan.leagueId,
    clan: toClanSummary(leagueClan.clan),
    rating: leagueClan.rating,
    division: leagueClan.division,
    win: leagueClan.win,
    lose: leagueClan.lose,
    win_rate: winRate(leagueClan.win, leagueClan.lose),
    placement: leagueClan.placement,
    status: leagueClan.status,
    joined_at: toKstIso(leagueClan.joinedAt),
    league: toLeagueSummary(league),
    rank: rank.rank,
    rank_count: rank.rankCount,
    member_count: clan._count.members,
    match_summary: record.summary,
    teammates: record.teammates,
  }
}

/* -------------------------------------------------------------------------- */
/* 리그 참여 클랜원 목록                                                          */
/* -------------------------------------------------------------------------- */

const CLAN_PLAYER_ORDER = [{ rating: 'desc' }, { id: 'asc' }] as const
const CLAN_PLAYER_ORDER_REVERSED = [{ rating: 'asc' }, { id: 'desc' }] as const

/**
 * GET /leagues/{leagueSlug}/clans/{clanSlug}/players
 *
 * 순위는 랭킹 전체가 아니라 **이 클랜 안에서의 순번**이다(store.ts와 동일).
 * 배치고사 중인 클랜원도 제외하지 않는다.
 * store.ts는 래더 동점 시 타이브레이커가 없지만, 커서 페이지네이션이 흔들리지 않도록
 * 여기서는 `id`를 마지막 정렬 기준으로 넣었다 — 동점 구간의 표시 순서만 달라질 수 있다.
 */
export async function getLeagueClanPlayers(
  leagueSlug: string,
  clanSlug: string,
  cursor: string | null,
  size: number,
): Promise<CursorPage<PlayerRankRow> | null> {
  const [league, clan] = await Promise.all([
    prisma.league.findUnique({ where: { slug: leagueSlug }, select: { id: true, category: true } }),
    prisma.clan.findUnique({ where: { slug: clanSlug }, select: CLAN_SUMMARY_SELECT }),
  ])
  if (!league || !clan) return null

  const leagueClan = await prisma.leagueClan.findUnique({
    where: { leagueId_clanId: { leagueId: league.id, clanId: clan.id } },
    select: { id: true },
  })
  if (!leagueClan) return null

  const where = { leagueId: league.id, clanId: clan.id }

  const page = await cursorPage<{
    id: string
    rating: number
    win: number
    lose: number
    kill: number
    death: number
    player: { id: string; name: string }
  }>({
    cursor,
    size,
    orderBy: [...CLAN_PLAYER_ORDER],
    reversedOrderBy: [...CLAN_PLAYER_ORDER_REVERSED],
    idOf: (row) => row.id,
    fetch: (args) =>
      prisma.leaguePlayer.findMany({
        where,
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
        },
      }),
  })

  const first = page.items[0]
  const [before, counts] = await Promise.all([
    first
      ? prisma.leaguePlayer.count({
          where: {
            ...where,
            OR: [{ rating: { gt: first.rating } }, { rating: first.rating, id: { lt: first.id } }],
          },
        })
      : Promise.resolve(0),
    matchCountByPlayer(
      league.id,
      page.items.map((row) => row.player.id),
    ),
  ])

  const clanSummary = toClanSummary(clan)

  return {
    cursor: page.cursor,
    items: page.items.map((row, index) => ({
      rank: before + index + 1,
      league_player_id: row.id,
      player: toPlayerSummary(row.player),
      clan: clanSummary,
      win: row.win,
      lose: row.lose,
      win_rate: winRate(row.win, row.lose),
      kd_rate: cumulativeKdRate(league, kdRate(row.kill, row.death)),
      kill_per_match: killPerMatch(row.kill, counts.get(row.player.id) ?? 0),
      rating: row.rating,
    })),
  }
}

/* -------------------------------------------------------------------------- */
/* 리그 내 플레이어 상세                                                          */
/* -------------------------------------------------------------------------- */

/**
 * GET /leagues/{leagueSlug}/players/{playerId}
 *
 * 요약의 대상 경기는 **그 플레이어가 참가한 리그 내 전 경기**다.
 * (소속 리그클랜으로 미리 거르지 않는다 — store.ts가 그렇게 동작한다.
 *  거르는 것은 요약 안쪽의 `sideOfLeagueClan` 판정뿐이다.)
 */
export async function getLeaguePlayerDetail(
  leagueSlug: string,
  playerId: string,
): Promise<LeaguePlayerDetail | null> {
  const league = await prisma.league.findUnique({
    where: { slug: leagueSlug },
    select: LEAGUE_SUMMARY_SELECT,
  })
  if (!league) return null

  const leaguePlayer = await prisma.leaguePlayer.findUnique({
    where: { leagueId_playerId: { leagueId: league.id, playerId } },
    select: {
      id: true,
      leagueId: true,
      clanId: true,
      rating: true,
      win: true,
      lose: true,
      kill: true,
      death: true,
      assist: true,
      headshot: true,
      mvpCount: true,
      placement: true,
      player: { select: PLAYER_SUMMARY_SELECT },
      clan: { select: CLAN_SUMMARY_SELECT },
    },
  })
  if (!leaguePlayer) return null

  const leagueClanId = await leagueClanIdOfPlayer(league.id, leaguePlayer.clanId)
  // store.ts도 소속 리그클랜을 못 찾으면 404다
  if (!leagueClanId || !leaguePlayer.clan) return null

  const where: Prisma.MatchWhereInput = { leagueId: league.id, stats: { some: { playerId } } }

  const [rank, matchCount, record] = await Promise.all([
    playerRankOf({
      id: leaguePlayer.id,
      leagueId: leaguePlayer.leagueId,
      rating: leaguePlayer.rating,
      placement: leaguePlayer.placement,
    }),
    prisma.matchPlayerStat.count({ where: { playerId, match: { leagueId: league.id } } }),
    buildRecordSummary(where, leagueClanId, playerId),
  ])

  return {
    id: leaguePlayer.id,
    league_id: league.id,
    league: toLeagueSummary(league),
    player: toPlayerSummary(leaguePlayer.player),
    clan: toClanSummary(leaguePlayer.clan),
    rating: leaguePlayer.rating,
    win: leaguePlayer.win,
    lose: leaguePlayer.lose,
    win_rate: winRate(leaguePlayer.win, leaguePlayer.lose),
    /* 무소속리그면 누적 킬·데스·킬뎃만 비운다 (D-107).
       래더·승패·승률·평균킬·MVP·순위·최근 경기·경기별 K/D/A는 그대로다 */
    ...cumulativeKd(league, {
      kill: leaguePlayer.kill,
      death: leaguePlayer.death,
      kdRate: kdRate(leaguePlayer.kill, leaguePlayer.death),
    }),
    assist: leaguePlayer.assist,
    headshot: leaguePlayer.headshot,
    kill_per_match: killPerMatch(leaguePlayer.kill, matchCount),
    mvp_count: leaguePlayer.mvpCount,
    placement: leaguePlayer.placement,
    rank: rank.rank,
    rank_count: rank.rankCount,
    match_summary: record.summary,
    teammates: record.teammates,
  }
}

/* -------------------------------------------------------------------------- */
/* 지난시즌                                                                     */
/* -------------------------------------------------------------------------- */

/** GET /leagueplayers/{leaguePlayerId}/seasons */
export async function getLeaguePlayerSeasons(
  leaguePlayerId: string,
): Promise<LeaguePlayerSeason[] | null> {
  const leaguePlayer = await prisma.leaguePlayer.findUnique({
    where: { id: leaguePlayerId },
    select: { id: true, league: { select: { category: true } } },
  })
  if (!leaguePlayer) return null
  // 무소속리그 시즌 카드에서도 누적 킬·데스·킬뎃만 가린다 (D-107 13장)
  const hideKd = hidesCumulativeKd(leaguePlayer.league)

  /* 정렬은 번호가 아니라 **시작 시각** 내림차순이다.
     베타의 내부 번호는 0이라 번호로 정렬하면 Season 1보다 아래로 내려간다.
     사용자에게는 `… Season 7 → Beta Season → Season 8` 순서로 이어져야 한다 (D-098). */
  const rows = await prisma.leaguePlayerSeason.findMany({
    where: { leaguePlayerId },
    orderBy: [{ seasonRef: { startedAt: 'desc' } }, { id: 'asc' }],
    select: {
      season: true,
      rank: true,
      rankCount: true,
      rating: true,
      win: true,
      lose: true,
      kill: true,
      death: true,
      assist: true,
      headshot: true,
      winRate: true,
      kdRate: true,
      killPerMatch: true,
      mvpCount: true,
      nicknameAtSeason: true,
      clanNameAtSeason: true,
      divisionAtSeason: true,
      source: true,
      seasonRef: { select: { seasonType: true, number: true } },
    },
  })

  return rows.map((row) => ({
    season: row.season,
    season_label: seasonLabel(row.seasonRef),
    season_type: row.seasonRef.seasonType as SeasonType,
    rank: row.rank,
    rank_count: row.rankCount,
    rating: row.rating,
    win: row.win,
    lose: row.lose,
    /* 원본이 준 승률·킬뎃이 있으면 그대로 쓴다 (D-099).
       없고 **승패·킬데스도 모르면** 계산하지 않는다 — 0/0을 0%로 만들지 않는다 (D-106) */
    win_rate: row.winRate ?? winRateOrNull(row.win, row.lose),
    kill: hideKd ? null : row.kill,
    death: hideKd ? null : row.death,
    kd_rate: hideKd ? null : (row.kdRate ?? kdRateOrNull(row.kill, row.death)),
    assist: row.assist,
    headshot: row.headshot,
    kill_per_match: row.killPerMatch,
    mvp_count: row.mvpCount,
    nickname_at_season: row.nicknameAtSeason,
    clan_name_at_season: row.clanNameAtSeason,
    division_at_season: row.divisionAtSeason,
    source: row.source,
  }))
}

/** GET /leagueclans/{leagueClanId}/seasons */
export async function getLeagueClanSeasons(
  leagueClanId: string,
): Promise<LeagueClanSeason[] | null> {
  const leagueClan = await prisma.leagueClan.findUnique({
    where: { id: leagueClanId },
    select: { id: true },
  })
  if (!leagueClan) return null

  /* 정렬은 선수 카드와 같은 이유로 **시작 시각** 기준이다 (베타 번호가 0이라서, D-098) */
  const rows = await prisma.leagueClanSeason.findMany({
    where: { leagueClanId },
    orderBy: [{ seasonRef: { startedAt: 'desc' } }, { id: 'asc' }],
    select: {
      season: true,
      rank: true,
      rankCount: true,
      rating: true,
      division: true,
      win: true,
      lose: true,
      seasonRef: { select: { seasonType: true, number: true } },
    },
  })

  return rows.map((row) => ({
    season: row.season,
    season_label: seasonLabel(row.seasonRef),
    season_type: row.seasonRef.seasonType as SeasonType,
    rank: row.rank,
    rank_count: row.rankCount,
    rating: row.rating,
    division: row.division,
    win: row.win,
    lose: row.lose,
    win_rate: winRate(row.win, row.lose),
  }))
}
