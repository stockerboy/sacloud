/**
 * 시즌 운영 (Phase 9 — D-077 · D-085).
 *
 * **자동으로 도는 것이 하나도 없다.** 전부 운영자가 명령으로 부를 때만 실행된다.
 * 날짜·배포·월 변경으로 시즌이 넘어가지 않는다.
 *
 * 순서는 이렇게만 한다.
 *   1. `season --close`  현재 시즌을 닫고 **최종 랭킹 스냅샷**을 남긴다
 *   2. `season --start`  다음 시즌을 만들고 승강을 반영한 뒤 **전원 같은 점수**로 시작한다
 *
 * 지난 시즌 기록(경기·참가기록·시즌 통계·스냅샷)은 **건드리지 않는다**.
 * 바뀌는 것은 "지금 시즌의 현재 점수"와 division뿐이다.
 */
import { prisma } from '@sacloud/db'
import { DEFAULT_RATING_CONSTANTS, seasonStartRating, type RatingConstants } from '@sacloud/rating'
import { log, warn } from '../lib/log.js'
import type { JobContext } from './context.js'

export interface SeasonStatus {
  league: string
  activeSeason: number | null
  startedAt: Date | null
  matchesInSeason: number
  officialMatches: number
  referenceMatches: number
}

export async function seasonStatus(leagueSlug: string): Promise<SeasonStatus | null> {
  const league = await prisma.league.findUnique({
    where: { slug: leagueSlug },
    select: { id: true, slug: true },
  })
  if (!league) return null

  const active = await prisma.season.findFirst({
    where: { leagueId: league.id, status: 'active' },
    orderBy: { number: 'desc' },
    select: { number: true, startedAt: true, endedAt: true },
  })

  const window = active
    ? { gte: active.startedAt, ...(active.endedAt ? { lt: active.endedAt } : {}) }
    : undefined

  const [total, official] = await Promise.all([
    prisma.match.count({
      where: { leagueId: league.id, origin: 'nexon', ...(window ? { startAt: window } : {}) },
    }),
    prisma.match.count({
      where: {
        leagueId: league.id,
        origin: 'nexon',
        official: true,
        ...(window ? { startAt: window } : {}),
      },
    }),
  ])

  return {
    league: league.slug,
    activeSeason: active?.number ?? null,
    startedAt: active?.startedAt ?? null,
    matchesInSeason: total,
    officialMatches: official,
    referenceMatches: total - official,
  }
}

export interface SeasonCloseResult {
  season: number | null
  clanRows: number
  playerRows: number
  endedAt: Date | null
}

/**
 * 시즌 종료 — **최종 랭킹을 스냅샷으로 굳힌다**.
 *
 * 스냅샷을 남기는 이유: 새 시즌이 시작되면 현재 점수가 초기화되므로,
 * 그 전에 "그 시즌의 최종 순위"를 따로 저장해 두지 않으면 되살릴 수 없다.
 */
