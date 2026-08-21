/**
 * 넥슨 Open API 클라이언트.
 *
 * 설계
 * - `fetch`와 시계를 **주입**한다. 그래야 네트워크 없이 재시도·백오프·감속을 테스트할 수 있다.
 * - 응답 원문(파싱 전 JSON)을 그대로 돌려준다. 호출자가 `RawImport`에 무손실로 남긴다.
 * - **API 키는 헤더로만 보낸다.** 반환하는 `requestParams`에도, 오류 메시지에도 들어가지 않는다.
 * - 접근 통제를 우회하지 않는다. 403이면 즉시 멈춘다. UA는 우리가 누구인지 밝히는 값이다.
 */
import { hasApiKey, redactSecrets, type NexonConfig } from './config'
import { buildQuery, ENDPOINT, type MatchMode, type MatchType } from './endpoints'
import { classifyResponse, NexonApiError, parseRetryAfter } from './errors'
import {
  NexonErrorBody,
  NexonIdResponse,
  NexonMatchDetailResponse,
  NexonMatchListResponse,
  NexonUserBasicResponse,
} from './schemas'
import { backoffDelayMs, systemClock, TokenBucket, type Clock } from './rateLimit'
import type { z } from 'zod'

export interface HttpHeadersLike {
  get(name: string): string | null
}

export interface HttpResponseLike {
  status: number
  headers: HttpHeadersLike
  text(): Promise<string>
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; signal?: AbortSignal },
) => Promise<HttpResponseLike>

export interface NexonCallResult<T> {
  endpoint: string
  /** 원본 쪽 식별자 (ouid · match_id · 닉네임) — `RawImport.sourceId` */
  sourceId: string
  /** 저장해도 되는 요청 파라미터. **키는 들어 있지 않다** */
  requestParams: Record<string, string>
  httpStatus: number
  /** 파싱 전 응답 JSON. 가공하지 않는다 */
  raw: unknown
  data: T
  attempts: number
  durationMs: number
}

export interface NexonClientOptions {
  config: NexonConfig
  fetchImpl?: FetchLike
  clock?: Clock
  bucket?: TokenBucket
  /** 백오프 지터용. 테스트에서 고정값을 주입한다 */
  random?: () => number
}

interface RequestSpec<T extends z.ZodTypeAny> {
  endpoint: string
  params: Record<string, string | undefined>
  sourceId: string
  schema: T
}

export class NexonClient {
  private readonly config: NexonConfig
  private readonly fetchImpl: FetchLike
  private readonly clock: Clock
  private readonly bucket: TokenBucket
  private readonly random: () => number

  constructor(options: NexonClientOptions) {
    this.config = options.config
    this.clock = options.clock ?? systemClock
    this.fetchImpl =
      options.fetchImpl ?? ((url, init) => fetch(url, init) as unknown as Promise<HttpResponseLike>)
    this.bucket =
      options.bucket ??
      new TokenBucket({ ratePerSecond: options.config.requestsPerSecond, clock: this.clock })
    this.random = options.random ?? Math.random
  }

  /** 현재 속도(초당 요청 수). 429로 감속되면 값이 내려간다 */
  get ratePerSecond(): number {
    return this.bucket.ratePerSecond
  }

  private redact(text: string): string {
    return redactSecrets(text, [this.config.apiKey])
  }

