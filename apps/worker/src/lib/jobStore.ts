/**
 * 작업 상태 (`ImportJob` / `ImportFailure`).
 *
 * `CLAUDE.md` 3-A 4번 — **중단 후 재개 가능한 idempotent 파이프라인.**
 * 큐 인프라(Redis/BullMQ)는 쓰지 않는다. 체크포인트는 DB에 남긴다 (C 결정).
 *
 * 넥슨 `/match`에는 커서가 없다. 그래서 체크포인트는 매치가 아니라 **대상 단위**다
 * (`docs/NEXON_INGEST_SPEC.md` 8-2).
 */
import { prisma, type Prisma } from '@sacloud/db'

export type JobStatus = 'pending' | 'running' | 'done' | 'failed'

export interface JobHandle {
  id: string
  jobKey: string
}

export async function findJob(source: string, jobKey: string, migrationVersion: string) {
  return prisma.importJob.findUnique({
    where: { source_jobKey_migrationVersion: { source, jobKey, migrationVersion } },
  })
}

/** 이미 끝난 작업인가 — `--resume`이 건너뛸 대상 */
export async function isJobDone(
  source: string,
  jobKey: string,
  migrationVersion: string,
): Promise<boolean> {
  const job = await findJob(source, jobKey, migrationVersion)
  return job?.status === 'done'
}

export async function startJob(input: {
  source: string
  jobKey: string
  migrationVersion: string
  expected?: number | null
}): Promise<JobHandle> {
  const now = new Date()
  const job = await prisma.importJob.upsert({
    where: {
      source_jobKey_migrationVersion: {
        source: input.source,
        jobKey: input.jobKey,
        migrationVersion: input.migrationVersion,
      },
    },
    create: {
      source: input.source,
      jobKey: input.jobKey,
      migrationVersion: input.migrationVersion,
      status: 'running',
      expected: input.expected ?? null,
      startedAt: now,
      attempts: 1,
    },
    update: {
      status: 'running',
      startedAt: now,
      expected: input.expected ?? undefined,
      attempts: { increment: 1 },
      lastError: null,
      nextRetryAt: null,
    },
    select: { id: true, jobKey: true },
  })
  return job
}

export async function checkpoint(
  jobId: string,
  input: { cursor?: string | null; processed?: number },
): Promise<void> {
  await prisma.importJob.update({
    where: { id: jobId },
    data: {
      cursor: input.cursor ?? undefined,
      processed: input.processed ?? undefined,
    },
  })
}

export async function finishJob(
  jobId: string,
  input: { status: JobStatus; processed?: number; error?: string | null; nextRetryAt?: Date | null },
): Promise<void> {
  await prisma.importJob.update({
    where: { id: jobId },
    data: {
      status: input.status,
      processed: input.processed ?? undefined,
      lastError: input.error ?? null,
      nextRetryAt: input.nextRetryAt ?? null,
      finishedAt: new Date(),
    },
  })
}

/** 실패를 성공으로 처리하지 않기 위해 남긴다 (`CLAUDE.md` 3-A 6번) */
export async function recordFailure(input: {
  source: string
  jobKey: string
  sourceId?: string | null
  reason: string
  detail?: Record<string, unknown>
}): Promise<void> {
  await prisma.importFailure.create({
    data: {
      source: input.source,
      jobKey: input.jobKey,
      sourceId: input.sourceId ?? null,
      reason: input.reason,
      detail: (input.detail ?? null) as Prisma.InputJsonValue,
    },
  })
}

/** 검증 결과를 숫자로 남긴다 — "수집 완료" 로그가 아니라 이 표로 판정한다 */
export async function recordCheck(input: {
  name: string
  expected: number
  actual: number
  migrationVersion: string
  note?: string
}): Promise<boolean> {
  const passed = input.expected === input.actual
  await prisma.migrationCheck.create({
    data: {
      name: input.name,
      expected: input.expected,
      actual: input.actual,
      passed,
      note: input.note ?? null,
      migrationVersion: input.migrationVersion,
    },
  })
  return passed
}