export async function runSeasonClose(
  ctx: JobContext,
  input: { leagueSlug: string; endedAt?: Date },
): Promise<SeasonCloseResult> {
  const empty: SeasonCloseResult = { season: null, clanRows: 0, playerRows: 0, endedAt: null }
  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true, divisionCount: true },
  })
  if (!league) {
    warn(`리그를 찾을 수 없다: ${input.leagueSlug}`)
    return empty
  }

  const active = await prisma.season.findFirst({
    where: { leagueId: league.id, status: 'active' },
    orderBy: { number: 'desc' },
  })
  if (!active) {
    warn('활성 시즌이 없다. 먼저 시즌을 만들어야 한다')
    return empty
  }

  const endedAt = input.endedAt ?? new Date()

  const clans = await prisma.leagueClan.findMany({
    where: { leagueId: league.id },
    orderBy: [{ division: 'asc' }, { rating: 'desc' }],
    select: {
      id: true,
      division: true,
      rating: true,
      win: true,
      lose: true,
      placement: true,
      clan: { select: { slug: true, name: true } },
    },
  })
  const players = await prisma.leaguePlayer.findMany({
    where: { leagueId: league.id },
    orderBy: { rating: 'desc' },
    select: {
      id: true,
      rating: true,
      win: true,
      lose: true,
      placement: true,
      player: { select: { id: true, name: true } },
    },
  })

  if (ctx.dryRun) {
    log(`[dry-run] 시즌 ${active.number} 종료 — 클랜 ${clans.length} · 선수 ${players.length}`)
    return { season: active.number, clanRows: clans.length, playerRows: players.length, endedAt }
  }

  // 부리그별 클랜 랭킹 스냅샷
  for (let division = 1; division <= Math.max(1, league.divisionCount); division += 1) {
    const rows = clans
      .filter((clan) => clan.division === division && !clan.placement)
      .map((clan, index) => ({
        rank: index + 1,
        league_clan_id: clan.id,
        clan: { slug: clan.clan.slug, name: clan.clan.name },
        win: clan.win,
        lose: clan.lose,
        rating: clan.rating,
      }))
    await prisma.rankSnapshot.upsert({
      where: {
        leagueId_kind_division_seasonNumber: {
          leagueId: league.id,
          kind: 'clan',
          division,
          seasonNumber: active.number,
        },
      },
      create: {
        leagueId: league.id,
        kind: 'clan',
        division,
        seasonNumber: active.number,
        payload: rows,
      },
      update: { payload: rows, generatedAt: new Date() },
    })
  }

  const playerRows = players
    .filter((player) => !player.placement)
    .map((player, index) => ({
      rank: index + 1,
      league_player_id: player.id,
      player: { id: player.player.id, name: player.player.name },
      win: player.win,
      lose: player.lose,
      rating: player.rating,
    }))
  // 개인 랭킹은 부리그 구분이 없다(`division = null`). Prisma는 복합 유니크의 null을
  // where에 넣지 못하므로 찾아서 갱신한다
  const existingPlayerSnapshot = await prisma.rankSnapshot.findFirst({
    where: {
      leagueId: league.id,
      kind: 'player',
      division: null,
      seasonNumber: active.number,
    },
    select: { id: true },
  })
  if (existingPlayerSnapshot) {
    await prisma.rankSnapshot.update({
      where: { id: existingPlayerSnapshot.id },
      data: { payload: playerRows, generatedAt: new Date() },
    })
  } else {
    await prisma.rankSnapshot.create({
      data: {
        leagueId: league.id,
        kind: 'player',
        division: null,
        seasonNumber: active.number,
        payload: playerRows,
      },
    })
  }

  await prisma.season.update({
    where: { id: active.id },
    data: { status: 'closed', endedAt },
  })

  log(
    `시즌 ${active.number} 종료 — 최종 랭킹 스냅샷 저장 (클랜 ${clans.length} · 선수 ${playerRows.length})`,
  )
  log('경기·참가기록·시즌 통계는 그대로 보존된다')
  return { season: active.number, clanRows: clans.length, playerRows: playerRows.length, endedAt }
}

export interface SeasonOpenResult {
  season: number | null
  startedAt: Date | null
  promoted: string | null
  relegated: string | null
  players: number
  clans: number
  baseline: number
}

/**
 * 새 시즌 시작 — 승강 반영 + **전원 같은 출발점** (D-064 · D-086).
 *
 * 승강 기본안: **1부 최하위 ↔ 2부 최상위** 1팀 교환. 플레이오프는 넣지 않는다.
 * 시즌 중에는 절대 승강하지 않는다 — 이 명령을 부를 때만 바뀐다.
 */
