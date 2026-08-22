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
  DEFAULT_RATING_CONSTANTS,
  PERSONAL_FORMULA_VERSION,
  rateMatch,
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
): Promise<{ id: string; number: number; startedAt: Date; endedAt: Date | null } | null> {
  if (seasonNumber !== null) {
    return prisma.season.findUnique({
      where: { leagueId_number: { leagueId, number: seasonNumber } },
      select: { id: true, number: true, startedAt: true, endedAt: true },
    })
  }
  return prisma.season.findFirst({
    where: { leagueId, status: 'active' },
    orderBy: { number: 'desc' },
    select: { id: true, number: true, startedAt: true, endedAt: true },
  })
}

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
    /** 계산할 시즌 번호. 없으면 **활성 시즌**을 쓴다 (자동 전환하지 않는다 — D-077) */
    seasonNumber?: number | null
    allowMockLeague?: boolean
    constants?: RatingConstants
  },
): Promise<RateRunResult> {
  const constants = input.constants ?? DEFAULT_RATING_CONSTANTS
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
  if (season) {
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
      // 비공식 경기는 공식 통계·래더에 반영하지 않는다 (D-080)
      official: true,
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

    if (!rated.eligibility.official) {
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
        role: player.role,
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