  private async requestOnce<T extends z.ZodTypeAny>(
    spec: RequestSpec<T>,
  ): Promise<{ httpStatus: number; raw: unknown; data: z.infer<T> }> {
    const url = `${this.config.baseUrl}${spec.endpoint}${buildQuery(spec.params)}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs)

    let response: HttpResponseLike
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          // 키는 오직 이 헤더로만 나간다
          'x-nxopen-api-key': this.config.apiKey ?? '',
          accept: 'application/json',
          'user-agent': this.config.userAgent,
        },
        signal: controller.signal,
      })
    } catch (error) {
      const message = this.redact(error instanceof Error ? error.message : String(error))
      const aborted = error instanceof Error && error.name === 'AbortError'
      throw new NexonApiError({
        kind: aborted ? 'timeout' : 'network',
        message: aborted ? `요청 시간이 초과됐다 (${this.config.requestTimeoutMs}ms)` : message,
        endpoint: spec.endpoint,
        sourceId: spec.sourceId,
      })
    } finally {
      clearTimeout(timer)
    }

    const bodyText = await response.text()
    let raw: unknown = null
    let parseFailed = false
    try {
      raw = bodyText.trim() === '' ? null : JSON.parse(bodyText)
    } catch {
      parseFailed = true
    }

    const errorBody = NexonErrorBody.safeParse(raw)
    const apiErrorName = errorBody.success ? errorBody.data.error.name : null
    const apiErrorMessage = errorBody.success ? errorBody.data.error.message : null
    const kind = classifyResponse(response.status, apiErrorName)

    if (kind !== 'ok') {
      throw new NexonApiError({
        kind,
        message: this.redact(
          `${spec.endpoint} → HTTP ${response.status}` +
            (apiErrorName ? ` (${apiErrorName}: ${apiErrorMessage ?? ''})` : ''),
        ),
        httpStatus: response.status,
        apiErrorName,
        retryAfterSeconds: parseRetryAfter(response.headers.get('retry-after')),
        endpoint: spec.endpoint,
        sourceId: spec.sourceId,
      })
    }

    if (parseFailed) {
      throw new NexonApiError({
        kind: 'invalid_response',
        message: `${spec.endpoint} → 200인데 JSON이 아니다`,
        httpStatus: response.status,
        endpoint: spec.endpoint,
        sourceId: spec.sourceId,
      })
    }

    const parsed = spec.schema.safeParse(raw)
    if (!parsed.success) {
      throw new NexonApiError({
        kind: 'invalid_response',
        message: this.redact(`${spec.endpoint} → 응답이 계약과 다르다: ${parsed.error.message}`),
        httpStatus: response.status,
        endpoint: spec.endpoint,
        sourceId: spec.sourceId,
      })
    }

    return { httpStatus: response.status, raw, data: parsed.data as z.infer<T> }
  }

  /**
   * 재시도 정책
   * - 429 → `Retry-After` 존중 + 감속 후 재시도
   * - 5xx · 네트워크 · 타임아웃 → 지수 백오프 재시도
   * - 400 · 403 · 계약 위반 → 재시도하지 않는다
   */
  async request<T extends z.ZodTypeAny>(spec: RequestSpec<T>): Promise<NexonCallResult<z.infer<T>>> {
    if (!hasApiKey(this.config)) {
      throw new NexonApiError({
        kind: 'forbidden',
        message: 'NEXON_API_KEY가 없다. 실제 호출을 시도하지 않는다',
        endpoint: spec.endpoint,
        sourceId: spec.sourceId,
      })
    }

    const startedAt = this.clock.now()
    const storedParams: Record<string, string> = {}
    for (const [key, value] of Object.entries(spec.params)) {
      if (value !== undefined) storedParams[key] = value
    }

    let attempt = 0
    for (;;) {
      await this.bucket.take()
      try {
        const result = await this.requestOnce(spec)
        this.bucket.speedUp()
        return {
          endpoint: spec.endpoint,
          sourceId: spec.sourceId,
          requestParams: storedParams,
          httpStatus: result.httpStatus,
          raw: result.raw,
          data: result.data,
          attempts: attempt + 1,
          durationMs: this.clock.now() - startedAt,
        }
      } catch (error) {
        if (!(error instanceof NexonApiError)) throw error
        if (error.kind === 'rate_limited') this.bucket.slowDown()
        if (!error.retryable || attempt >= this.config.maxRetries) throw error

        const waitMs =
          error.retryAfterSeconds !== null
            ? error.retryAfterSeconds * 1000
            : backoffDelayMs(attempt, { random: this.random })
        await this.clock.sleep(waitMs)
        attempt += 1
      }
    }
  }

  /* ------------------------------------------------------------------ 엔드포인트 --- */

  /** 닉네임 → ouid. 닉네임은 영구 식별자가 아니다 (신원 규칙은 스펙 5장) */
  getOuid(userName: string) {
    return this.request({
      endpoint: ENDPOINT.id,
      params: { user_name: userName },
      sourceId: userName,
      schema: NexonIdResponse,
    })
  }

  getUserBasic(ouid: string) {
    return this.request({
      endpoint: ENDPOINT.userBasic,
      params: { ouid },
      sourceId: ouid,
      schema: NexonUserBasicResponse,
    })
  }

  /**
   * 매치 목록. `match_mode`는 필수라 모드별로 호출한다.
   * `match_type`은 **지정하지 않는 것이 기본**이다 (원본을 그대로 받아 스테이징에 보존).
   */
  getMatchList(input: { ouid: string; matchMode: MatchMode; matchType?: MatchType }) {
    return this.request({
      endpoint: ENDPOINT.match,
      params: { ouid: input.ouid, match_mode: input.matchMode, match_type: input.matchType },
      sourceId: `${input.ouid}:${input.matchMode}`,
      schema: NexonMatchListResponse,
    })
  }

  getMatchDetail(matchId: string) {
    return this.request({
      endpoint: ENDPOINT.matchDetail,
      params: { match_id: matchId },
      sourceId: matchId,
      schema: NexonMatchDetailResponse,
    })
  }
}
