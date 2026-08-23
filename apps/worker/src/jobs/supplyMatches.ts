/**
 * `nexon supply-matches` — 공식리그 경기 발견 → 넥슨 상세 보강 (D-127).
 *
 *   1) 스냅샷(`packages/db/data/supply-official-matches.json`)에서 match_id 를 읽는다
 *   2) 스테이징에 없는 것만 행을 만든다 (넥슨 호출 없음)
 *   3) 상세를 아직 안 받은 행에 대해 `/match-detail` 을 **1건당 1회** 부른다
 *
 * 호출량이 곧 비용이라 기본은 미리보기다. `--confirm` 없이는 DB 에 한 줄도 쓰지 않고
 * 넥슨도 부르지 않는다. 중단해도 이미 받은 상세는 남으므로 그대로 재실행하면 이어진다.
 */
import { readFileSync } from 'node:fs'
import { prisma } from '@sacloud/db'
import {
  seedStagingFromSupply,
  selectDiscoveryCandidates,
  type SupplyMatchSnapshot,
} from '@sacloud/db/ops'
import { NEXON_SOURCE } from '@sacloud/nexon'
import { log, warn } from '../lib/log.js'
import { finishJob, startJob } from '../lib/jobStore.js'
import { fetchAndStoreDetail } from './collect.js'
import { handleJobError, type JobContext } from './context.js'

/** 발견 출처 표시. 스테이징 행이 어디서 왔는지 구분하기 위한 것이다 */
export const SUPPLY_DISCOVERY_SOURCE = '3rd.supply'

export interface SupplyMatchesResult {
  snapshotMatches: number
  candidates: number
  created: number
  existing: number
  detailPending: number
  detailsFetched: number
  detailsUnchanged: number
  invalid: number
  failed: number
}

export function readSupplySnapshot(path: string): SupplyMatchSnapshot {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as SupplyMatchSnapshot
  if (!Array.isArray(parsed.matches)) throw new Error(`스냅샷에 matches 배열이 없다: ${path}`)
  return parsed
}

export async function runSupplyMatches(
  ctx: JobContext,
  input: {
    snapshotPath: string
    since?: Date | null
    until?: Date | null
    map?: string | null
    playerCount?: number | null
    confirm?: boolean
    /** 상세 조회를 건너뛰고 발견(스테이징 seed)까지만 한다 */
    discoverOnly?: boolean
    /** 상세를 받을 최대 건수. 호출량 상한이다 */
    detailLimit?: number | null
  },
): Promise<SupplyMatchesResult> {
  const snapshot = readSupplySnapshot(input.snapshotPath)
  const candidates = selectDiscoveryCandidates(snapshot, {
    since: input.since ?? null,
    until: input.until ?? null,
    map: input.map ?? null,
    playerCount: input.playerCount ?? null,
    limit: ctx.limit,
  })

  const seeded = await seedStagingFromSupply({
    candidates,
    source: NEXON_SOURCE,
    discoverySource: SUPPLY_DISCOVERY_SOURCE,
    confirm: Boolean(input.confirm),
  })

  const result: SupplyMatchesResult = {
    snapshotMatches: snapshot.matches.length,
    candidates: seeded.candidates,
    created: seeded.created,
    existing: seeded.existing,
    detailPending: seeded.detailPending,
    detailsFetched: 0,
    detailsUnchanged: 0,
    invalid: 0,
    failed: 0,
  }

  if (!input.confirm) {
    log('[미리보기] --confirm 이 없어 DB 에 쓰지 않았고 넥슨도 부르지 않았다')
    return result
  }
  if (input.discoverOnly) {
    log('발견까지만 한다 (--discover-only) — 상세는 부르지 않았다')
    return result
  }
  if (ctx.dryRun) {
    log(`[dry-run] 상세 미수집 ${result.detailPending}건 — 요청은 보내지 않는다`)
    return result
  }

  /* ------------------------------------------------------------ 상세 보강 --- */
  const ids = candidates.map((candidate) => candidate.sourceMatchId)
  const pending = await prisma.nexonMatch.findMany({
    where: { source: NEXON_SOURCE, sourceMatchId: { in: ids }, detailFetchedAt: null },
    orderBy: { sourceMatchId: 'asc' },
    take: input.detailLimit ?? undefined,
    select: { id: true, sourceMatchId: true },
  })

  log(`상세 조회 ${pending.length}건 시작 (미수집 ${result.detailPending}건 중)`)

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

  if (result.failed > 0) warn(`상세 실패 ${result.failed}건 — 그대로 다시 실행하면 이어진다`)
  return result
}

/** 스냅샷과 스테이징의 대조 — 숫자로 판정한다 ("수집 완료" 로그로 판정하지 않는다) */
export async function supplyMatchesStatus(snapshotPath: string): Promise<Record<string, unknown>> {
  const snapshot = readSupplySnapshot(snapshotPath)
  const ids = snapshot.matches.map((match) => match.id)

  const staged = await prisma.nexonMatch.count({
    where: { source: NEXON_SOURCE, sourceMatchId: { in: ids } },
  })
  const detailed = await prisma.nexonMatch.count({
    where: { source: NEXON_SOURCE, sourceMatchId: { in: ids }, detailFetchedAt: { not: null } },
  })
  const supplyMap = await prisma.nexonMatch.count({
    where: { source: NEXON_SOURCE, sourceMatchId: { in: ids }, matchMap: '제3보급창고' },
  })
  const projected = await prisma.nexonMatch.count({
    where: { source: NEXON_SOURCE, sourceMatchId: { in: ids }, projectionStatus: 'projected' },
  })

  return {
    스냅샷: snapshot.matches.length,
    스테이징: staged,
    상세확보: detailed,
    '맵=제3보급창고': supplyMap,
    투영됨: projected,
    미수집: snapshot.matches.length - detailed,
  }
}
