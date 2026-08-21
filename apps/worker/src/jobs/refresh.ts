/**
 * 신선도 갱신.
 *
 * 넥슨 이용 조건의 "최소 30일마다 갱신"을 지키기 위한 재수집이다.
 * 주기는 `NEXON_REFRESH_INTERVAL_DAYS`로 바꾼다 — **코드에 고정하지 않는다**
 * (`docs/NEXON_INGEST_SPEC.md` 6장).
 */
import { prisma } from '@sacloud/db'
import { NEXON_SOURCE } from '@sacloud/nexon'
import { log } from '../lib/log.js'
import { finishJob, startJob } from '../lib/jobStore.js'
import { fetchAndStoreDetail } from './collect.js'
import { handleJobError, type JobContext } from './context.js'

export interface RefreshResult {
  due: number
  refreshed: number
  unchanged: number
  invalid: number
  failed: number
}

export async function runRefresh(ctx: JobContext): Promise<RefreshResult> {
  const now = new Date()
  const result: RefreshResult = { due: 0, refreshed: 0, unchanged: 0, invalid: 0, failed: 0 }

  const due = await prisma.nexonMatch.findMany({
    where: { refreshDueAt: { lte: now } },
    orderBy: { refreshDueAt: 'asc' },
    take: ctx.limit ?? 100,
    select: { id: true, sourceMatchId: true, refreshDueAt: true },
  })
  result.due = due.length

  log(`갱신 기한이 지난 매치 ${due.length}건 (주기 ${ctx.config.refreshIntervalDays}일)`)
  if (ctx.dryRun) {
    for (const match of due) log(`[dry-run] 재수집 대상: ${match.sourceMatchId}`)
    return result
  }

  for (const match of due) {
    const jobKey = `nexon:refresh:${match.sourceMatchId}`
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
      if (outcome === 'stored') result.refreshed += 1
      if (outcome === 'unchanged') result.unchanged += 1
      if (outcome === 'invalid') result.invalid += 1
      await finishJob(job.id, { status: 'done', processed: 1 })
    } catch (error) {
      result.failed += 1
      // 갱신하지 못했다는 사실을 남긴다. 조용히 오래된 값을 유지하지 않는다
      await prisma.nexonMatch.update({
        where: { id: match.id },
        data: { staleAt: now },
      })
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
