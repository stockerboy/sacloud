/**
 * 로스터 기반 재구성 실행기 (Phase 8.2).
 *
 * 판단 규칙은 `lib/reconstruct.ts`(순수 함수)에 있다. 여기서는 DB 입출력만 한다.
 *
 * 두 가지 일을 한다.
 *  1. `backfillObservations` — **API 호출 없이** 보관된 매치 목록 원본에서 관측값을 만든다.
 *     원본을 버리지 않았기 때문에 가능한 일이다 (`CLAUDE.md` 3-A 1번).
 *  2. `runReconstruct` — 관측값 + 로스터 + 상세(보조)로 경기를 재구성하고,
 *     **완전할 때만** 운영 `Match`에 투영한다.
 */
import { prisma, type Prisma } from '@sacloud/db'
import {
  CLAN_MATCH_TYPES,
  NEXON_SOURCE,
  NexonMatchListResponse,
  normalizeMatchList,
} from '@sacloud/nexon'
import { log, warn } from '../lib/log.js'
import { allocateInternalMatchId } from '../lib/internalMatchId.js'
import {
  evaluateReconstruction,
  type DetailParticipantInput,
  type IdentityStatus,
  type ObservationInput,
  type Outcome,
  type ReconstructionLeague,
  type ReconstructionPlan,
  type RosterMembership,
} from '../lib/reconstruct.js'
import type { JobContext } from './context.js'

function toOutcome(value: string | null): Outcome | null {
  return value === 'win' || value === 'lose' || value === 'draw' ? value : null
}

/* ------------------------------------------------------- 관측값 백필 (무호출) --- */

export interface BackfillResult {
  listRawsScanned: number
  entriesScanned: number
  observationsCreated: number
  observationsUpdated: number
  matchesNotStaged: number
}

/**
 * 보관된 매치 목록 원본 → `NexonMatchObservation`.
 *
 * **넥슨에 요청하지 않는다.** 이미 받아 둔 원본을 다시 읽을 뿐이다.
 *
 * `ouids`로 **범위를 제한할 수 있다.** 개발 도구는 자기 데이터 밖을 건드리면 안 된다(D-045).
 * 범위를 주지 않으면 보관된 원본 전체를 다시 읽는다 — 운영자가 명령으로 부를 때만 그렇게 한다.
 */
export async function backfillObservations(
  input: { ouids?: readonly string[] } = {},
): Promise<BackfillResult> {
  const result: BackfillResult = {
    listRawsScanned: 0,
    entriesScanned: 0,
    observationsCreated: 0,
    observationsUpdated: 0,
    matchesNotStaged: 0,
  }

  const raws = await prisma.rawImport.findMany({
    where: {
      source: NEXON_SOURCE,
      endpoint: '/suddenattack/v1/match',
      // sourceId 형식이 `<ouid>:<match_mode>`라 접두사로 범위를 좁힌다
      ...(input.ouids?.length
        ? { OR: input.ouids.map((ouid) => ({ sourceId: { startsWith: `${ouid}:` } })) }
        : {}),
    },
    select: { id: true, sourceId: true, raw: true },
    orderBy: { firstFetchedAt: 'asc' },
  })

  for (const raw of raws) {
    result.listRawsScanned += 1
    // sourceId 형식: `<ouid>:<match_mode>`
    const ouid = raw.sourceId.split(':')[0]
    if (!ouid) continue

    const parsed = NexonMatchListResponse.safeParse(raw.raw)
    if (!parsed.success) {
      warn(`목록 원본을 해석할 수 없다: ${raw.sourceId}`)
      continue
    }

    const identity = await prisma.nexonIdentity.findUnique({
      where: { ouid },
      select: { userName: true },
    })

    for (const entry of normalizeMatchList(parsed.data).entries) {
      result.entriesScanned += 1
      const staging = await prisma.nexonMatch.findUnique({
        where: {
          source_sourceMatchId: { source: NEXON_SOURCE, sourceMatchId: entry.sourceMatchId },
        },
        select: { id: true },
      })
      if (!staging) {
        result.matchesNotStaged += 1
        continue
      }

      const existing = await prisma.nexonMatchObservation.findUnique({
        where: { nexonMatchId_ouid: { nexonMatchId: staging.id, ouid } },
        select: { id: true },
      })

      await prisma.nexonMatchObservation.upsert({
        where: { nexonMatchId_ouid: { nexonMatchId: staging.id, ouid } },
        create: {
          nexonMatchId: staging.id,
          ouid,
          userName: identity?.userName ?? null,
          matchResult: entry.matchResult,
          outcome: entry.outcome,
          kill: entry.kill,
          death: entry.death,
          assist: entry.assist,
          rawImportId: raw.id,
        },
        update: {
          userName: identity?.userName ?? undefined,
          matchResult: entry.matchResult,
          outcome: entry.outcome,
          kill: entry.kill,
          death: entry.death,
          assist: entry.assist,
          lastSeenAt: new Date(),
          rawImportId: raw.id,
        },
      })

      if (existing) result.observationsUpdated += 1
      else result.observationsCreated += 1
    }
  }

  return result
}

