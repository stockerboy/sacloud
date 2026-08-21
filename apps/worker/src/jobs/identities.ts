/**
 * 신원 수집 — 닉네임 → ouid.
 *
 * **여기서 사람을 확정하지 않는다.** ouid를 알아내고 관측 이력을 남길 뿐이며,
 * `Player` 연결은 근거가 있을 때만, 사람의 판단으로 한다 (`docs/NEXON_INGEST_SPEC.md` 5장).
 */
import { prisma, type Prisma } from '@sacloud/db'
import { ENDPOINT, NEXON_SOURCE } from '@sacloud/nexon'
import { log } from '../lib/log.js'
import { checkpoint, finishJob, isJobDone, recordFailure, startJob } from '../lib/jobStore.js'
import { storeRaw } from '../lib/rawStore.js'
import {
  buildCandidateKey,
  planIdentityObservation,
  type IdentityRow,
  type IdentityStatus,
} from '../lib/identity.js'
import { handleJobError, requireClient, type JobContext } from './context.js'

export interface IdentityRunResult {
  attempted: number
  resolved: number
  failed: number
  candidatesCreated: number
}

/** 닉네임 관측 기록. 닉네임은 식별자가 아니라 **관측값**이다 */
async function observeNickname(nickname: string, ouid: string | null): Promise<void> {
  const identityKey = ouid ?? '-'
  await prisma.nexonNickname.upsert({
    where: {
      nicknameLower_identityKey: { nicknameLower: nickname.toLowerCase(), identityKey },
    },
    create: {
      nickname,
      nicknameLower: nickname.toLowerCase(),
      ouid,
      identityKey,
    },
    update: { observations: { increment: 1 }, lastSeenAt: new Date(), nickname },
  })
}

/**
 * ouid 관측을 반영한다.
 *
 * - 처음 보는 ouid → `unresolved`로 만든다. **누구인지는 아직 모른다.**
 * - 연결 후보는 `NexonIdentityCandidate`로만 남긴다. **자동 연결은 없다.**
 */
export async function observeIdentity(input: {
  ouid: string
  userName: string
  observedAt?: Date
}): Promise<{ created: boolean; candidatesCreated: number }> {
  const observedAt = input.observedAt ?? new Date()

  const existing = await prisma.nexonIdentity.findUnique({ where: { ouid: input.ouid } })
  const sameNickname = await prisma.nexonIdentity.findMany({
    where: { userName: input.userName, NOT: { ouid: input.ouid } },
    select: { ouid: true, playerId: true, status: true, userName: true },
    take: 20,
  })
  const players = await prisma.player.findMany({
    where: { name: input.userName },
    select: { id: true },
    take: 2,
  })

  const plan = planIdentityObservation({
    ouid: input.ouid,
    userName: input.userName,
    existing: existing
      ? {
          ouid: existing.ouid,
          playerId: existing.playerId,
          status: existing.status as IdentityStatus,
          userName: existing.userName,
        }
      : null,
    sameNicknameIdentities: sameNickname.map(
      (row): IdentityRow => ({
        ouid: row.ouid,
        playerId: row.playerId,
        status: row.status as IdentityStatus,
        userName: row.userName,
      }),
    ),
    playerIdsWithSameName: players.map((player) => player.id),
    observedAt,
  })

  await prisma.nexonIdentity.upsert({
    where: { ouid: input.ouid },
    create: {
      ouid: input.ouid,
      userName: input.userName,
      // 기본은 unresolved — ouid를 알아냈다고 해서 동일인이 확정되는 것이 아니다
      status: 'unresolved',
      firstSeenAt: observedAt,
      lastSeenAt: observedAt,
      lastVerifiedAt: observedAt,
    },
    update: {
      userName: input.userName,
      lastSeenAt: observedAt,
      lastVerifiedAt: observedAt,
    },
  })

  await observeNickname(input.userName, input.ouid)

  let candidatesCreated = 0
  for (const candidate of plan.candidates) {
    const candidateKey = buildCandidateKey(candidate)
    const before = await prisma.nexonIdentityCandidate.findUnique({
      where: { candidateKey },
      select: { id: true },
    })
    await prisma.nexonIdentityCandidate.upsert({
      where: { candidateKey },
      create: {
        ouid: candidate.ouid,
        targetPlayerId: candidate.targetPlayerId,
        targetOuid: candidate.targetOuid,
        reason: candidate.reason,
        evidence: candidate.evidence as Prisma.InputJsonValue,
        candidateKey,
      },
      update: { evidence: candidate.evidence as Prisma.InputJsonValue },
    })
    if (!before) candidatesCreated += 1
  }

  return { created: plan.createIdentity, candidatesCreated }
}

export async function runIdentities(
  ctx: JobContext,
  nicknames: readonly string[],
): Promise<IdentityRunResult> {
  const result: IdentityRunResult = {
    attempted: 0,
    resolved: 0,
    failed: 0,
    candidatesCreated: 0,
  }

  const targets = ctx.limit ? nicknames.slice(0, ctx.limit) : nicknames

  for (const nickname of targets) {
    const jobKey = `nexon:identity:${nickname}`

    if (ctx.resume && (await isJobDone(NEXON_SOURCE, jobKey, ctx.config.migrationVersion))) {
      log(`건너뜀(완료됨): ${nickname}`)
      continue
    }

    if (ctx.dryRun) {
      log(`[dry-run] GET ${ENDPOINT.id}?user_name=${nickname}`)
      result.attempted += 1
      continue
    }

    const job = await startJob({
      source: NEXON_SOURCE,
      jobKey,
      migrationVersion: ctx.config.migrationVersion,
      expected: 1,
    })
    result.attempted += 1

    try {
      const response = await requireClient(ctx).getOuid(nickname)
      await storeRaw({
        source: NEXON_SOURCE,
        endpoint: response.endpoint,
        sourceId: response.sourceId,
        requestParams: response.requestParams,
        httpStatus: response.httpStatus,
        raw: response.raw,
        migrationVersion: ctx.config.migrationVersion,
      })

      const ouid = response.data.ouid
      if (!ouid) {
        await recordFailure({
          source: NEXON_SOURCE,
          jobKey,
          sourceId: nickname,
          reason: 'no_ouid',
          detail: { note: '응답에 ouid가 없다' },
        })
        await finishJob(job.id, { status: 'failed', processed: 0, error: 'no_ouid' })
        result.failed += 1
        continue
      }

      const observed = await observeIdentity({ ouid, userName: nickname })
      result.resolved += 1
      result.candidatesCreated += observed.candidatesCreated

      await checkpoint(job.id, { cursor: ouid, processed: 1 })
      await finishJob(job.id, { status: 'done', processed: 1 })
      log(
        `신원 관측: ${nickname} → ouid 확보${
          observed.candidatesCreated > 0 ? ` · 연결 후보 ${observed.candidatesCreated}건` : ''
        }`,
      )
    } catch (error) {
      result.failed += 1
      await finishJob(job.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      })
      await handleJobError({ error, source: NEXON_SOURCE, jobKey, sourceId: nickname })
    }
  }

  return result
}
