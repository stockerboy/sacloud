/**
 * 투영 — 스테이징 → 운영 `Match` / `MatchPlayerStat`.
 *
 * 규칙은 `lib/projectionRule.ts`(순수 함수)에 있고, 여기서는 DB 입출력만 한다.
 *
 * 이 단계에서 **래더는 건드리지 않는다.** `ratingBefore` / `ratingUpdate` / `ratingAfter` /
 * `formulaVersion`은 전부 null로 남긴다. 계산은 Phase 9다
 * (`docs/LADDER_IMPLEMENTATION_SPEC.md`).
 */
import { prisma } from '@sacloud/db'
import { CLAN_MATCH_TYPES, NEXON_SOURCE } from '@sacloud/nexon'
import { log, warn } from '../lib/log.js'
import { allocateInternalMatchId } from '../lib/internalMatchId.js'
import { resolveParticipant, type IdentityRow, type IdentityStatus } from '../lib/identity.js'
import { participantIdentity } from '../lib/observedPlayer.js'
import {
  evaluateProjection,
  type LeagueProfile,
  type ProjectionMatch,
  type ProjectionParticipant,
  type ProjectionPlan,
} from '../lib/projectionRule.js'
import type { JobContext } from './context.js'

export interface ProjectResult {
  considered: number
  projected: number
  skipped: number
  reasons: Record<string, number>
}

/** 리그 설정을 투영 규칙이 쓰는 형태로 읽어 온다 */
export async function loadLeagueProfiles(input: {
  leagueSlug?: string | null
  allowedMatchTypes?: readonly string[]
}): Promise<LeagueProfile[]> {
  const leagues = await prisma.league.findMany({
    where: input.leagueSlug ? { slug: input.leagueSlug } : undefined,
    select: {
      id: true,
      slug: true,
      maps: { select: { map: { select: { id: true, name: true } } } },
      playerLimits: { select: { playerCount: true } },
      clans: {
        where: { expelledAt: null },
        select: {
          id: true,
          clanId: true,
          division: true,
          clan: { select: { name: true } },
        },
      },
    },
  })

  const profiles: LeagueProfile[] = []
  for (const league of leagues) {
    const mockCount = await prisma.match.count({
      where: { leagueId: league.id, origin: 'mock' },
    })

    profiles.push({
      leagueId: league.id,
      slug: league.slug,
      allowedMatchTypes: input.allowedMatchTypes ?? CLAN_MATCH_TYPES,
      mapIdByName: new Map(league.maps.map((entry) => [entry.map.name, entry.map.id])),
      playerLimits: league.playerLimits.map((entry) => entry.playerCount),
      leagueClanByClanName: new Map(
        league.clans.map((entry) => [
          entry.clan.name,
          { leagueClanId: entry.id, clanId: entry.clanId, division: entry.division },
        ]),
      ),
      hasMockMatches: mockCount > 0,
    })
  }
  return profiles
}

/**
 * 참가자 닉네임 → 플레이어 해석.
 *
 * **연결된(active) 신원만** 근거로 쓴다. 모호하면 비워 두고 투영을 보류한다.
 * 닉네임이 같다는 이유로 자동 병합하지 않는다.
 */
export async function resolveParticipants(stagingId: string): Promise<void> {
  const participants = await prisma.nexonMatchParticipant.findMany({
    where: { nexonMatchId: stagingId },
    select: { id: true, userName: true },
  })

  const names = [...new Set(participants.map((p) => p.userName).filter((n): n is string => !!n))]
  if (names.length === 0) return

  const identities = await prisma.nexonIdentity.findMany({
    where: { userName: { in: names } },
    select: { ouid: true, playerId: true, status: true, userName: true },
  })
  const rows: IdentityRow[] = identities.map((row) => ({
    ouid: row.ouid,
    playerId: row.playerId,
    status: row.status as IdentityStatus,
    userName: row.userName,
  }))

  for (const participant of participants) {
    const resolution = resolveParticipant(participant.userName, rows)

    if (resolution.status === 'resolved') {
      await prisma.nexonMatchParticipant.update({
        where: { id: participant.id },
        data: {
          resolvedPlayerId: resolution.playerId,
          resolvedOuid: resolution.ouid,
          resolutionStatus: 'resolved',
        },
      })
      continue
    }

    /* 신원을 확정하지 못했다고 **참가자를 버리지 않는다** (D-123).
       원본이 10명을 줬는데 우리가 아는 사람만 남기면 화면에 4명짜리 경기가 나온다.
       실제로 그랬다 — 668명 중 7명(1%)만 resolved였다.

       그래서 관측 전용 Player를 만든다. 실제로 뛴 것은 사실이므로 기록은 남기고,
       "누구인지"는 확정하지 않는다. 기존 Player와 **합치지 않는다** (D-036 · D-100). */
    const identity = participantIdentity({
      userName: participant.userName,
      resolvedPlayerId: null,
    })

    if (!identity) {
      // 닉네임조차 없다 — 원본에 사람이 없는 것이다
      await prisma.nexonMatchParticipant.update({
        where: { id: participant.id },
        data: { resolvedPlayerId: null, resolvedOuid: null, resolutionStatus: resolution.status },
      })
      continue
    }

    await ensureObservedPlayer(identity.playerId, participant.userName ?? '')
    await prisma.nexonMatchParticipant.update({
      where: { id: participant.id },
      data: {
        resolvedPlayerId: identity.playerId,
        resolvedOuid: null,
        resolutionStatus: 'observed',
      },
    })
  }
}