/* ----------------------------------------------------------------- 재구성 --- */

export interface ReconstructRunResult {
  considered: number
  projected: number
  incomplete: number
  reasons: Record<string, number>
  /** 경기별 관측/확정 인원 (측정용) */
  samples: {
    sourceMatchId: string
    observations: number
    confirmed: number
    detailParticipants: number
    code: string | null
  }[]
}

async function loadLeagues(leagueSlug?: string | null): Promise<ReconstructionLeague[]> {
  const leagues = await prisma.league.findMany({
    where: leagueSlug ? { slug: leagueSlug } : undefined,
    select: {
      id: true,
      slug: true,
      maps: { select: { map: { select: { id: true, name: true } } } },
      playerLimits: { select: { playerCount: true } },
    },
  })

  const result: ReconstructionLeague[] = []
  for (const league of leagues) {
    const mockCount = await prisma.match.count({ where: { leagueId: league.id, origin: 'mock' } })
    result.push({
      leagueId: league.id,
      slug: league.slug,
      allowedMatchTypes: CLAN_MATCH_TYPES,
      mapIdByName: new Map(league.maps.map((entry) => [entry.map.name, entry.map.id])),
      playerLimits: league.playerLimits.map((entry) => entry.playerCount),
      hasMockMatches: mockCount > 0,
    })
  }
  return result
}

async function loadMemberships(leagueId: string): Promise<RosterMembership[]> {
  const rows = await prisma.leagueRosterMembership.findMany({
    where: { leagueId },
    select: {
      playerId: true,
      leagueClanId: true,
      joinedAt: true,
      leftAt: true,
      verified: true,
      leagueClan: { select: { division: true, clan: { select: { name: true } } } },
    },
  })
  return rows.map((row) => ({
    playerId: row.playerId,
    leagueClanId: row.leagueClanId,
    clanName: row.leagueClan.clan.name,
    division: row.leagueClan.division,
    joinedAt: row.joinedAt,
    leftAt: row.leftAt,
    verified: row.verified,
  }))
}

/** 운영 매치 저장. 재구성 결과도 `origin=nexon`이며 래더는 건드리지 않는다 (Phase 9) */
async function writeReconstructedMatch(input: {
  plan: ReconstructionPlan
  sourceMatchId: string
}): Promise<string> {
  const { plan, sourceMatchId } = input

  const existing = await prisma.match.findUnique({
    where: { origin_sourceMatchId: { origin: NEXON_SOURCE, sourceMatchId } },
    select: { id: true },
  })
  const matchId =
    existing?.id ??
    (await allocateInternalMatchId(plan.startAt, async (candidate) => {
      const found = await prisma.match.findUnique({ where: { id: candidate }, select: { id: true } })
      return found !== null
    }))

  const matchData = {
    leagueId: plan.leagueId,
    mapId: plan.mapId,
    playerCount: plan.playerCount,
    startAt: plan.startAt,
    // 넥슨이 주지 않는 값은 null이다 (D-034)
    endAt: null,
    playTime: null,
    blueFirst: null,
    winnerSide: plan.winnerSide,
    mvpPlayerId: null,
    redLeagueClanId: plan.red.leagueClanId,
    blueLeagueClanId: plan.blue.leagueClanId,
    redDivisionAtMatch: plan.red.division,
    blueDivisionAtMatch: plan.blue.division,
    origin: NEXON_SOURCE,
    sourceMatchId,
  }

  await prisma.match.upsert({
    where: { id: matchId },
    create: { id: matchId, ...matchData },
    update: matchData,
  })

  for (const side of [plan.red, plan.blue]) {
    const opponent = side === plan.red ? plan.blue : plan.red
    for (const member of side.members) {
      const statData = {
        side: member.side,
        kill: member.kill,
        death: member.death,
        assist: member.assist,
        headshot: member.headshot,
        damage: member.damage === null ? null : Math.round(member.damage),
        // 넥슨은 무기·탈주·MVP를 주지 않는다 (D-034)
        weapon: null,
        dropout: null,
        mvp: null,
        playerDivisionAtMatch: side.division,
        opponentDivisionAtMatch: opponent.division,
        // 래더는 Phase 9다
        ratingBefore: null,
        ratingUpdate: null,
        ratingAfter: null,
        opponentAvgRating: null,
        kUsed: null,
        multiplierUsed: null,
        formulaVersion: null,
      }
      await prisma.matchPlayerStat.upsert({
        where: { matchId_playerId: { matchId, playerId: member.playerId } },
        create: { matchId, playerId: member.playerId, ...statData },
        update: statData,
      })
    }
  }

  return matchId
}

