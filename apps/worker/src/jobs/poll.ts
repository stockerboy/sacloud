/**
 * 적응형 폴링 실행기 (Phase 8.1).
 *
 * 고정 전수 조회 대신 **활동량에 따라** 조회 주기를 조절한다.
 * 정책 판단은 전부 `lib/pollingPolicy.ts`(순수 함수)에 있고, 여기서는 DB·API만 다룬다.
 *
 * 한 번 실행할 때마다 호출량을 `NexonPollRun`에 숫자로 남긴다.
 * 5,000명 운영 비용은 추정이 아니라 이 숫자로 계산한다.
 */
import { prisma } from '@sacloud/db'
import {
  CLAN_MATCH_TYPES,
  MATCH_MODES,
  NEXON_SOURCE,
  NexonApiError,
  normalizeMatchList,
  type MatchMode,
} from '@sacloud/nexon'
import { log, warn } from '../lib/log.js'
import { storeRaw, markNormalized } from '../lib/rawStore.js'
import {
  decideDetailFetch,
  nextPollState,
  readPollingConfig,
  selectPollTargets,
  type PollingConfig,
  type PollState,
  type PollTier,
} from '../lib/pollingPolicy.js'
import { fetchAndStoreDetail, upsertStagingFromList } from './collect.js'
import { applyPropagation, collectPropagationPeers } from './propagate.js'
import { handleJobError, requireClient, type JobContext } from './context.js'

export interface PollMetrics {
  runId: string | null
  playersPolled: number
  matchListRequests: number
  uniqueNewMatchIds: number
  duplicateMatchIds: number
  matchDetailRequests: number
  detailSkippedByDedupe: number
  emptyPolls: number
  rateLimitedCount: number
  failedPolls: number
  activePlayersPolled: number
  inactivePlayersPolled: number
  requestsForActive: number
  requestsForInactive: number
  /**
   * 전파로 조회를 앞당긴 대상 수 (Phase 8.2).
   * **호출 수가 아니다.** 어차피 조회할 사람의 순서를 당겼을 뿐이라 `NexonPollRun`에는
   * 남기지 않는다. 대상별 사실은 `NexonPollState.propagatedAt`에 남는다.
   */
  propagationCandidates: number
  propagatedTargets: number
}

function emptyMetrics(): PollMetrics {
  return {
    runId: null,
    playersPolled: 0,
    matchListRequests: 0,
    uniqueNewMatchIds: 0,
    duplicateMatchIds: 0,
    matchDetailRequests: 0,
    detailSkippedByDedupe: 0,
    emptyPolls: 0,
    rateLimitedCount: 0,
    failedPolls: 0,
    activePlayersPolled: 0,
    inactivePlayersPolled: 0,
    requestsForActive: 0,
    requestsForInactive: 0,
    propagationCandidates: 0,
    propagatedTargets: 0,
  }
}

/** 신원이 생기면 폴링 대상이 된다. 이미 있으면 건드리지 않는다 */
export async function ensurePollStates(ouids?: readonly string[]): Promise<number> {
  const identities = await prisma.nexonIdentity.findMany({
    where: {
      status: { not: 'superseded' },
      ...(ouids?.length ? { ouid: { in: [...ouids] } } : {}),
    },
    select: { ouid: true, playerId: true },
  })

  let created = 0
  for (const identity of identities) {
    const existing = await prisma.nexonPollState.findUnique({
      where: { ouid: identity.ouid },
      select: { id: true },
    })
    if (existing) continue
    await prisma.nexonPollState.create({
      data: { ouid: identity.ouid, playerId: identity.playerId },
    })
    created += 1
  }
  return created
}

/**
 * 사용자 `전적갱신` 요청 → 최우선.
 *
 * 화면에서 넥슨 API를 직접 부르지 않는다(E 결정). 여기서 우선순위만 올린다.
 */
export async function requestManualRefresh(input: {
  ouid?: string | null
  playerId?: string | null
}): Promise<number> {
  const now = new Date()
  const where = input.ouid
    ? { ouid: input.ouid }
    : input.playerId
      ? { playerId: input.playerId }
      : null
  if (!where) return 0

  const result = await prisma.nexonPollState.updateMany({
    where,
    data: { manualRefreshRequestedAt: now, nextPollAt: now },
  })
  return result.count
}

