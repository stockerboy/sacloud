/**
 * 래더 반영 (Phase 9 — domain integration).
 *
 * 계산은 전부 `@sacloud/rating`(순수 함수)이 한다. 여기서는 **읽고 받아 적기만** 한다.
 *
 * ── 결정적 replay
 *   시작 상태를 초기화하고 `startAt` 오름차순(같으면 id 순)으로 전 경기를 다시 계산한다.
 *   그래서 몇 번을 돌려도 같은 값이 나오고, 상수를 바꾸면 전 시즌이 일관되게 다시 계산된다.
 *   "이번에 들어온 경기만 증분 반영"하지 않는다 — 그러면 순서에 따라 결과가 달라진다.
 *
 * ── 안전장치
 *   - mock 시드가 있는 리그는 건드리지 않는다 (D-023). `--allow-mock-league`로만 푼다
 *   - `origin="nexon"` 경기만 계산한다. 과거 3rd.supply 기록은 **재계산하지 않는다** (스펙 §9)
 *   - 확인되지 않은 참가자의 개인 점수를 만들지 않는다 (D-067) —
 *     애초에 `MatchPlayerStat`에 그런 행이 없다
 *   - 무기별 분리는 하지 않는다. 넥슨이 무기를 주지 않기 때문이다 (D-034).
 *     증감은 전량 `baseRating`에 누적하고 무기 delta는 0으로 둔다
 *     (그래야 `통합 = base + sniper + rifle` 불변식이 깨지지 않는다)
 */
import { prisma } from '@sacloud/db'
import {
  CLAN_FORMULA_VERSION,
  DEFAULT_RATING_CONSTANTS,
  PERSONAL_FORMULA_VERSION,
  rateMatch,
  seasonSoftReset,
  type ConfirmedParticipant,
  type RatingConstants,
} from '@sacloud/rating'
import { log, warn } from '../lib/log.js'
import type { JobContext } from './context.js'

export interface RateRunResult {
  league: string
  matchesConsidered: number
  matchesRated: number
  playersUpdated: number
  clansUpdated: number
  skipped: Record<string, number>
  formulaVersion: string
}

const DAY_MS = 24 * 60 * 60 * 1000

/** 두 클랜 쌍을 순서에 무관하게 식별한다 */
function pairKey(left: string, right: string): string {
  return left < right ? `${left}|${right}` : `${right}|${left}`
}

/**
 * 리그 하나의 래더를 **처음부터 다시 계산한다**.
 *
 * `dryRun`이면 아무것도 쓰지 않고 계산 결과만 돌려준다.
 */