/**
 * 관측 전용 Player를 만든다 (없으면).
 *
 * `origin`은 `nexon`이다 — 개발용 시드가 아니라 **실제로 관측된 사람**이기 때문이다.
 * `NexonIdentity`나 `UserPlayerLink`는 만들지 않는다. 그건 근거가 생겼을 때 사람이 한다.
 */
async function ensureObservedPlayer(playerId: string, userName: string): Promise<void> {
  const existing = await prisma.player.findUnique({ where: { id: playerId }, select: { id: true } })
  if (existing) return
  await prisma.player.create({
    data: { id: playerId, name: userName.trim() || playerId, origin: NEXON_SOURCE },
  })
}

/** 운영 매치 저장. 같은 경기를 다시 투영해도 행이 늘지 않는다 */
async function writeMatch(input: {
  plan: ProjectionPlan
  sourceMatchId: string
}): Promise<{ matchId: string; created: boolean }> {
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
    // 넥슨은 종료 시각·플레이 시간·선공 진영을 주지 않는다 → null (D-034)
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

  for (const side of ['red', 'blue'] as const) {
    const own = plan[side]
    const opponent = plan[side === 'red' ? 'blue' : 'red']

    for (const member of own.members) {
      const playerId = member.resolvedPlayerId
      if (!playerId) continue

      const statData = {
        side,
        kill: member.kill ?? 0,
        death: member.death ?? 0,
        assist: member.assist ?? 0,
        headshot: member.headshot,
        // 원본은 소수를 준다. 정확한 값은 스테이징에 남아 있고 여기서는 계약(정수)에 맞춘다 (D-038)
        damage: member.damage === null ? null : Math.round(member.damage),
        // 넥슨은 무기·탈주·MVP를 주지 않는다 → null (D-034)
        weapon: null,
        dropout: null,
        mvp: null,
        playerDivisionAtMatch: own.division,
        opponentDivisionAtMatch: opponent.division,
        // 래더는 Phase 9에서 채운다. 여기서 값을 만들지 않는다
        ratingBefore: null,
        ratingUpdate: null,
        ratingAfter: null,
        opponentAvgRating: null,
        kUsed: null,
        multiplierUsed: null,
        formulaVersion: null,
      }

      await prisma.matchPlayerStat.upsert({
        where: { matchId_playerId: { matchId, playerId } },
        create: { matchId, playerId, ...statData },
        update: statData,
      })
    }
  }

  return { matchId, created: existing === null }
}

