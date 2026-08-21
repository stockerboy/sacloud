/**
 * 잡 공통 컨텍스트.
 *
 * `--dry-run`이면 **client가 null**이다. 요청을 한 건도 보내지 않고 계획만 출력한다.
 * 그래서 API 키 없이도 파이프라인 전체를 점검할 수 있다.
 */
import { NexonApiError, type NexonClient, type NexonConfig } from '@sacloud/nexon'
import { fail, warn } from '../lib/log.js'
import { recordFailure } from '../lib/jobStore.js'

export interface JobContext {
  config: NexonConfig
  client: NexonClient | null
  dryRun: boolean
  limit: number | null
  resume: boolean
}

/** 접근 통제(403·키 오류)를 만나면 전체를 멈춘다. 우회하지 않는다 */
export class AbortCollection extends Error {
  constructor(readonly apiError: NexonApiError) {
    super(`수집을 중단한다: ${apiError.message}`)
    this.name = 'AbortCollection'
  }
}

export function requireClient(ctx: JobContext): NexonClient {
  if (!ctx.client) {
    throw new Error('client가 없다 (--dry-run에서는 요청을 보내지 않는다)')
  }
  return ctx.client
}

/**
 * 오류 처리 규칙 (`docs/NEXON_INGEST_SPEC.md` 8-3)
 * - forbidden → 전체 중단
 * - bad_request / invalid_response → 이 대상만 실패로 기록하고 계속
 * - 그 외(재시도 소진) → 실패로 기록하고 계속
 */
export async function handleJobError(input: {
  error: unknown
  source: string
  jobKey: string
  sourceId?: string | null
}): Promise<void> {
  const { error, source, jobKey, sourceId } = input

  if (error instanceof NexonApiError) {
    await recordFailure({
      source,
      jobKey,
      sourceId,
      reason: error.kind,
      detail: {
        message: error.message,
        httpStatus: error.httpStatus,
        apiErrorName: error.apiErrorName,
      },
    })
    if (error.fatal) {
      fail(`접근이 거부됐다 (${error.apiErrorName ?? error.httpStatus}). 우회하지 않고 멈춘다`)
      throw new AbortCollection(error)
    }
    warn(`실패: ${jobKey} — ${error.kind}`)
    return
  }

  const message = error instanceof Error ? error.message : String(error)
  await recordFailure({ source, jobKey, sourceId, reason: 'unexpected', detail: { message } })
  warn(`예상치 못한 실패: ${jobKey} — ${message}`)
}
