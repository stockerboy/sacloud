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

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
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
