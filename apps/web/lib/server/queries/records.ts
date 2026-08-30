import { prisma, type Prisma } from '@sacloud/db'
import {
  buildTodayPerformance,
  kdRate,
  kdRateOrNull,
  killPerMatch,
  winRate,
  winRateOrNull,
  type LeagueClanSeason,
  type PlayerTodayPerformance,
  type TodayPerformance,
  type LeagueClanShow,
  type LeaguePlayerDetail,
  type LeaguePlayerSeason,
  type MatchSummary,
  type OpponentSummaryEntry,
  type PlayerRankRow,
  type Streak,
  type SeasonType,
  type TeamSide,
  type TeammateStat,
} from '@sacloud/contract'
import { cursorPage, type CursorPage } from '../cursorPage'
import { withLadderMatch } from './ladderScope'
import { seasonWindowWhere } from './season0Scope'
import { buildPlayerForm } from './playerForm'
import { playerTodayTally } from './todayPerformance'
import { playerRecentDays } from './recentDays'
import { playerTraits } from './playerTraits'
import { toKstIso } from '../format'
import {
  CLAN_SUMMARY_SELECT,
  LEAGUE_SUMMARY_SELECT,
  PLAYER_SUMMARY_SELECT,
  toClanSummary,
  toClanSummaryOrNull,
  toLeagueSummary,
  toPlayerSummary,
  type ClanFields,
} from '../mappers'
/* 화면 표기는 계약이 정한다 — 베타는 `시즌0` (D-178) */
import { seasonDisplayLabel as seasonLabel } from '@sacloud/contract'
import { cumulativeKd, cumulativeKdRate, hidesCumulativeKd } from './visibility'
import { clanRankOf, matchCountByPlayer, playerRankOf, playerWeaponRankOf } from './leagues'
import { playerLadderTotals } from './playerTotals'
import {
  leagueClanIdOfPlayer,
  loadLeagueClanContext,
  sideOfLeagueClan,
  type LeagueClanContext,
} from './matches'

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

/**
 * 최근 20전 요약에 필요한 최소 컬럼. 매치마다 추가 쿼리를 내지 않도록 한 번에 읽는다.
 *
 * 상대 클랜은 `redClan{clan}` · `blueClan{clan}` 으로 읽지 않는다 — Prisma 는 중첩 관계마다
 * 쿼리를 따로 던지므로 그것만으로 왕복이 4번 늘어난다. `loadLeagueClanContext` 로 모아 읽는다.
 */
