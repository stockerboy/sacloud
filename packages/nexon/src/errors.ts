/**
 * 넥슨 응답 분류.
 *
 * 재시도해도 되는 것과, 재시도하면 안 되는 것을 코드가 아니라 **분류**로 다룬다.
 * 403(키·권한)은 재시도로 풀리지 않으므로 작업 전체를 멈춘다.
 */

export type NexonErrorKind =
  /** 400 — 파라미터 오류. 대상 하나를 실패로 기록하고 넘어간다 */
  | 'bad_request'
  /** 401·403 또는 키 오류 — **작업 전체 중단** */
  | 'forbidden'
  /** 429 — 감속 후 재시도 */
  | 'rate_limited'
  /** 5xx — 재시도 */
  | 'server'
  /** 네트워크 실패 — 재시도 */
  | 'network'
  /** 타임아웃 — 재시도 */
  | 'timeout'
  /** 200인데 응답이 계약과 다르다 — 재시도하지 않는다 */
  | 'invalid_response'

export interface NexonErrorInit {
  kind: NexonErrorKind
  message: string
  httpStatus?: number
  /** 넥슨이 준 오류 이름 (예: OPENAPI00004). 의미는 실측으로만 확정한다 */
  apiErrorName?: string | null
  retryAfterSeconds?: number | null
  endpoint?: string
  sourceId?: string
}

export class NexonApiError extends Error {
  readonly kind: NexonErrorKind
  readonly httpStatus: number | null
  readonly apiErrorName: string | null
  readonly retryAfterSeconds: number | null
  readonly endpoint: string | null
  readonly sourceId: string | null

  constructor(init: NexonErrorInit) {
    super(init.message)
    this.name = 'NexonApiError'
    this.kind = init.kind
    this.httpStatus = init.httpStatus ?? null
    this.apiErrorName = init.apiErrorName ?? null
    this.retryAfterSeconds = init.retryAfterSeconds ?? null
    this.endpoint = init.endpoint ?? null
    this.sourceId = init.sourceId ?? null
  }

  /** 일시 오류인가 — 재시도 대상 */
  get retryable(): boolean {
    return isRetryable(this.kind)
  }

  /** 작업 전체를 멈춰야 하는가 */
  get fatal(): boolean {
    return this.kind === 'forbidden'
  }
}

export function isRetryable(kind: NexonErrorKind): boolean {
  return kind === 'rate_limited' || kind === 'server' || kind === 'network' || kind === 'timeout'
}

/** 넥슨이 키 문제로 돌려주는 오류 이름 (실측: 잘못된 키 → OPENAPI00005) */
const KEY_ERROR_NAMES = new Set(['OPENAPI00005', 'OPENAPI00009'])

/**
 * HTTP 상태 + 오류 이름 → 분류.
 *
 * 오류 이름의 의미는 실측된 것만 쓴다. 모르는 이름은 상태 코드로만 판단한다.
 */
export function classifyResponse(status: number, apiErrorName: string | null): NexonErrorKind | 'ok' {
  if (apiErrorName && KEY_ERROR_NAMES.has(apiErrorName)) return 'forbidden'
  if (status >= 200 && status < 300) return 'ok'
  if (status === 429) return 'rate_limited'
  if (status === 401 || status === 403) return 'forbidden'
  if (status >= 500) return 'server'
  if (status >= 400) return 'bad_request'
  return 'server'
}

/** `Retry-After` 헤더 — 초 단위 숫자만 해석한다. 날짜 형식은 [미확인]이라 무시한다. */
export function parseRetryAfter(value: string | null | undefined): number | null {
  if (!value) return null
  const seconds = Number(value.trim())
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
}