export async function runSeasonOpen(
  ctx: JobContext,
  input: {
    leagueSlug: string
    startedAt?: Date
    number?: number
    /** 승강을 건너뛴다 (운영자가 따로 정하는 경우) */
    skipPromotion?: boolean
    constants?: RatingConstants
  },
): Promise<SeasonOpenResult> {
  const constants = input.constants ?? DEFAULT_RATING_CONSTANTS
  const baseline = seasonStartRating(constants)
  const empty: SeasonOpenResult = {
    season: null,
    startedAt: null,
    promoted: null,
    relegated: null,
    players: 0,
    clans: 0,
    baseline,
  }

  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true, divisionCount: true },
  })
  if (!league) {
    warn(`리그를 찾을 수 없다: ${input.leagueSlug}`)
    return empty
  }

  const stillActive = await prisma.season.findFirst({
    where: { leagueId: league.id, status: 'active' },
    select: { number: true },
  })
  if (stillActive) {
    warn(`시즌 ${stillActive.number}이 아직 열려 있다. 먼저 --close 로 닫는다`)
    return empty
  }

  const last = await prisma.season.findFirst({
    where: { leagueId: league.id },
    orderBy: { number: 'desc' },
    select: { number: true },
  })
  const number = input.number ?? (last?.number ?? 0) + 1
  const startedAt = input.startedAt ?? new Date()

  /* ---- 승강: 1부 최하위 ↔ 2부 최상위 ---- */
  let promoted: string | null = null
  let relegated: string | null = null
  if (!input.skipPromotion && league.divisionCount >= 2) {
    const div1Bottom = await prisma.leagueClan.findFirst({
      where: { leagueId: league.id, division: 1, placement: false },
      orderBy: { rating: 'asc' },
      select: { id: true, clan: { select: { name: true } } },
    })
    const div2Top = await prisma.leagueClan.findFirst({
      where: { leagueId: league.id, division: 2, placement: false },
      orderBy: { rating: 'desc' },
      select: { id: true, clan: { select: { name: true } } },
    })
    if (div1Bottom && div2Top) {
      promoted = div2Top.clan.name
      relegated = div1Bottom.clan.name
      if (!ctx.dryRun) {
        await prisma.leagueClan.update({ where: { id: div1Bottom.id }, data: { division: 2 } })
        await prisma.leagueClan.update({ where: { id: div2Top.id }, data: { division: 1 } })
      }
    } else {
      log('승강 대상이 없다 (배치고사를 마친 클랜이 부족하다)')
    }
  }

  const players = await prisma.leaguePlayer.count({ where: { leagueId: league.id } })
  const clans = await prisma.leagueClan.count({ where: { leagueId: league.id } })

  if (ctx.dryRun) {
    log(
      `[dry-run] 시즌 ${number} 시작 (${startedAt.toISOString()}) — ` +
        `승격 ${promoted ?? '없음'} · 강등 ${relegated ?? '없음'} · 전원 ${baseline}점`,
    )
    return { season: number, startedAt, promoted, relegated, players, clans, baseline }
  }

  await prisma.season.create({
    data: { leagueId: league.id, number, startedAt, status: 'active' },
  })

  // 새 시즌은 개인·클랜 모두 같은 점수에서 시작한다 (soft reset 폐기 — D-064)
  await prisma.leaguePlayer.updateMany({
    where: { leagueId: league.id },
    data: { rating: baseline, baseRating: baseline, placement: true, placementPlayed: 0 },
  })
  await prisma.leagueClan.updateMany({
    where: { leagueId: league.id },
    data: { rating: baseline, placement: true, placementPlayed: 0 },
  })

  log(
    `시즌 ${number} 시작 (${startedAt.toISOString()}) — 선수 ${players} · 클랜 ${clans} 전부 ${baseline}점`,
  )
  if (promoted) log(`승격 ${promoted} ↔ 강등 ${relegated}`)
  log('지난 시즌 기록과 최종 랭킹 스냅샷은 그대로 남아 있다')
  return { season: number, startedAt, promoted, relegated, players, clans, baseline }
}