function toPollState(row: {
  ouid: string
  tier: string
  priorityClass: string
  intervalMinutes: number
  nextPollAt: Date
  lastPolledAt: Date | null
  lastNewMatchAt: Date | null
  consecutiveEmptyPolls: number
  recentNewMatchCount: number
  manualRefreshRequestedAt: Date | null
  lastPollStatus: string | null
}): PollState {
  return {
    ...row,
    tier: row.tier as PollTier,
    priorityClass: row.priorityClass === 'league' ? 'league' : 'general',
  }
}

/**
 * 목록에서 얻은 **개인 관측값**을 남긴다 (D-048).
 *
 * 상세가 참가자 일부만 주기 때문에(D-044), 같은 경기를 여러 사람이 조회하면
 * 그 사람들의 기록이 모인다. **상세와 섞지 않고** 별도 표에 출처와 함께 쌓는다.
 * 나오지 않은 참가자는 만들지 않는다.
 */
async function recordObservation(input: {
  nexonMatchId: string
  ouid: string
  userName: string | null
  matchResult: string | null
  outcome: string | null
  kill: number | null
  death: number | null
  assist: number | null
  rawImportId: string
}): Promise<void> {
  await prisma.nexonMatchObservation.upsert({
    where: {
      nexonMatchId_ouid: { nexonMatchId: input.nexonMatchId, ouid: input.ouid },
    },
    create: {
      nexonMatchId: input.nexonMatchId,
      ouid: input.ouid,
      userName: input.userName,
      matchResult: input.matchResult,
      outcome: input.outcome,
      kill: input.kill,
      death: input.death,
      assist: input.assist,
      rawImportId: input.rawImportId,
    },
    update: {
      userName: input.userName,
      matchResult: input.matchResult,
      outcome: input.outcome,
      kill: input.kill,
      death: input.death,
      assist: input.assist,
      lastSeenAt: new Date(),
      rawImportId: input.rawImportId,
    },
  })
}

