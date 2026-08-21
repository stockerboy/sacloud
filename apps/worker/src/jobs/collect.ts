/**
 * 매치 수집 — 목록 → 스테이징 → 상세 → 스테이징.
 *
 * 넥슨 `/match`는 `match_mode`가 **필수**이고 커서·날짜 필터가 없다.
 * 그래서 모드 4개를 각각 부르고, 중복은 `match_id`로 거른다
 * (`docs/NEXON_INGEST_SPEC.md` 4장 · 8장).
 *
 * `match_type`은 지정하지 않는다. 원본을 그대로 받아 스테이징에 보존하고,
 * 사용할 경기는 투영 규칙에서만 고른다.
 */
import { prisma, type Prisma } from '@sacloud/db'
import {
  MATCH_MODES,
  NEXON_SOURCE,
  normalizeMatchDetail,
  normalizeMatchList,
  validateMatchDetail,
  type MatchMode,
  type NormalizedMatchListEntry,
} from '@sacloud/nexon'
import { log, warn } from '../lib/log.js'
import { checkpoint, finishJob, isJobDone, startJob } from '../lib/jobStore.js'
import { markNormalized, storeRaw } from '../lib/rawStore.js'
import { refreshDueAt } from '../lib/freshness.js'
import { handleJobError, requireClient, type JobContext } from './context.js'

export interface CollectResult {
  listCalls: number
  matchesSeen: number
  matchesCreated: number
  detailsFetched: number
  detailsUnchanged: number
  invalid: number
  failed: number
}

/** 목록 항목 → 스테이징 매치. 상세를 이미 받아 둔 행은 덮어쓰지 않는다 */
export async function upsertStagingFromList(
  entry: NormalizedMatchListEntry,
  input: { discoveredByOuid: string; listRawImportId: string },
): Promise<boolean> {
  const existing = await prisma.nexonMatch.findUnique({
    where: { source_sourceMatchId: { source: NEXON_SOURCE, sourceMatchId: entry.sourceMatchId } },
    select: { id: true },
  })

  if (existing) {
    await prisma.nexonMatch.update({
      where: { id: existing.id },
      data: {
        // 목록에서만 알 수 있는 값은 비어 있을 때만 채운다 (상세가 더 정확하다)
        matchMode: entry.matchMode ?? undefined,
        matchType: entry.matchType ?? undefined,
        dateMatch: entry.dateMatch ?? undefined,
        listRawImportId: input.listRawImportId,
      },
    })
    return false
  }

  await prisma.nexonMatch.create({
    data: {
      source: NEXON_SOURCE,
      sourceMatchId: entry.sourceMatchId,
      matchMode: entry.matchMode,
      matchType: entry.matchType,
      dateMatch: entry.dateMatch,
      discoveredByOuid: input.discoveredByOuid,
      listRawImportId: input.listRawImportId,
    },
  })
  return true
}

/**
 * 매치 상세를 받아 스테이징에 반영한다.
 *
 * 같은 경기를 다시 받아도 `slot` 기준 upsert라 참가자 행이 늘지 않는다.
 * 참가자 수가 줄어든 응답이 오면 남는 슬롯을 지운다(원본에 맞춘다).
 */
