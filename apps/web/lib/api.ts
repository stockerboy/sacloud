import { buildPath, endpoints, resolveApiBaseUrl, type EndpointKey } from '@sacloud/contract'
import type { z } from 'zod'

/**
 * 계약(`packages/contract`) 기반 API 클라이언트.
 *
 * 응답은 반드시 계약 스키마로 파싱한다. Mock(MSW)과 실제 서버(Phase 7)가
 * 같은 스키마를 구현하므로, 계약이 깨지면 화면이 아니라 여기서 먼저 터진다.
 */

const BASE_URL = resolveApiBaseUrl({
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
})

export type ResponseOf<K extends EndpointKey> = z.infer<(typeof endpoints)[K]['response']>

/** 남은 시간을 사람 말로 — 60초가 넘으면 분으로 (올림: 「곧 된다」고 오해시키지 않는다) */
function formatRetryAfter(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}초`
  return `${Math.ceil(seconds / 60)}분`
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /**
     * ★서버가 사람 말로 써 준 문장★ (2026-09-02 · O-023).
     *
     * 그전에는 이걸 **버렸다.** `message` 에는 `POST /auth/signup → 400` 같은
     * 기계어만 담겼고, 서버가 `signupFieldMessage()` 로 칸마다 만들어 준 문장은
     * 중간에서 사라졌다. 그래서 화면은 「가입하지 못했습니다」밖에 못 그렸다.
     * **가입이 왜 막혔는지 아무도 알 수 없었다.**
     *
     * `apiSend` 를 쓰는 **모든 화면**이 같은 문제를 갖고 있었다.
     */
    readonly serverMessage?: string,
    /** 칸별 오류 — `{ username: ['이미 사용 중인 아이디입니다'] }` */
    readonly fieldErrors?: Record<string, string[]>,
    /**
     * `Retry-After` 초 (2026-09-03 · O-029).
     *
     * 429 는 **언제 다시 되는지**를 같이 말해 주지 않으면 사용자가 계속 두드린다.
     * 두드릴수록 한도가 길어지니 정확히 반대로 행동하게 만든다. 서버는 이미
     * 헤더로 주고 있었는데(`respond.tooManyRequests`) 여기서 버렸다.
     */
    readonly retryAfterSeconds?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /**
   * 사람에게 보여 줄 한 줄.
   *
   * 서버가 준 말이 있으면 그것을, 없으면 부르는 쪽이 준 기본 문구를 쓴다.
   * **기계어(`POST /… → 400`)는 절대 화면에 내보내지 않는다.**
   */
  humanMessage(fallback: string): string {
    const base = this.serverMessage?.trim() || fallback
    /* 남은 시간을 아는 429 면 뒤에 붙인다 — 「잠시」보다 「40초」가 사람을 기다리게 한다 */
    if (this.status === 429 && this.retryAfterSeconds && this.retryAfterSeconds > 0) {
      return `${base} 약 ${formatRetryAfter(this.retryAfterSeconds)} 뒤에 다시 시도할 수 있습니다.`
    }
    return base
  }
}

export interface ApiGetOptions {
  /** `:param` 경로 치환값 (인코딩은 buildPath가 처리한다) */
  params?: Record<string, string | number>
  /** 쿼리스트링. `undefined`인 값은 붙이지 않는다. */
  search?: Record<string, string | number | undefined>
  /**
   * 요청 취소 신호 (2026-09-02 · O-002).
   *
   * 자동완성처럼 **글자를 칠 때마다 나가는** 조회는 앞선 요청을 취소해야 한다.
   * 안 그러면 늦게 온 옛 응답이 새 응답을 덮어써서 엉뚱한 후보가 남고,
   * 취소되지 않은 요청만큼 DB 를 헛되이 때린다.
   *
   * 넘기지 않으면 지금까지와 **똑같이** 동작한다 — 기존 호출은 하나도 안 고쳤다.
   * 취소되면 `fetch` 가 `AbortError` 로 거절하므로 부르는 쪽에서 걸러 낸다.
   */
  signal?: AbortSignal
}

export async function apiGet<K extends EndpointKey>(
  key: K,
  options: ApiGetOptions = {},
): Promise<ResponseOf<K>> {
  const endpoint = endpoints[key]
  const path = buildPath(endpoint.path, options.params ?? {})

  const search = new URLSearchParams()
  for (const [name, value] of Object.entries(options.search ?? {})) {
    if (value !== undefined) search.set(name, String(value))
  }
  const queryString = search.toString()

  const response = await fetch(`${BASE_URL}${path}${queryString ? `?${queryString}` : ''}`, {
    signal: options.signal,
  })
  if (!response.ok) {
    throw new ApiError(response.status, `${endpoint.method} ${path} → ${response.status}`)
  }

  const payload: unknown = await response.json()
  return endpoint.response.parse(payload) as ResponseOf<K>
}