export async function runProject(
  ctx: JobContext,
  input: {
    leagueSlug?: string | null
    allowMockLeague?: boolean
    reproject?: boolean
    allowedMatchTypes?: readonly string[]
    /** 특정 경기들만 투영 대상으로 삼는다 (스모크·디버깅에서 범위를 못 벗어나게) */
    sourceMatchIds?: readonly string[]
  },
): Promise<ProjectResult> {
  const result: ProjectResult = { considered: 0, projected: 0, skipped: 0, reasons: {} }

  const profiles = await loadLeagueProfiles({
    leagueSlug: input.leagueSlug ?? null,
    allowedMatchTypes: input.allowedMatchTypes,
  })
  if (profiles.length === 0) {
    warn('투영 대상 리그가 없다')
    return result
  }

  const staged = await prisma.nexonMatch.findMany({
    where: {
      validationStatus: 'valid',
      projectionStatus: input.reproject ? { in: ['pending', 'skipped'] } : 'pending',
      ...(input.sourceMatchIds?.length
        ? { sourceMatchId: { in: [...input.sourceMatchIds] } }
        : {}),
    },
    orderBy: { dateMatch: 'asc' },
    take: ctx.limit ?? 200,
    select: { id: true, sourceMatchId: true, matchType: true, matchMap: true, dateMatch: true },
  })

  for (const staging of staged) {
    result.considered += 1
    await resolveParticipants(staging.id)

    const participants = await prisma.nexonMatchParticipant.findMany({
      where: { nexonMatchId: staging.id },
      orderBy: { slot: 'asc' },
    })

    const projectionMatch: ProjectionMatch = {
      sourceMatchId: staging.sourceMatchId,
      matchType: staging.matchType,
      matchMap: staging.matchMap,
      dateMatch: staging.dateMatch,
      participants: participants.map(
        (participant): ProjectionParticipant => ({
          slot: participant.slot,
          teamId: participant.teamId,
          userName: participant.userName,
          clanName: participant.clanName,
          outcome:
            participant.outcome === 'win' ||
            participant.outcome === 'lose' ||
            participant.outcome === 'draw'
              ? participant.outcome
              : null,
          resolvedPlayerId: participant.resolvedPlayerId,
          kill: participant.kill,
          death: participant.death,
          assist: participant.assist,
          headshot: participant.headshot,
          damage: participant.damage,
        }),
      ),
    }

    const evaluations = profiles.map((profile) => ({
      profile,
      outcome: evaluateProjection(projectionMatch, profile, {
        allowMockLeague: input.allowMockLeague,
      }),
    }))
    const accepted = evaluations.filter((entry) => entry.outcome.ok)

    if (accepted.length === 0) {
      const first = evaluations[0]?.outcome
      const code = first && !first.ok ? first.code : 'no_league'
      const reason = first && !first.ok ? first.reason : '조건에 맞는 리그가 없다'
      result.skipped += 1
      result.reasons[code] = (result.reasons[code] ?? 0) + 1
      if (ctx.dryRun) continue
      await prisma.nexonMatch.update({
        where: { id: staging.id },
        data: { projectionStatus: 'skipped', projectionReason: `${code}: ${reason}` },
      })
      continue
    }

    if (accepted.length > 1) {
      result.skipped += 1
      result.reasons.ambiguous_league = (result.reasons.ambiguous_league ?? 0) + 1
      if (ctx.dryRun) continue
      await prisma.nexonMatch.update({
        where: { id: staging.id },
        data: {
          projectionStatus: 'blocked',
          projectionReason: `ambiguous_league: 리그 ${accepted.length}곳의 조건에 맞는다`,
        },
      })
      continue
    }

    const winner = accepted[0]!
    if (!winner.outcome.ok) continue

    if (ctx.dryRun) {
      log(`[dry-run] 투영 대상: ${staging.sourceMatchId} → league ${winner.profile.slug}`)
      result.projected += 1
      continue
    }

    const written = await writeMatch({
      plan: winner.outcome.plan,
      sourceMatchId: staging.sourceMatchId,
    })

    await prisma.nexonMatch.update({
      where: { id: staging.id },
      data: {
        projectionStatus: 'projected',
        projectionReason: null,
        projectedMatchId: written.matchId,
        projectedAt: new Date(),
      },
    })

    result.projected += 1
    log(`투영: ${staging.sourceMatchId} → Match ${written.matchId} (${winner.profile.slug})`)
  }

  return result
}


/* -------------------------------------------------------------------------- */
/* 신원 재해석만                                                                 */
/* -------------------------------------------------------------------------- */

export interface ReresolveResult {
  matchesScanned: number
  participants: number
  resolved: number
  observed: number
  stillUnresolved: number
}

/**
 * 상세를 가진 스테이징 전체의 참가자 신원을 **다시 붙인다**.
 *
 * 투영 상태(`projectionStatus`)와 운영 `Match`는 **건드리지 않는다.**
 * 이미 공개된 경기를 지우지 않고 신원만 채우기 위한 경로다 (D-123).
 *
 * `--reproject`는 `pending`/`skipped`만 보기 때문에, 이미 `projected`된 경기의
 * 참가자는 영원히 재해석되지 않았다. 그 구멍을 메운다.
 */
export async function runReresolve(ctx: JobContext): Promise<ReresolveResult> {
  const staged = await prisma.nexonMatch.findMany({
    where: { detailFetchedAt: { not: null } },
    orderBy: { dateMatch: 'asc' },
    take: ctx.limit ?? 5000,
    select: { id: true },
  })

  for (const staging of staged) await resolveParticipants(staging.id)

  const [participants, resolved, observed, stillUnresolved] = await Promise.all([
    prisma.nexonMatchParticipant.count(),
    prisma.nexonMatchParticipant.count({ where: { resolutionStatus: 'resolved' } }),
    prisma.nexonMatchParticipant.count({ where: { resolutionStatus: 'observed' } }),
    prisma.nexonMatchParticipant.count({ where: { resolvedPlayerId: null } }),
  ])

  return { matchesScanned: staged.length, participants, resolved, observed, stillUnresolved }
}