export async function runRate(
  ctx: JobContext,
  input: {
    leagueSlug: string
    allowMockLeague?: boolean
    constants?: RatingConstants
  },
): Promise<RateRunResult> {
  const constants = input.constants ?? DEFAULT_RATING_CONSTANTS
  const result: RateRunResult = {
    league: input.leagueSlug,
    matchesConsidered: 0,
    matchesRated: 0,
    playersUpdated: 0,
    clansUpdated: 0,
    skipped: {},
    formulaVersion: `${PERSONAL_FORMULA_VERSION}+${CLAN_FORMULA_VERSION}`,
  }

  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true, slug: true },
  })
  if (!league) {
    warn(`리그를 찾을 수 없다: ${input.leagueSlug}`)
    return result
  }

  const mockCount = await prisma.match.count({ where: { leagueId: league.id, origin: 'mock' } })
  if (mockCount > 0 && input.allowMockLeague !== true) {
    warn(`mock 시드 경기가 ${mockCount}건 있는 리그다. 섞지 않는다 (--allow-mock-league로 강제)`)
    result.skipped['mock_league'] = mockCount
    return result
  }

  /* ---- 1) 계산 대상: 재구성된 넥슨 경기만, 시간 순 ---- */
  const matches = await prisma.match.findMany({
    where: { leagueId: league.id, origin: 'nexon' },
    orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      startAt: true,
      redLeagueClanId: true,
      blueLeagueClanId: true,
      winnerSide: true,
      stats: { select: { playerId: true, side: true, kill: true, death: true, assist: true } },
    },
  })
  result.matchesConsidered = matches.length

  if (matches.length === 0) {
    log('재구성된 넥슨 경기가 없다. 계산할 것이 없다')
    return result
  }

  /* ---- 2) 시작 상태 — 전부 초기값에서 다시 시작한다 (결정적 replay) ---- */
  const playerRating = new Map<string, number>()
  const playerMatches = new Map<string, number>()
  const clanRating = new Map<string, number>()
  const clanMatches = new Map<string, number>()
  /** 같은 클랜 쌍 · 같은 승자로 최근에 몇 번 만났는가 */
  const recentPairs: { key: string; winner: string; at: Date }[] = []

  const ratingOf = (playerId: string): number =>
    playerRating.get(playerId) ?? constants.initialRating
  const clanRatingOf = (leagueClanId: string): number =>
    clanRating.get(leagueClanId) ?? constants.initialRating

  interface PendingStat {
    matchId: string
    playerId: string
    ratingBefore: number
    ratingUpdate: number
    ratingAfter: number
    opponentAvgRating: number
    kUsed: number
    isPlacement: boolean
  }
  interface PendingMatch {
    matchId: string
    redBefore: number
    blueBefore: number
    redUpdate: number
    blueUpdate: number
    redPlacement: boolean
    bluePlacement: boolean
  }
  const pendingStats: PendingStat[] = []
  const pendingMatches: PendingMatch[] = []

  /* ---- 3) 순서대로 계산 ---- */
  for (const match of matches) {
    const participants: ConfirmedParticipant[] = match.stats.map((stat) => ({
      playerId: stat.playerId,
      leagueClanId: stat.side === 'red' ? match.redLeagueClanId : match.blueLeagueClanId,
      outcome: match.winnerSide === stat.side ? ('win' as const) : ('lose' as const),
      kill: stat.kill,
      death: stat.death,
      assist: stat.assist,
      // 저장된 행은 전부 "확인된 참가자"다. 근거 종류는 스테이징에 남아 있다
      sources: ['player_match_list' as const],
      ratingBefore: ratingOf(stat.playerId),
    }))

    const key = pairKey(match.redLeagueClanId, match.blueLeagueClanId)
    const winnerClanId =
      match.winnerSide === 'red' ? match.redLeagueClanId : match.blueLeagueClanId
    const windowStart = match.startAt.getTime() - constants.repeatWindowDays * DAY_MS
    const priorSameOutcome = recentPairs.filter(
      (entry) => entry.key === key && entry.winner === winnerClanId && entry.at.getTime() >= windowStart,
    ).length

    const placementPlayerIds = participants
      .filter((participant) => (playerMatches.get(participant.playerId) ?? 0) < constants.placementMatches)
      .map((participant) => participant.playerId)
    const placementClanIds = [match.redLeagueClanId, match.blueLeagueClanId].filter(
      (clanId) => (clanMatches.get(clanId) ?? 0) < constants.placementMatches,
    )

    const rated = rateMatch({
      participants,
      clanRatings: {
        [match.redLeagueClanId]: clanRatingOf(match.redLeagueClanId),
        [match.blueLeagueClanId]: clanRatingOf(match.blueLeagueClanId),
      },
      placementPlayerIds,
      placementClanIds,
      priorSameOutcome,
      constants,
    })

    if (!rated.eligibility.eligible) {
      // 재구성 단계에서 인정된 경기만 저장돼 있으므로 보통 여기 오지 않는다.
      // 그래도 방어한다 — 인정되지 않으면 **아무 점수도 만들지 않는다**
      result.skipped[rated.eligibility.status] = (result.skipped[rated.eligibility.status] ?? 0) + 1
      continue
    }

    for (const player of rated.players) {
      playerRating.set(player.playerId, player.ratingAfter)
      playerMatches.set(player.playerId, (playerMatches.get(player.playerId) ?? 0) + 1)
      pendingStats.push({
        matchId: match.id,
        playerId: player.playerId,
        ratingBefore: player.ratingBefore,
        ratingUpdate: player.ratingUpdate,
        ratingAfter: player.ratingAfter,
        opponentAvgRating: player.opponentAvgRating,
        kUsed: player.kUsed,
        isPlacement: player.isPlacement,
      })
    }

    const red = rated.clans.find((clan) => clan.leagueClanId === match.redLeagueClanId)!
    const blue = rated.clans.find((clan) => clan.leagueClanId === match.blueLeagueClanId)!
    clanRating.set(red.leagueClanId, red.ratingAfter)
    clanRating.set(blue.leagueClanId, blue.ratingAfter)
    clanMatches.set(red.leagueClanId, (clanMatches.get(red.leagueClanId) ?? 0) + 1)
    clanMatches.set(blue.leagueClanId, (clanMatches.get(blue.leagueClanId) ?? 0) + 1)

    pendingMatches.push({
      matchId: match.id,
      redBefore: red.ratingBefore,
      blueBefore: blue.ratingBefore,
      redUpdate: red.ratingUpdate,
      blueUpdate: blue.ratingUpdate,
      redPlacement: red.isPlacement,
      bluePlacement: blue.isPlacement,
    })

    recentPairs.push({ key, winner: winnerClanId, at: match.startAt })
    result.matchesRated += 1
  }

  if (ctx.dryRun) {
    log(`[dry-run] ${result.matchesRated}경기 계산 — 아무것도 쓰지 않았다`)
    result.playersUpdated = playerRating.size
    result.clansUpdated = clanRating.size
    return result
  }

  /* ---- 4) 받아 적기 ---- */
  for (const stat of pendingStats) {
    await prisma.matchPlayerStat.update({
      where: { matchId_playerId: { matchId: stat.matchId, playerId: stat.playerId } },
      data: {
        ratingBefore: stat.ratingBefore,
        ratingUpdate: stat.ratingUpdate,
        ratingAfter: stat.ratingAfter,
        opponentAvgRating: Math.round(stat.opponentAvgRating),
        kUsed: stat.kUsed,
        // 승리 배수를 쓰지 않는다 (D-060). 기록은 남긴다
        multiplierUsed: 1,
        isPlacement: stat.isPlacement,
        formulaVersion: PERSONAL_FORMULA_VERSION,
      },
    })
  }

  for (const match of pendingMatches) {
    await prisma.match.update({
      where: { id: match.matchId },
      data: {
        redRatingBefore: match.redBefore,
        blueRatingBefore: match.blueBefore,
        redRatingUpdate: match.redUpdate,
        blueRatingUpdate: match.blueUpdate,
        redPlacement: match.redPlacement,
        bluePlacement: match.bluePlacement,
      },
    })
  }

  /* 개인 — 무기별 분리를 하지 않으므로 전량 baseRating에 누적한다 (위 주석) */
  for (const [playerId, rating] of playerRating) {
    const existing = await prisma.leaguePlayer.findUnique({
      where: { leagueId_playerId: { leagueId: league.id, playerId } },
      select: { id: true },
    })
    const played = playerMatches.get(playerId) ?? 0
    const data = {
      rating,
      baseRating: rating,
      placement: played < constants.placementMatches,
      placementPlayed: played,
    }
    if (existing) {
      await prisma.leaguePlayer.update({ where: { id: existing.id }, data })
    } else {
      await prisma.leaguePlayer.create({
        data: { leagueId: league.id, playerId, ...data },
      })
    }
    result.playersUpdated += 1
  }

  for (const [leagueClanId, rating] of clanRating) {
    const played = clanMatches.get(leagueClanId) ?? 0
    await prisma.leagueClan.update({
      where: { id: leagueClanId },
      data: { rating, placement: played < constants.placementMatches, placementPlayed: played },
    })
    result.clansUpdated += 1
  }

  /* ---- 5) 쓴 상수를 DB에 남긴다 (스펙 §7 — 설정만 바꿔도 되게) ---- */
  await prisma.ratingConfig.upsert({
    where: {
      leagueId_divisionKey_formulaVersion: {
        leagueId: league.id,
        divisionKey: 'all',
        formulaVersion: PERSONAL_FORMULA_VERSION,
      },
    },
    create: {
      leagueId: league.id,
      divisionKey: 'all',
      expectedScoreDivisor: constants.expectedScoreDivisor,
      loseK: constants.personalKBase,
      winMultiplier: constants.personalWinMultiplier,
      crossDivisionMultiplier: 1,
      formulaVersion: PERSONAL_FORMULA_VERSION,
    },
    update: {
      expectedScoreDivisor: constants.expectedScoreDivisor,
      loseK: constants.personalKBase,
      winMultiplier: constants.personalWinMultiplier,
      crossDivisionMultiplier: 1,
    },
  })

  log(
    `래더 반영 완료 — 경기 ${result.matchesRated} · 선수 ${result.playersUpdated} · 클랜 ${result.clansUpdated}`,
  )
  return result
}