export async function fetchAndStoreDetail(
  ctx: JobContext,
  input: { stagingId: string; sourceMatchId: string },
): Promise<'stored' | 'unchanged' | 'invalid'> {
  const response = await requireClient(ctx).getMatchDetail(input.sourceMatchId)
  const raw = await storeRaw({
    source: NEXON_SOURCE,
    endpoint: response.endpoint,
    sourceId: response.sourceId,
    requestParams: response.requestParams,
    httpStatus: response.httpStatus,
    raw: response.raw,
    migrationVersion: ctx.config.migrationVersion,
  })

  const detail = normalizeMatchDetail(response.data, input.sourceMatchId)
  const now = new Date()
  const due = refreshDueAt(now, ctx.config.refreshIntervalDays)

  if (!detail) {
    await prisma.nexonMatch.update({
      where: { id: input.stagingId },
      data: {
        validationStatus: 'invalid',
        validationIssues: [
          { code: 'no_match_id', message: '상세 응답에 match_id가 없다' },
        ] as unknown as Prisma.InputJsonValue,
        detailRawImportId: raw.id,
        detailFetchedAt: now,
        lastVerifiedAt: now,
        refreshDueAt: due,
        staleAt: null,
      },
    })
    return 'invalid'
  }

  const issues = validateMatchDetail(detail)

  await prisma.$transaction([
    ...detail.participants.map((participant) =>
      prisma.nexonMatchParticipant.upsert({
        where: {
          nexonMatchId_slot: { nexonMatchId: input.stagingId, slot: participant.slot },
        },
        create: {
          nexonMatchId: input.stagingId,
          slot: participant.slot,
          teamId: participant.teamId,
          matchResult: participant.matchResult,
          outcome: participant.outcome,
          userName: participant.userName,
          seasonGrade: participant.seasonGrade,
          clanName: participant.clanName,
          kill: participant.kill,
          death: participant.death,
          assist: participant.assist,
          headshot: participant.headshot,
          damage: participant.damage,
        },
        update: {
          teamId: participant.teamId,
          matchResult: participant.matchResult,
          outcome: participant.outcome,
          userName: participant.userName,
          seasonGrade: participant.seasonGrade,
          clanName: participant.clanName,
          kill: participant.kill,
          death: participant.death,
          assist: participant.assist,
          headshot: participant.headshot,
          damage: participant.damage,
        },
      }),
    ),
    prisma.nexonMatchParticipant.deleteMany({
      where: { nexonMatchId: input.stagingId, slot: { gte: detail.participants.length } },
    }),
    prisma.nexonMatch.update({
      where: { id: input.stagingId },
      data: {
        matchMode: detail.matchMode,
        matchType: detail.matchType,
        dateMatch: detail.dateMatch,
        matchMap: detail.matchMap,
        participantCount: detail.participants.length,
        detailRawImportId: raw.id,
        detailFetchedAt: now,
        lastVerifiedAt: now,
        refreshDueAt: due,
        staleAt: null,
        validationStatus: issues.length === 0 ? 'valid' : 'invalid',
        validationIssues:
          issues.length === 0 ? undefined : (issues as unknown as Prisma.InputJsonValue),
      },
    }),
  ])

  await markNormalized(raw.id)

  // 닉네임 관측 기록 — 참가자는 ouid 없이 닉네임만 온다
  for (const participant of detail.participants) {
    if (!participant.userName) continue
    await prisma.nexonNickname.upsert({
      where: {
        nicknameLower_identityKey: {
          nicknameLower: participant.userName.toLowerCase(),
          identityKey: '-',
        },
      },
      create: {
        nickname: participant.userName,
        nicknameLower: participant.userName.toLowerCase(),
        ouid: null,
        identityKey: '-',
      },
      update: { observations: { increment: 1 }, lastSeenAt: now },
    })
  }

  if (issues.length > 0) return 'invalid'
  return raw.isNew ? 'stored' : 'unchanged'
}