export async function runReconstruct(
  ctx: JobContext,
  input: {
    leagueSlug?: string | null
    allowMockLeague?: boolean
    requireVerifiedRoster?: boolean
    /** 이미 판정한 경기도 다시 본다 */
    redo?: boolean
    sourceMatchIds?: readonly string[]
  } = {},
): Promise<ReconstructRunResult> {
  const result: ReconstructRunResult = {
    considered: 0,
    projected: 0,
    incomplete: 0,
    reasons: {},
    samples: [],
  }

  const leagues = await loadLeagues(input.leagueSlug ?? null)
  if (leagues.length === 0) {
    warn('재구성 대상 리그가 없다')
    return result
  }

  const staged = await prisma.nexonMatch.findMany({
    where: {
      matchType: { in: [...CLAN_MATCH_TYPES] },
      ...(input.sourceMatchIds?.length
        ? { sourceMatchId: { in: [...input.sourceMatchIds] } }
        : input.redo
          ? {}
          : { projectionStatus: { in: ['pending', 'skipped'] } }),
    },
    orderBy: { dateMatch: 'asc' },
    take: ctx.limit ?? 200,
    select: {
      id: true,
      sourceMatchId: true,
      matchType: true,
      matchMode: true,
      matchMap: true,
      dateMatch: true,
    },
  })

  for (const staging of staged) {
    result.considered += 1

    const observationRows = await prisma.nexonMatchObservation.findMany({
      where: { nexonMatchId: staging.id },
    })
    const identities = await prisma.nexonIdentity.findMany({
      where: { ouid: { in: observationRows.map((row) => row.ouid) } },
      select: { ouid: true, playerId: true, status: true },
    })
    const identityByOuid = new Map(identities.map((row) => [row.ouid, row]))

    const observations: ObservationInput[] = observationRows.map((row) => {
      const identity = identityByOuid.get(row.ouid)
      return {
        ouid: row.ouid,
        playerId: identity?.playerId ?? null,
        userName: row.userName,
        identityStatus: (identity?.status ?? 'unresolved') as IdentityStatus,
        outcome: toOutcome(row.outcome),
        kill: row.kill,
        death: row.death,
        assist: row.assist,
      }
    })

    const detailRows = await prisma.nexonMatchParticipant.findMany({
      where: { nexonMatchId: staging.id },
      orderBy: { slot: 'asc' },
    })
    const detail: DetailParticipantInput[] = detailRows.map((row) => ({
      slot: row.slot,
      teamId: row.teamId,
      userName: row.userName,
      clanName: row.clanName,
      outcome: toOutcome(row.outcome),
      kill: row.kill,
      death: row.death,
      assist: row.assist,
      headshot: row.headshot,
      damage: row.damage,
      resolvedPlayerId: row.resolvedPlayerId,
    }))

    let projected = false
    let lastCode: string | null = null
    let lastSummary: Record<string, unknown> | null = null

    for (const league of leagues) {
      const memberships = await loadMemberships(league.leagueId)
      const outcome = evaluateReconstruction({
        match: {
          sourceMatchId: staging.sourceMatchId,
          matchType: staging.matchType,
          matchMode: staging.matchMode,
          matchMap: staging.matchMap,
          dateMatch: staging.dateMatch,
        },
        observations,
        detail,
        memberships,
        league,
        options: {
          allowMockLeague: input.allowMockLeague,
          requireVerifiedRoster: input.requireVerifiedRoster,
        },
      })

      lastSummary = { ...outcome.summary, league: league.slug }
      if (!outcome.ok) {
        lastCode = outcome.code
        continue
      }

      if (ctx.dryRun) {
        log(`[dry-run] 재구성 가능: ${staging.sourceMatchId} → ${league.slug}`)
        projected = true
        lastCode = null
        break
      }

      const matchId = await writeReconstructedMatch({
        plan: outcome.plan,
        sourceMatchId: staging.sourceMatchId,
      })
      await prisma.nexonMatch.update({
        where: { id: staging.id },
        data: {
          projectionStatus: 'projected',
          projectionReason: null,
          projectedMatchId: matchId,
          projectedAt: new Date(),
          reconstruction: lastSummary as Prisma.InputJsonValue,
          reconstructedAt: new Date(),
        },
      })
      log(`재구성 투영: ${staging.sourceMatchId} → Match ${matchId} (${league.slug})`)
      projected = true
      lastCode = null
      break
    }

    const summaryCounts = (lastSummary ?? {}) as {
      observations?: number
      confirmed?: number
      detailParticipants?: number
    }
    result.samples.push({
      sourceMatchId: staging.sourceMatchId,
      observations: summaryCounts.observations ?? observations.length,
      confirmed: summaryCounts.confirmed ?? 0,
      detailParticipants: summaryCounts.detailParticipants ?? detail.length,
      code: lastCode,
    })

    if (projected) {
      result.projected += 1
      continue
    }

    result.incomplete += 1
    const code = lastCode ?? 'no_league'
    result.reasons[code] = (result.reasons[code] ?? 0) + 1

    if (!ctx.dryRun) {
      await prisma.nexonMatch.update({
        where: { id: staging.id },
        data: {
          projectionStatus: 'skipped',
          projectionReason: code,
          reconstruction: (lastSummary ?? {}) as Prisma.InputJsonValue,
          reconstructedAt: new Date(),
        },
      })
    }
  }

  return result
}