/**
 * 시즌 종료 soft reset (D-064).
 *
 * **완전 초기화가 아니다.** 순위 정보는 남고 폭만 줄어든다.
 * 시즌을 실제로 닫는 일(스냅샷·시즌 상태 변경)은 하지 않는다 — 그것은 운영자 결정이다.
 */
export async function runSeasonSoftReset(
  ctx: JobContext,
  input: { leagueSlug: string; constants?: RatingConstants },
): Promise<{ players: number; clans: number }> {
  const constants = input.constants ?? DEFAULT_RATING_CONSTANTS
  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true },
  })
  if (!league) {
    warn(`리그를 찾을 수 없다: ${input.leagueSlug}`)
    return { players: 0, clans: 0 }
  }

  const players = await prisma.leaguePlayer.findMany({
    where: { leagueId: league.id },
    select: { id: true, rating: true },
  })
  const clans = await prisma.leagueClan.findMany({
    where: { leagueId: league.id },
    select: { id: true, rating: true },
  })

  if (ctx.dryRun) {
    log(`[dry-run] 선수 ${players.length}명 · 클랜 ${clans.length}곳 soft reset 대상`)
    return { players: players.length, clans: clans.length }
  }

  for (const player of players) {
    const next = seasonSoftReset(player.rating, constants)
    await prisma.leaguePlayer.update({
      where: { id: player.id },
      data: { rating: next, baseRating: next },
    })
  }
  for (const clan of clans) {
    await prisma.leagueClan.update({
      where: { id: clan.id },
      data: { rating: seasonSoftReset(clan.rating, constants) },
    })
  }

  return { players: players.length, clans: clans.length }
}