const SUMMARY_MATCH_SELECT = {
  winnerSide: true,
  redLeagueClanId: true,
  blueLeagueClanId: true,
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
/**
 * 이 경기를 **누구의 눈으로 보는가** (D-135).
 *
 * 선수 기록실이면 그 선수가 실제로 뛴 진영, 클랜 기록실이면 그 클랜의 진영이다.
 * 선수의 현재 소속으로 판정하지 않는다 — 무소속이거나 이적했으면 어긋난다.
 */
function sideOfPlayerOrClan(
  match: { redLeagueClanId: string; blueLeagueClanId: string; stats?: { playerId: string; side: string }[] },
  leagueClanId: string,
  playerId: string | null,
): TeamSide | null {
  if (playerId) {
    const stat = match.stats?.find((row) => row.playerId === playerId)
    if (stat) return stat.side as TeamSide
  }
  return sideOfLeagueClan(match, leagueClanId)
}

function buildMatchSummary(
  matches: SummaryMatchRow[],
  streak: Streak,
  leagueClanId: string,
  playerId: string | null,
  clans: LeagueClanContext,
): MatchSummary {
  let win = 0
  let lose = 0
  const opponentMap = new Map<
    string,
    { clan: ClanFields; win: number; lose: number; kill: number; death: number }
  >()

  for (const match of matches) {
    /* 선수 기록실은 **그 경기에서 본인이 뛴 팀** 기준이다 (D-131 · D-135).
       고정된 현재 소속으로 판정하면 이적한 선수와 무소속 선수의 요약이 통째로 비어 버린다. */
    const side = sideOfPlayerOrClan(match, leagueClanId, playerId)
    if (!side) continue
    const won = match.winnerSide === side
    if (won) win += 1
    else lose += 1

    const opponentId = side === 'red' ? match.blueLeagueClanId : match.redLeagueClanId
    const entry = opponentMap.get(opponentId) ?? {
      clan: clans.get(opponentId)?.clan ?? EMPTY_CLAN,
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
      /* KDA 를 모르는 참가자는 합계에서 뺀다. 0으로 더하면 평균이 거짓이 된다 (D-148) */
      entry.kill += stat.kill ?? 0
      entry.death += stat.death ?? 0
    }
    opponentMap.set(opponentId, entry)
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
/** 우리 리그 밖의 리그클랜이라 정보를 못 찾았을 때. 비어 있는 것을 그대로 드러낸다 */
const EMPTY_CLAN: ClanFields = {
  id: '',
  slug: '',
  name: '',
  markBgUrl: null,
  markFrontUrl: null,
  sourceClanId: null,
}

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
 *
 * **최근 20전을 씨앗으로 받는다.** 요약에서 이미 읽어 온 바로 그 경기들이고
 * 정렬·필터가 같으므로 다시 읽을 이유가 없다. 20연승/20연패가 아닌 이상 여기서 끝나서
 * 쿼리가 한 번도 나가지 않는다. 예전에는 무조건 200건짜리 쿼리를 한 번 더 던졌다.
 */
async function buildStreak(
  where: Prisma.MatchWhereInput,
  leagueClanId: string,
  seed: readonly StreakMatchRow[],
): Promise<Streak> {
  let type: Streak['type'] = 'none'
  let count = 0

  /** 결과가 뒤집히면 그 자리에서 확정한다. 아니면 `null`(더 봐야 한다) */
  const consume = (rows: readonly StreakMatchRow[]): Streak | null => {
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
    return null
  }

  const fromSeed = consume(seed)
  if (fromSeed) return fromSeed
  // 씨앗이 한 페이지를 못 채웠다면 그게 전부다
  if (seed.length < RECENT_MATCH_COUNT) return { type, count }

  let skip = seed.length
  for (;;) {
    const rows: StreakMatchRow[] = await prisma.match.findMany({
      where,
      orderBy: MATCH_ORDER,
      skip,
      take: STREAK_CHUNK,
      select: STREAK_MATCH_SELECT,
    })
    if (rows.length === 0) return { type, count }

    const done = consume(rows)
    if (done) return done

    if (rows.length < STREAK_CHUNK) return { type, count }
    skip += STREAK_CHUNK
  }
}

/**
 * 최근 20전 + 연승/연패를 한 번에 만든다.
 *
 * **래더에 반영된 경기만 넣는다.**
 * 경기 목록에는 전부 보이지만 승·패·승률·연승·킬뎃·팀원 집계에는 래더 경기만 넣는다.
 * 이걸 빼기 전에는 집계 대상이 아닌 경기 한 판이 `1전 1승 0패 (100%)`로 표시됐다.
 *
 * 판정 기준은 `official` 라벨이 **아니라** 래더 반영 여부다 (D-148 · D-164).
 * D-145 에서 `official` 은 래더와 무관해졌다 — 기준은 정상 5v5 인가뿐이다.
 * 라벨로 거르면 래더는 오르는데 `0전 0승 0패` 로 보인다. 실제로 그랬다.
 * replay 는 래더 대상이 아닌 경기의 증감을 지우므로 이 값은 항상 최신이다.
 *
 * `redRatingUpdate` 만 보면 **미러링한 경기가 통째로 빠진다** — 그 칸은 우리 공식이
 * 채우는 것이라 3rd.supply 경기에는 없다 (D-153). 조건은 `ladderScope.ts` 한 곳에 있다.
 *
 * mock 픽스처는 전부 증감을 들고 있어(3000/3000) 이 조건이
 * mock↔live 대조 결과를 바꾸지 않는다.
 *
 * **현재 시즌(시즌0) 창도 같이 건다** (D-178). 이 요약은 상세정보 옆에 나란히 붙는
 * 성적 수치라 모집단이 다르면 같은 카드 안에서 숫자가 어긋난다 — D-176 이 그 사고였다.
 * 창 밖(2026-03 이전) 경기는 **경기 목록·매치 상세에서는 그대로 보인다.** 여기서만 뺀다.
 */
async function buildRecordSummary(
  leagueId: string,
  where: Prisma.MatchWhereInput,
  leagueClanId: string,
  playerId: string | null,
): Promise<{ summary: MatchSummary; teammates: TeammateStat[] }> {
  /* `where` 에 이미 `OR` 가 있을 수 있어 펼치지 않고 `AND` 로 감싼다 (D-164) */
  const ratedOnly: Prisma.MatchWhereInput = withLadderMatch({
    AND: [where, seasonWindowWhere()],
  })
  const recent = await prisma.match.findMany({
    where: ratedOnly,
    orderBy: MATCH_ORDER,
    take: RECENT_MATCH_COUNT,
    select: SUMMARY_MATCH_SELECT,
  })

  /* 상대 클랜 정보와 연승연패는 서로를 기다릴 이유가 없다.
     연승연패는 위에서 읽은 20건으로 대개 그 자리에서 끝난다(쿼리 0회) */
  const [clans, streak] = await Promise.all([
    loadLeagueClanContext(
      leagueId,
      recent.flatMap((match) => [match.redLeagueClanId, match.blueLeagueClanId]),
    ),
    buildStreak(ratedOnly, leagueClanId, recent),
  ])

  return {
    summary: buildMatchSummary(recent, streak, leagueClanId, playerId, clans),
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
    buildRecordSummary(leagueClan.leagueId, where, leagueClan.id, null),
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
 * `오늘 퍼포먼스` 를 계약 모양(snake_case)으로 옮긴다 (D-182).
 *
 * 계산은 `@sacloud/contract` 의 `buildTodayPerformance()` 가 전부 한다.
 * 여기서 값을 손보지 않는다 — 문구까지 이미 만들어져 온다.
 */
function toTodayPerformance(value: TodayPerformance): PlayerTodayPerformance {
  return {
    games: value.games,
    known_games: value.knownGames,
    win: value.win,
    lose: value.lose,
    win_rate: value.winRate,
    kd_rate: value.kdRate,
    season_kd_rate: value.seasonKdRate,
    delta: value.delta,
    trend: value.trend,
    sentence: value.sentence,
  }
}

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
      /* 기록실 사이드 `상세정보` 의 `포지션` 줄이 이 값을 쓴다 (D-161).
         `PLAYER_SUMMARY_SELECT` 를 넓히지 않는다 — 라인업·최근 같이한 플레이어처럼
         이 값이 필요 없는 곳까지 매 행마다 두 칸을 더 읽게 된다 */
      player: { select: { ...PLAYER_SUMMARY_SELECT, position: true, note: true } },
      clan: { select: CLAN_SUMMARY_SELECT },
    },
  })
  if (!leaguePlayer) return null

  /* 소속 클랜이 없어도 선수는 존재한다 (D-135).
     D-134로 무소속·용병도 정상적인 선수가 됐다. 클랜이 없다는 이유로 404를 내면
     개인 랭킹에는 보이는 사람의 프로필이 열리지 않는다. 계약도 `clan`을 nullable로 둔다.

     **기다리지 않고 시작만 해 둔다.** 순위·무기별 집계는 이 값을 쓰지 않으므로
     여기서 `await` 하면 뒤의 모든 조회가 왕복 한 번만큼 뒤로 밀린다. */
  const leagueClanIdPromise = leagueClanIdOfPlayer(league.id, leaguePlayer.clanId)

  const where: Prisma.MatchWhereInput = { leagueId: league.id, stats: { some: { playerId } } }

  const [rank, sniperRank, rifleRank, totals, weaponStats, record, form, todayTally, traits, recentDays] =
    await Promise.all([
      playerRankOf({
        id: leaguePlayer.id,
        leagueId: leaguePlayer.leagueId,
        rating: leaguePlayer.rating,
        placement: leaguePlayer.placement,
      }),
      // 무기별 랭킹 — 무기가 확인된 경기가 없으면 null 이다 (D-146)
      playerWeaponRankOf(leaguePlayer.id, league.id, 1),
      playerWeaponRankOf(leaguePlayer.id, league.id, 0),
      /* 누적 전적을 **경기에서 직접 센다** (D-176).
         예전에는 `LeaguePlayer` 의 누적 칸을 읽었는데, 그 칸은 배치 집계가 채우는 값이라
         집계가 훑는 기간(시즌 창) 밖의 경기가 한 판도 들어가지 않았다. 그래서 같은 화면에서
         `최근매치` 는 `20전 11승 9패` 인데 `상세정보` 는 `0승 0패 · 0킬 0데스 · MVP 0회` 가 됐다.
         기준은 `최근매치` 와 **똑같이** "래더에 반영된 경기" 하나뿐이다 (D-164). */
      playerLadderTotals(league.id, playerId),
      // 무기별 누적도 나머지와 같이 나간다. 예전에는 응답을 만들며 마지막에 홀로 기다렸다
      weaponStatsOf(leaguePlayer.id),
      leagueClanIdPromise.then((leagueClanId) =>
        buildRecordSummary(league.id, where, leagueClanId ?? '', playerId),
      ),
      /* 최근 폼 — 6개월 월별 킬뎃 + 최근 10경기 판정 (D-167).
         소속 클랜을 보지 않으므로 `leagueClanIdPromise` 를 기다릴 이유가 없다 */
      buildPlayerForm(league.id, playerId),
      /* 오늘 퍼포먼스 — 재료만 센다 (10절 · D-182).
         시즌 평균과 견주는 일은 `buildTodayPerformance()` 가 아래에서 한다.
         그래야 `totals` 를 기다리지 않고 **같이** 나갈 수 있다 */
      playerTodayTally(league.id, playerId),
      /* 전투력 육각형 + 플레이스타일 바 (4절 · 8절 · D-185).
         리그 분포는 캐시돼 있어 보통은 즉시 돌아온다 (`playerTraits.ts`).

         **여기서 실패해도 프로필 전체를 죽이지 않는다.** 육각형은 없어도 되는 카드이고
         계약도 `nullable` 이다. 분포 계산은 리그 전체를 훑으므로 다른 조회보다 깨질 여지가
         크다 — 그 하나 때문에 기록실이 통째로 안 열리면 안 된다 */
      playerTraits(league.id, playerId).catch(() => null),
      /* 최근 3일치 일별 기록 (D-198). 실패해도 카드 전체를 죽이지 않는다 */
      playerRecentDays(league.id, playerId).catch(() => []),
    ])

  return {
    id: leaguePlayer.id,
    league_id: league.id,
    league: toLeagueSummary(league),
    player: {
      ...toPlayerSummary(leaguePlayer.player),
      /* 선수가 직접 설정하는 값이다 (D-161). 없으면 `null` 이고 화면은 줄을 그리지 않는다.
         `-` 나 `알수없음` 으로 채우지 않는다 (D-099 · D-106) */
      position: leaguePlayer.player.position,
      note: leaguePlayer.player.note,
    },
    clan: toClanSummaryOrNull(leaguePlayer.clan),
    rating: leaguePlayer.rating,
    win: totals.win,
    lose: totals.lose,
    win_rate: winRate(totals.win, totals.lose),
    /* 무소속리그면 누적 킬·데스·킬뎃만 비운다 (D-107).
       래더·승패·승률·평균킬·MVP·순위·최근 경기·경기별 K/D/A는 그대로다 */
    ...cumulativeKd(league, {
      kill: totals.kill,
      death: totals.death,
      kdRate: totals.kdRate,
    }),
    /* 어시·헤드샷은 계약이 숫자만 받는다. 아는 경기가 하나도 없으면 `null` 이 오는데
       그때만 0으로 내린다 — 그 이상은 채우지 않는다 ([미확인] 계약을 nullable 로
       넓힐지는 화면 작업과 함께 판단한다) */
    assist: totals.assist ?? 0,
    headshot: totals.headshot ?? 0,
    /* 평균킬 — 분자·분모가 **같은 집계**에서 나와야 한다 (D-172).
       분자는 K/D 를 아는 경기의 킬 합이므로 분모도 그 판수다 (D-149) */
    kill_per_match: killPerMatch(totals.kill ?? 0, totals.knownGames),
    mvp_count: totals.mvpCount,
    placement: leaguePlayer.placement,
    rank: rank.rank,
    rank_count: rank.rankCount,
    /* 무기별 전적 (D-149 · D-176).
       **순위**는 선수끼리 비교하는 값이라 레이팅 엔진이 채운 `LeaguePlayerWeaponStat`
       에서 온다(목록과 모집단이 같아야 한다). **기록**은 통합 전적과 같은 근거에서
       그 자리에서 센다 — 둘이 다른 곳에서 오면 나란히 놓았을 때 어긋난다.
       K/D 정의는 통합과 **하나**다: `킬 / (킬 + 데스) × 100` */
    sniper_rank: sniperRank.rank,
    sniper_rank_count: sniperRank.rankCount,
    sniper_games: totals.sniper.games,
    sniper_known_games: totals.sniper.knownGames,
    sniper_kill: totals.sniper.kill,
    sniper_death: totals.sniper.death,
    sniper_assist: totals.sniper.assist,
    sniper_kd_rate: totals.sniper.kdRate,
    rifle_rank: rifleRank.rank,
    rifle_rank_count: rifleRank.rankCount,
    rifle_games: totals.rifle.games,
    rifle_known_games: totals.rifle.knownGames,
    rifle_kill: totals.rifle.kill,
    rifle_death: totals.rifle.death,
    rifle_assist: totals.rifle.assist,
    rifle_kd_rate: totals.rifle.kdRate,
    match_summary: record.summary,
    /* 최근 폼 (D-167). 원본에 없는 화면이다 — 사용자 요구로 추가했다 */
    form,
    /* 오늘 퍼포먼스 (10절 · D-182). 폼 판정은 **킬데스만** 본다 —
       기준은 상세정보와 같은 모집단에서 나온 시즌 평균이다 */
    today: toTodayPerformance(buildTodayPerformance(todayTally, totals.kdRate)),
    /* 최근 3일치 일별 기록 (D-198). 첫 줄은 언제나 오늘이다 */
    recent_days: recentDays,
    /* 전투력 육각형 · 플레이스타일 바 (4절 · 8절 · D-185).
       모양을 손보지 않는다 — `buildPlayerTraits()` 가 계약 모양 그대로 만들어 준다.
       계산이 실패했으면 `null` 이고 화면은 카드를 그리지 않는다 */
    traits: traits?.traits ?? null,
    playstyle: traits?.playstyle ?? null,
    teammates: record.teammates,
    weapon_stats: weaponStats,
  }
}

/* -------------------------------------------------------------------------- */
/* 지난시즌                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * 무기별 누적 (D-115).
 *
 * 판정된 경기만 들어 있다. `unknown`은 여기 오지 않고 통합 기록에만 남는다.
 * 버킷이 없으면 **빈 배열**이다 — 0으로 채운 가짜 줄을 만들지 않는다.
 */
async function weaponStatsOf(leaguePlayerId: string) {
  const rows = await prisma.leaguePlayerWeaponStat.findMany({
    where: { leaguePlayerId },
    orderBy: { weapon: 'asc' },
    select: { weapon: true, win: true, lose: true, kill: true, death: true },
  })

  return rows.map((row) => {
    const games = row.win + row.lose
    return {
      weapon: row.weapon as 0 | 1,
      games,
      win: row.win,
      lose: row.lose,
      kill: row.kill,
      death: row.death,
      kd_rate: kdRate(row.kill, row.death),
      kill_per_match: killPerMatch(row.kill, games),
    }
  })
}

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