export async function runCollect(
  ctx: JobContext,
  input: {
    ouids: readonly string[]
    /** 상세를 받을 매치 유형을 좁힌다. 소량 검증에서 호출 수를 아끼기 위한 장치 */
    detailMatchType?: string | null
    /** 특정 경기 하나만 상세를 받는다. 응답 형태를 확인할 때 쓴다 */
    detailSourceMatchIds?: readonly string[]
    /** 조회할 게임 모드를 좁힌다. 기본은 4개 전부 (넥슨이 mode를 필수로 요구한다) */
    modes?: readonly MatchMode[]
    /** 목록만 받고 상세는 건너뛴다. 호출 수를 아껴야 할 때 쓴다 */
    skipDetails?: boolean
  },
): Promise<CollectResult> {
  const result: CollectResult = {
    listCalls: 0,
    matchesSeen: 0,
    matchesCreated: 0,
    detailsFetched: 0,
    detailsUnchanged: 0,
    invalid: 0,
    failed: 0,
  }

  /* ---------------------------------------------------------- 1) 매치 목록 --- */
  const modes = input.modes?.length ? input.modes : MATCH_MODES
  for (const ouid of input.ouids) {
    for (const mode of modes) {
      const jobKey = `nexon:matchlist:${ouid}:${mode}`

      if (ctx.resume && (await isJobDone(NEXON_SOURCE, jobKey, ctx.config.migrationVersion))) {
        // ouid는 계정 식별자다. 로그에 통째로 남기지 않는다
        log(`건너뜀(완료됨): ${ouid.slice(0, 6)}… / ${mode}`)
        continue
      }

      if (ctx.dryRun) {
        log(`[dry-run] GET /suddenattack/v1/match?ouid=…&match_mode=${mode}`)
        result.listCalls += 1
        continue
      }

      const job = await startJob({
        source: NEXON_SOURCE,
        jobKey,
        migrationVersion: ctx.config.migrationVersion,
      })

      try {
        const response = await requireClient(ctx).getMatchList({ ouid, matchMode: mode })
        result.listCalls += 1

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
        if (skipped > 0) warn(`${jobKey}: match_id 없는 항목 ${skipped}건`)

        let created = 0
        for (const entry of entries) {
          const isNew = await upsertStagingFromList(entry, {
            discoveredByOuid: ouid,
            listRawImportId: raw.id,
          })
          if (isNew) created += 1
        }
        await markNormalized(raw.id)

        result.matchesSeen += entries.length
        result.matchesCreated += created

        await checkpoint(job.id, {
          cursor: entries.at(-1)?.sourceMatchId ?? null,
          processed: entries.length,
        })
        await finishJob(job.id, { status: 'done', processed: entries.length })
        log(`${mode}: 목록 ${entries.length}건 (신규 ${created}건)`)
      } catch (error) {
        result.failed += 1
        await finishJob(job.id, {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        })
        await handleJobError({ error, source: NEXON_SOURCE, jobKey, sourceId: ouid })
      }
    }
  }

  /* ---------------------------------------------------------- 2) 매치 상세 --- */
  if (input.skipDetails) {
    log('상세 조회는 건너뛴다 (--no-detail)')
    return result
  }

  if (ctx.dryRun) {
    const pendingCount = await prisma.nexonMatch.count({
      where: {
        detailFetchedAt: null,
        ...(input.detailMatchType ? { matchType: input.detailMatchType } : {}),
      },
    })
    log(`[dry-run] 상세 미수집 매치 ${pendingCount}건`)
    return result
  }

  const pending = await prisma.nexonMatch.findMany({
    where: input.detailSourceMatchIds?.length
      ? { sourceMatchId: { in: [...input.detailSourceMatchIds] } }
      : {
          detailFetchedAt: null,
          ...(input.detailMatchType ? { matchType: input.detailMatchType } : {}),
        },
    orderBy: { createdAt: 'asc' },
    take: ctx.limit ?? 50,
    select: { id: true, sourceMatchId: true },
  })

  for (const match of pending) {
    const jobKey = `nexon:matchdetail:${match.sourceMatchId}`
    const job = await startJob({
      source: NEXON_SOURCE,
      jobKey,
      migrationVersion: ctx.config.migrationVersion,
      expected: 1,
    })
    try {
      const outcome = await fetchAndStoreDetail(ctx, {
        stagingId: match.id,
        sourceMatchId: match.sourceMatchId,
      })
      if (outcome === 'stored') result.detailsFetched += 1
      if (outcome === 'unchanged') result.detailsUnchanged += 1
      if (outcome === 'invalid') result.invalid += 1
      await finishJob(job.id, { status: 'done', processed: 1 })
    } catch (error) {
      result.failed += 1
      await finishJob(job.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      })
      await handleJobError({
        error,
        source: NEXON_SOURCE,
        jobKey,
        sourceId: match.sourceMatchId,
      })
    }
  }

  return result
}