export async function runPoll(
  ctx: JobContext,
  input: {
    /** 이번 실행에서 조회할 대상 수 */
    targets?: number
    modes?: readonly MatchMode[]
    /** 이번 실행에서 받을 상세 최대 건수 (호출 폭주 방지) */
    detailLimit?: number
    /** 상세를 받을 매치 유형 (기본: 전부) */
    detailMatchType?: string | null
    /**
     * 특정 계정만 대상으로 삼는다.
     * 개발 도구가 실제 폴링 대상을 건드리지 못하게 막는 안전장치다 (D-045).
     */
    ouids?: readonly string[]
    config?: PollingConfig
  } = {},
): Promise<PollMetrics> {
  const config = input.config ?? readPollingConfig()
  const modes = input.modes?.length ? input.modes : MATCH_MODES
  const metrics = emptyMetrics()

  // 폴링 상태를 먼저 만들고 나서 기준 시각을 잡는다.
  // 순서가 반대면 방금 만든 대상의 `nextPollAt`이 기준 시각보다 뒤라서 한 바퀴를 통째로 건너뛴다.
  await ensurePollStates(input.ouids)
  const now = new Date()

  const candidates = await prisma.nexonPollState.findMany({
    where: {
      OR: [{ nextPollAt: { lte: now } }, { manualRefreshRequestedAt: { not: null } }],
      ...(input.ouids?.length ? { ouid: { in: [...input.ouids] } } : {}),
    },
    orderBy: { nextPollAt: 'asc' },
    take: (input.targets ?? 10) * 5,
  })

  const targets = selectPollTargets(
    candidates.map(toPollState),
    now,
    input.targets ?? 10,
    config,
  )

  log(
    `폴링 대상 ${targets.length}명 / 후보 ${candidates.length}명 · 모드 ${modes.length}개` +
      (ctx.dryRun ? ' (dry-run: 요청 없음)' : ''),
  )
  for (const target of targets) {
    log(`  ${target.ouid.slice(0, 6)}… tier=${target.tier} 예정=${target.nextPollAt.toISOString()}`)
  }

  if (ctx.dryRun) return metrics

  const run = await prisma.nexonPollRun.create({
    data: { migrationVersion: ctx.config.migrationVersion },
    select: { id: true },
  })
  metrics.runId = run.id

  const detailLimit = input.detailLimit ?? 0
  let detailBudget = detailLimit

  for (const target of targets) {
    const identity = await prisma.nexonIdentity.findUnique({
      where: { ouid: target.ouid },
      select: { userName: true },
    })

    let requestsForTarget = 0
    let newForTarget = 0
    let failed = false
    let blocked = false
    const newStagingIds: string[] = []

    for (const mode of modes) {
      try {
        const response = await requireClient(ctx).getMatchList({ ouid: target.ouid, matchMode: mode })
        requestsForTarget += 1
        metrics.matchListRequests += 1

        const raw = await storeRaw({
          source: NEXON_SOURCE,
          endpoint: response.endpoint,
          sourceId: response.sourceId,
          requestParams: response.requestParams,
          httpStatus: response.httpStatus,
          raw: response.raw,
          migrationVersion: ctx.config.migrationVersion,
        })

        const { entries, skipped } = normalizeMatchList(response.data)
        if (skipped > 0) warn(`match_id 없는 항목 ${skipped}건`)

        for (const entry of entries) {
          const isNew = await upsertStagingFromList(entry, {
            discoveredByOuid: target.ouid,
            listRawImportId: raw.id,
          })
          if (isNew) {
            metrics.uniqueNewMatchIds += 1
            newForTarget += 1
          } else {
            metrics.duplicateMatchIds += 1
          }

          const staging = await prisma.nexonMatch.findUnique({
            where: {
              source_sourceMatchId: { source: NEXON_SOURCE, sourceMatchId: entry.sourceMatchId },
            },
            select: { id: true, detailFetchedAt: true, refreshDueAt: true, matchType: true },
          })
          if (!staging) continue

          // 목록에서 얻은 개인 관측값 — 상세와 섞지 않는다 (D-048)
          await recordObservation({
            nexonMatchId: staging.id,
            ouid: target.ouid,
            userName: identity?.userName ?? null,
            matchResult: entry.matchResult,
            outcome: entry.outcome,
            kill: entry.kill,
            death: entry.death,
            assist: entry.assist,
            rawImportId: raw.id,
          })

          if (isNew) newStagingIds.push(staging.id)
        }

        await markNormalized(raw.id)
      } catch (error) {
        failed = true
        if (error instanceof NexonApiError) {
          if (error.kind === 'rate_limited') metrics.rateLimitedCount += 1
          if (error.fatal) blocked = true
        }
        // 접근 통제(403)면 handleJobError가 AbortCollection을 던져 전체를 멈춘다
        await handleJobError({
          error,
          source: NEXON_SOURCE,
          jobKey: `nexon:poll:${target.ouid}:${mode}`,
          sourceId: target.ouid,
        })
        if (blocked) break
      }
    }

    /* ---- 새로 발견한 경기만 상세를 받는다 (이미 있으면 건너뛴다 — C-4) ---- */
    for (const stagingId of newStagingIds) {
      if (detailBudget <= 0) break
      const staging = await prisma.nexonMatch.findUnique({
        where: { id: stagingId },
        select: { id: true, sourceMatchId: true, detailFetchedAt: true, refreshDueAt: true, matchType: true },
      })
      if (!staging) continue
      if (input.detailMatchType && staging.matchType !== input.detailMatchType) continue

      const decision = decideDetailFetch({
        hasDetail: staging.detailFetchedAt !== null,
        refreshDueAt: staging.refreshDueAt,
        now: new Date(),
      })
      if (!decision.fetch) {
        metrics.detailSkippedByDedupe += 1
        continue
      }

      try {
        await fetchAndStoreDetail(ctx, {
          stagingId: staging.id,
          sourceMatchId: staging.sourceMatchId,
        })
        metrics.matchDetailRequests += 1
        requestsForTarget += 1
        detailBudget -= 1
      } catch (error) {
        if (error instanceof NexonApiError && error.kind === 'rate_limited') {
          metrics.rateLimitedCount += 1
        }
        await handleJobError({
          error,
          source: NEXON_SOURCE,
          jobKey: `nexon:poll-detail:${staging.sourceMatchId}`,
          sourceId: staging.sourceMatchId,
        })
      }
    }

    /* ---- 새 클랜전을 봤으면 같은 경기를 봤을 사람들의 조회를 앞당긴다 (D-055) ---- */
    if (newStagingIds.length > 0) {
      const newClanMatches = await prisma.nexonMatch.findMany({
        where: { id: { in: newStagingIds }, matchType: { in: [...CLAN_MATCH_TYPES] } },
        select: { id: true, sourceMatchId: true, dateMatch: true },
      })
      for (const staging of newClanMatches) {
        const peers = await collectPropagationPeers({
          nexonMatchId: staging.id,
          discoveredByOuid: target.ouid,
          at: staging.dateMatch ?? new Date(),
        })
        const propagated = await applyPropagation({
          peers,
          discoveredByOuid: target.ouid,
          reason: `new_clan_match:${staging.sourceMatchId}`,
          now: new Date(),
          config,
        })
        metrics.propagationCandidates += propagated.candidates
        metrics.propagatedTargets += propagated.pulledForward
        if (propagated.pulledForward > 0) {
          log(`  전파: ${staging.sourceMatchId} → ${propagated.pulledForward}명 조회를 앞당겼다`)
        }
      }
    }

    /* ---- 상태 갱신 ---- */
    const patch = nextPollState(
      target,
      { newMatches: newForTarget, success: !failed, blocked },
      new Date(),
      config,
    )
    await prisma.nexonPollState.update({
      where: { ouid: target.ouid },
      data: {
        tier: patch.tier,
        intervalMinutes: patch.intervalMinutes,
        nextPollAt: patch.nextPollAt,
        lastPolledAt: patch.lastPolledAt,
        lastSuccessfulPollAt: patch.lastSuccessfulPollAt ?? undefined,
        lastNewMatchAt: patch.lastNewMatchAt ?? undefined,
        consecutiveEmptyPolls: patch.consecutiveEmptyPolls,
        recentNewMatchCount: patch.recentNewMatchCount,
        manualRefreshRequestedAt: null,
        lastPollStatus: patch.lastPollStatus,
        totalPolls: { increment: 1 },
        totalNewMatches: { increment: newForTarget },
      },
    })

    metrics.playersPolled += 1
    if (failed) metrics.failedPolls += 1
    if (newForTarget > 0) {
      metrics.activePlayersPolled += 1
      metrics.requestsForActive += requestsForTarget
    } else {
      metrics.inactivePlayersPolled += 1
      metrics.requestsForInactive += requestsForTarget
      if (!failed) metrics.emptyPolls += 1
    }

    log(
      `  ${target.ouid.slice(0, 6)}… → 신규 ${newForTarget}건 · 호출 ${requestsForTarget}회 · ` +
        `${target.tier} → ${patch.tier} (다음 ${patch.intervalMinutes}분 뒤)`,
    )

    if (blocked) break
  }

  await prisma.nexonPollRun.update({
    where: { id: run.id },
    data: {
      finishedAt: new Date(),
      playersPolled: metrics.playersPolled,
      matchListRequests: metrics.matchListRequests,
      uniqueNewMatchIds: metrics.uniqueNewMatchIds,
      duplicateMatchIds: metrics.duplicateMatchIds,
      matchDetailRequests: metrics.matchDetailRequests,
      detailSkippedByDedupe: metrics.detailSkippedByDedupe,
      emptyPolls: metrics.emptyPolls,
      rateLimitedCount: metrics.rateLimitedCount,
      failedPolls: metrics.failedPolls,
      activePlayersPolled: metrics.activePlayersPolled,
      inactivePlayersPolled: metrics.inactivePlayersPolled,
      requestsForActive: metrics.requestsForActive,
      requestsForInactive: metrics.requestsForInactive,
    },
  })

  return metrics
}
