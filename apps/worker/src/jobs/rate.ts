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
import { previewSeasonStart, startSeason } from '@sacloud/db/ops'
import {
  CLAN_FORMULA_VERSION,
  averageMembers,
  clanDailyDecay,
  compositionScore,
  constantsForSeason,
  DEFAULT_RATING_CONSTANTS,
  dailyDecay,
  displayScore,
  PERSONAL_FORMULA_VERSION,
  rateMatch,
  roundHalfUp,
  seasonStartRating,
  type ConfirmedParticipant,
  type RatingConstants,
} from '@sacloud/rating'
import { log, warn } from '../lib/log.js'
import type { JobContext } from './context.js'

export interface RateRunResult {
  league: string
  /** 계산한 시즌 (없으면 null) */
  season: number | null
  matchesConsidered: number
  matchesRated: number
  playersUpdated: number
  clansUpdated: number
  skipped: Record<string, number>
  formulaVersion: string
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 계산할 시즌을 정한다.
 *
 * **자동 전환하지 않는다** (D-077). 날짜가 바뀌었다고 다음 시즌으로 넘어가지 않는다.
 * 운영자가 새 시즌을 만들기 전까지는 계속 지금 시즌이다.
 */
async function resolveSeason(
  leagueId: string,
  seasonNumber: number | null,
): Promise<{
  id: string
  number: number
  startedAt: Date
  endedAt: Date | null
  seasonType: string
} | null> {
  if (seasonNumber !== null) {
    return prisma.season.findUnique({
      where: { leagueId_number: { leagueId, number: seasonNumber } },
      select: { id: true, number: true, startedAt: true, endedAt: true, seasonType: true },
    })
  }
  return prisma.season.findFirst({
    where: { leagueId, status: 'active' },
    orderBy: { number: 'desc' },
    select: { id: true, number: true, startedAt: true, endedAt: true, seasonType: true },
  })
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
    /** 계산할 시즌 번호. 없으면 **활성 시즌**을 쓴다 (자동 전환하지 않는다 — D-077) */
    seasonNumber?: number | null
    allowMockLeague?: boolean
    constants?: RatingConstants
  },
): Promise<RateRunResult> {
  const baseConstants = input.constants ?? DEFAULT_RATING_CONSTANTS
  const result: RateRunResult = {
    league: input.leagueSlug,
    season: null,
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

  /* ---- 1) 계산 대상 ----
     **현재 시즌의** 재구성된 넥슨 경기만, 경기 시각 순.

     시즌 귀속은 **실제 경기 시각(startAt)** 으로 정한다 (D-078).
     수집이 늦어져도 19:55에 치른 경기는 20:00에 시작한 새 시즌이 아니라 이전 시즌이다. */
  const season = await resolveSeason(league.id, input.seasonNumber ?? null)
  /* 시즌 종류에 따른 예외를 여기서 한 번만 적용한다 (D-112).
     Beta는 1경기부터 래더를 계산한다. 정식 시즌은 기존 배치고사 10경기 그대로다. */
  const constants = constantsForSeason(baseConstants, season)
  if (season) {
    if (constants.placementMatches !== baseConstants.placementMatches) {
      log(
        `Beta 예외 — 배치고사 ${baseConstants.placementMatches}경기 → ${constants.placementMatches}경기 ` +
          `(1경기부터 래더 계산 · D-112). 정식 시즌에는 적용되지 않는다`,
      )
    }
    log(
      `시즌 ${season.number} 기준 — ${season.startedAt.toISOString().slice(0, 10)} ~ ` +
        `${season.endedAt ? season.endedAt.toISOString().slice(0, 10) : '진행 중'}`,
    )
  } else {
    log('시즌이 없다. 리그 전체 경기를 대상으로 계산한다')
  }
  result.season = season?.number ?? null

  const matches = await prisma.match.findMany({
    where: {
      leagueId: league.id,
      origin: 'nexon',
      /* **official 필터를 쓰지 않는다** (D-145).
         "비공식이라 레이팅 0" 은 폐기됐다. 정상 5v5 인지는 `rateMatch` 가 판정한다. */
      ...(season
        ? {
            startAt: {
              gte: season.startedAt,
              ...(season.endedAt ? { lt: season.endedAt } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      startAt: true,
      redLeagueClanId: true,
      blueLeagueClanId: true,
      winnerSide: true,
      stats: {
        select: {
          playerId: true,
          side: true,
          kill: true,
          death: true,
          assist: true,
          rosterLeagueClanId: true,
          participantRole: true,
        },
      },
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
  const playerTotals = new Map<string, { win: number; lose: number; kill: number; death: number; assist: number }>()
  const clanTotals = new Map<string, { win: number; lose: number }>()
  const clanRating = new Map<string, number>()
  const clanMatches = new Map<string, number>()

  /* --- D-145 활동성·구성 상태 ---
     활동 페널티는 **표시 점수에서만** 뺀다. 내부 Elo 는 건드리지 않는다 —
     한 달 쉬었다고 실력이 사라진 것은 아니고, 사라진 것은 왕좌를 지킬 자격이다. */
  const playerPenalty = new Map<string, number>()
  const clanPenalty = new Map<string, number>()
  const playerLastAt = new Map<string, Date>()
  const clanLastAt = new Map<string, Date>()
  /** 클랜별 최근 경기의 본클랜원 수 — 구성 보정의 입력 */
  const clanRecentMembers = new Map<string, number[]>()

  /** 마지막으로 감점 tick 을 돌린 시각 */
  let decayCursor: Date | null = null

  /**
   * 미참여 감점을 **하루 단위로** `until` 까지 진행한다.
   *
   * 경기 재생과 시간순으로 섞어야 한다 — 나중에 한꺼번에 돌리면
   * "고점을 찍고 쉬는 동안" 이 재현되지 않는다.
   */
  const advanceDecay = (until: Date): void => {
    if (!decayCursor) {
      decayCursor = until
      return
    }
    const DAY = DAY_MS
    let cursor = decayCursor.getTime()
    const target = until.getTime()
    // 하루씩. 아주 긴 공백에서도 폭주하지 않게 상한을 둔다
    let guard = 0
    while (cursor + DAY <= target && guard < 4000) {
      cursor += DAY
      guard += 1
      const at = new Date(cursor)
      for (const [playerId, internal] of playerRating) {
        const games = playerMatches.get(playerId) ?? 0
        if (games === 0) continue
        const totals = playerTotals.get(playerId)
        const played = (totals?.win ?? 0) + (totals?.lose ?? 0)
        const winRate = played > 0 ? (totals?.win ?? 0) / played : 0
        const last = playerLastAt.get(playerId)
        if (!last) continue
        const idleDays = (at.getTime() - last.getTime()) / DAY
        const penalty = playerPenalty.get(playerId) ?? 0
        const before = displayScore({ internalRating: internal, games, winRate, constants }).gated
        const add = dailyDecay(before - penalty, idleDays, constants)
        if (add <= 0) continue
        // 감점만으로 기준점 아래로 내려가지 않는다
        const capped = Math.max(0, Math.min(penalty + add, Math.max(0, before - constants.initialRating)))
        playerPenalty.set(playerId, capped)
      }
      for (const [leagueClanId, internal] of clanRating) {
        const last = clanLastAt.get(leagueClanId)
        if (!last) continue
        const idleDays = (at.getTime() - last.getTime()) / DAY
        const add = clanDailyDecay(idleDays, constants)
        if (add <= 0) continue
        const penalty = clanPenalty.get(leagueClanId) ?? 0
        const composition = compositionScore(
          averageMembers(clanRecentMembers.get(leagueClanId) ?? [], constants),
          constants,
        )
        const before = internal + composition
        const capped = Math.max(0, Math.min(penalty + add, Math.max(0, before - constants.initialRating)))
        clanPenalty.set(leagueClanId, capped)
      }
    }
    decayCursor = until
  }

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
    role: 'member' | 'mercenary'
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
      // 재구성 단계에서 이미 판정한 **원소속 클랜**을 그대로 쓴다. 여기서 다시 추측하지 않는다
      rosterLeagueClanId: stat.rosterLeagueClanId,
      outcome: match.winnerSide === stat.side ? ('win' as const) : ('lose' as const),
      kill: stat.kill,
      death: stat.death,
      assist: stat.assist,
      // 저장된 행은 전부 "확인된 참가자"다. 근거 종류는 스테이징에 남아 있다
      sources: ['player_match_list' as const],
      ratingBefore: ratingOf(stat.playerId),
    }))

    /* 감점 tick 을 이 경기 시각까지 진행한 뒤 경기를 반영한다 — 시간순으로 섞는다 */
    advanceDecay(match.startAt)

    const placementPlayerIds = participants
      .filter((participant) => (playerMatches.get(participant.playerId) ?? 0) < constants.placementMatches)
      .map((participant) => participant.playerId)
    const placementClanIds = [match.redLeagueClanId, match.blueLeagueClanId].filter(
      (clanId) => (clanMatches.get(clanId) ?? 0) < constants.placementMatches,
    )

    /* 팀 배정은 **재구성 때 이미 확정돼 저장돼 있다.** replay 가 그것을 다시 추론하면
       같은 경기를 두 단계가 다르게 판정할 수 있다 — 그러면 인정된 경기가 래더에서 빠진다.
       저장된 진영 클랜을 그대로 넘겨 재구성과 같은 판정을 재현한다 (D-133). */
    const storedSides = {
      winnerLeagueClanId:
        match.winnerSide === 'red' ? match.redLeagueClanId : match.blueLeagueClanId,
      loserLeagueClanId:
        match.winnerSide === 'red' ? match.blueLeagueClanId : match.redLeagueClanId,
      source: 'stored-match',
    }

    const rated = rateMatch({
      participants,
      sideEvidence: storedSides,
      clanRatings: {
        [match.redLeagueClanId]: clanRatingOf(match.redLeagueClanId),
        [match.blueLeagueClanId]: clanRatingOf(match.blueLeagueClanId),
      },
      placementPlayerIds,
      placementClanIds,
      constants,
    })

    if (!rated.eligibility.ratingEligible) {
      /* 정상 5v5 가 아니면 래더에 넣지 않는다 (D-145).
         경기 기록 자체는 그대로 남는다 — 여기서는 래더만 다룬다. */
      result.skipped[rated.eligibility.status === 'official' ? 'incomplete_squad' : rated.eligibility.status] =
        (result.skipped[rated.eligibility.status === 'official' ? 'incomplete_squad' : rated.eligibility.status] ?? 0) + 1
      continue
    }

    /* 무소속(independent) 클랜이라고 계산을 생략하지 않는다 (D-102 정정).
       클랜 경기의 전력차를 계산하려면 **실제 참가 선수의 실력값**이 필요하다.
       무소속 선수를 1500 고정으로 두거나 계산에서 빼면 그 경기의 예상 승률 자체가 틀어진다.
       무소속은 rating engine의 차단 조건이 아니라 **공개 범위(visibility) 조건**이다 —
       숨기는 일은 조회 계층(`apps/web/lib/server/queries`)이 한다. */
    /* 시즌 누적 — 래더만 다시 계산하고 승패·킬데스를 안 쌓으면
       화면에는 경기가 있는데 `0승 0패`로 보인다 (실제로 그랬다). 여기서 함께 쌓는다. */
    for (const assigned of rated.eligibility.assigned) {
      const won = assigned.outcome === 'win'
      const acc = playerTotals.get(assigned.playerId) ?? {
        win: 0,
        lose: 0,
        kill: 0,
        death: 0,
        assist: 0,
      }
      acc.win += won ? 1 : 0
      acc.lose += won ? 0 : 1
      acc.kill += assigned.kill
      acc.death += assigned.death
      acc.assist += assigned.assist
      playerTotals.set(assigned.playerId, acc)
    }
    for (const clanId of [match.redLeagueClanId, match.blueLeagueClanId]) {
      const won =
        (clanId === match.redLeagueClanId && match.winnerSide === 'red') ||
        (clanId === match.blueLeagueClanId && match.winnerSide === 'blue')
      const acc = clanTotals.get(clanId) ?? { win: 0, lose: 0 }
      acc.win += won ? 1 : 0
      acc.lose += won ? 0 : 1
      clanTotals.set(clanId, acc)
    }

    for (const player of rated.players) {
      playerRating.set(player.playerId, player.ratingAfter)
      playerMatches.set(player.playerId, (playerMatches.get(player.playerId) ?? 0) + 1)
      playerLastAt.set(player.playerId, match.startAt)
      /* 경기로만 페널티가 회복된다 — **한 판으로 다 지워지지 않는다.**
         "1판 던지고 초기화" 를 막는 유일한 장치다 */
      playerPenalty.set(
        player.playerId,
        Math.max(0, (playerPenalty.get(player.playerId) ?? 0) - constants.decayRecoveryPerGame),
      )
      pendingStats.push({
        matchId: match.id,
        playerId: player.playerId,
        ratingBefore: player.ratingBefore,
        ratingUpdate: player.ratingUpdate,
        ratingAfter: player.ratingAfter,
        opponentAvgRating: player.opponentAvgRating,
        kUsed: player.kUsed,
        isPlacement: player.isPlacement,
        role: player.role,
      })
    }

    const red = rated.clans.find((clan) => clan.leagueClanId === match.redLeagueClanId)!
    const blue = rated.clans.find((clan) => clan.leagueClanId === match.blueLeagueClanId)!
    clanRating.set(red.leagueClanId, red.ratingAfter)
    clanRating.set(blue.leagueClanId, blue.ratingAfter)
    clanMatches.set(red.leagueClanId, (clanMatches.get(red.leagueClanId) ?? 0) + 1)
    clanMatches.set(blue.leagueClanId, (clanMatches.get(blue.leagueClanId) ?? 0) + 1)
    for (const clan of [red, blue]) {
      clanLastAt.set(clan.leagueClanId, match.startAt)
      clanPenalty.set(
        clan.leagueClanId,
        Math.max(0, (clanPenalty.get(clan.leagueClanId) ?? 0) - constants.clanDecayRecoveryPerGame),
      )
      const recent = clanRecentMembers.get(clan.leagueClanId) ?? []
      recent.push(clan.members)
      clanRecentMembers.set(clan.leagueClanId, recent)
    }

    pendingMatches.push({
      matchId: match.id,
      redBefore: red.ratingBefore,
      blueBefore: blue.ratingBefore,
      redUpdate: red.ratingUpdate,
      blueUpdate: blue.ratingUpdate,
      redPlacement: red.isPlacement,
      bluePlacement: blue.isPlacement,
    })

    result.matchesRated += 1
  }

  /* 마지막 경기 이후에도 남은 기간만큼 감점이 돌아야 한다 —
     "고점 찍고 그대로 잠수" 가 바로 이 구간에서 일어난다.

     끝점은 **현재 시각이 아니라** 시즌 종료일(없으면 마지막 경기 시각)이다.
     `new Date()` 를 쓰면 돌릴 때마다 결과가 달라져 결정적 replay 가 깨진다. */
  const lastMatchAt = matches[matches.length - 1]?.startAt ?? null
  const decayUntil = season?.endedAt ?? lastMatchAt
  if (decayUntil) advanceDecay(decayUntil)

  /** 개인 최종 표시 점수 */
  const playerDisplay = new Map<string, ReturnType<typeof displayScore>>()
  for (const [playerId, internal] of playerRating) {
    const totals = playerTotals.get(playerId) ?? { win: 0, lose: 0, kill: 0, death: 0, assist: 0 }
    const played = totals.win + totals.lose
    playerDisplay.set(
      playerId,
      displayScore({
        internalRating: internal,
        games: playerMatches.get(playerId) ?? 0,
        winRate: played > 0 ? totals.win / played : 0,
        activityPenalty: playerPenalty.get(playerId) ?? 0,
        constants,
      }),
    )
  }

  /** 클랜 최종 점수 = 내부 Elo + 구성 보정 − 활동 페널티 */
  const clanFinal = new Map<string, { display: number; composition: number; penalty: number }>()
  for (const [leagueClanId, internal] of clanRating) {
    const composition = compositionScore(
      averageMembers(clanRecentMembers.get(leagueClanId) ?? [], constants),
      constants,
    )
    const penalty = clanPenalty.get(leagueClanId) ?? 0
    clanFinal.set(leagueClanId, {
      display: roundHalfUp(internal + composition - penalty),
      composition,
      penalty,
    })
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
        // 용병 여부는 그 경기의 사실이다. 계산이 아니라 기록이다 (D-073)
        participantRole: stat.role,
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

  /* 현재 소속 클랜 — `LeaguePlayer.clanId`는 스키마 주석대로 **표시용 현재 소속**이다.
     경기 시점 소속은 `MatchPlayerStat`/`Match`의 스냅샷이 따로 들고 있으므로 여기서는
     지금 유효한 로스터 등록(`leftAt = null`)을 그대로 옮겨 적는다.

     이걸 빼면 조회 계층이 통째로 무너진다 (D-117). `records.ts`·`matches.ts`가
     "리그 선수는 클랜에 속한다"를 전제로 `clanId`에서 `LeagueClan`을 찾기 때문에,
     null이면 개인 상세가 404, 개인 기록실이 빈 배열, 클랜원 목록이 0명이 된다. */
  const rosterClanByPlayer = new Map<string, string>()
  for (const membership of await prisma.leagueRosterMembership.findMany({
    where: { leagueId: league.id, leftAt: null },
    select: { playerId: true, joinedAt: true, leagueClan: { select: { clanId: true } } },
    orderBy: { joinedAt: 'asc' },
  })) {
    // 여러 건이면 가장 최근 등록을 쓴다 (오름차순이라 뒤가 이긴다)
    rosterClanByPlayer.set(membership.playerId, membership.leagueClan.clanId)
  }

  /* 개인 — 무기별 분리를 하지 않으므로 전량 baseRating에 누적한다 (위 주석) */
  for (const [playerId, rating] of playerRating) {
    const existing = await prisma.leaguePlayer.findUnique({
      where: { leagueId_playerId: { leagueId: league.id, playerId } },
      select: { id: true },
    })
    const played = playerMatches.get(playerId) ?? 0
    const totals = playerTotals.get(playerId) ?? { win: 0, lose: 0, kill: 0, death: 0, assist: 0 }
    const clanId = rosterClanByPlayer.get(playerId) ?? null
    const shown = playerDisplay.get(playerId)!
    const data = {
      // `rating` 은 **표시 점수**다 (D-145). 랭킹 정렬이 이 컬럼을 쓴다
      rating: shown.display,
      baseRating: shown.display,
      internalRating: rating,
      activityPenalty: playerPenalty.get(playerId) ?? 0,
      lastRatedAt: playerLastAt.get(playerId) ?? null,
      placement: played < constants.placementMatches,
      placementPlayed: played,
      win: totals.win,
      lose: totals.lose,
      kill: totals.kill,
      death: totals.death,
      assist: totals.assist,
      // 로스터에 없으면 건드리지 않는다. 있던 소속을 null로 지우지 않기 위해서다
      ...(clanId ? { clanId } : {}),
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
    const final = clanFinal.get(leagueClanId)!
    await prisma.leagueClan.update({
      where: { id: leagueClanId },
      data: {
        rating: final.display,
        internalRating: rating,
        compositionScore: final.composition,
        activityPenalty: final.penalty,
        lastRatedAt: clanLastAt.get(leagueClanId) ?? null,
        placement: played < constants.placementMatches,
        placementPlayed: played,
        win: clanTotals.get(leagueClanId)?.win ?? 0,
        lose: clanTotals.get(leagueClanId)?.lose ?? 0,
      },
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
      loseK: constants.personalK,
      // D-145 는 승리 배수를 쓰지 않는다 (제로섬). 기록만 남긴다
      winMultiplier: 1,
      crossDivisionMultiplier: 1,
      formulaVersion: PERSONAL_FORMULA_VERSION,
    },
    update: {
      expectedScoreDivisor: constants.expectedScoreDivisor,
      loseK: constants.personalK,
      winMultiplier: 1,
      crossDivisionMultiplier: 1,
    },
  })

  log(
    `래더 반영 완료 — 경기 ${result.matchesRated} · 선수 ${result.playersUpdated} · 클랜 ${result.clansUpdated}`,
  )
  return result
}

/**
 * 새 시즌 시작 — **모두 같은 출발점** (D-064 · 2026-08-22 정책 변경).
 *
 * soft reset(이전 점수를 비율로 이월)은 폐기했다. 개인·클랜 모두 `seasonBaseline`에서
 * 똑같이 시작한다. 전 시즌 1위라고 높은 점수를 들고 가지 않는다.
 *
 * **지난 시즌 기록은 건드리지 않는다.**
 *   `Match` · `MatchPlayerStat` · `LeaguePlayerSeason` · `LeagueClanSeason` · `RankSnapshot`
 *   전부 그대로 남는다. 이 함수가 바꾸는 것은 "지금 시즌의 현재 점수"뿐이다.
 *
 * 시즌 전환은 **운영자가 부를 때만** 일어난다. 날짜로 자동 전환하지 않는다 (D-077).
 */
export async function runSeasonStart(
  ctx: JobContext,
  input: {
    leagueSlug: string
    constants?: RatingConstants
    /** `beta`면 번호 0으로 시작한다. 정식 번호를 소모하지 않는다 (D-098) */
    seasonType?: 'beta' | 'official'
  },
): Promise<{ players: number; clans: number; baseline: number; nextNumber: number }> {
  const constants = input.constants ?? DEFAULT_RATING_CONSTANTS
  const baseline = seasonStartRating(constants)

  /* 초기화 규칙은 **`@sacloud/db/ops`에만** 둔다.
     예전에는 여기서도 따로 updateMany를 돌렸는데, 그러다 ops 쪽에만
     누적 전적 초기화가 들어가서 CLI로 시작하면 베타 전적이 남는 상태가 됐다 (D-101). */
  const preview = await previewSeasonStart(input.leagueSlug)
  if (!preview.ok) {
    warn(preview.reason)
    return { players: 0, clans: 0, baseline, nextNumber: 0 }
  }

  if (ctx.dryRun) {
    log(
      `[dry-run] 선수 ${preview.players}명 · 클랜 ${preview.clans}곳을 ${baseline}점에서 시작시킨다`,
    )
    return { players: preview.players, clans: preview.clans, baseline, nextNumber: preview.nextNumber }
  }

  const result = await startSeason({ leagueSlug: input.leagueSlug, seasonType: input.seasonType })

  log(
    `${input.seasonType === 'beta' ? 'Beta Season' : `시즌 ${result.nextNumber}`} 시작 — ` +
      `선수 ${result.players}명 · 클랜 ${result.clans}곳 전부 ${baseline}점에서 시작한다`,
  )
  log('누적 전적(승패·킬데스·MVP)도 0에서 시작한다. 직전 시즌 값은 시즌 카드에 남아 있다')
  log('지난 시즌 기록(경기·시즌 통계·랭킹 스냅샷)은 그대로 보존된다')
  return {
    players: result.players,
    clans: result.clans,
    baseline,
    nextNumber: result.nextNumber,
  }
}
