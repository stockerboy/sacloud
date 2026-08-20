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

  const response = await fetch(`${BASE_URL}${path}${queryString ? `?${queryString}` : ''}`)
  if (!response.ok) {
    throw new ApiError(response.status, `${endpoint.method} ${path} → ${response.status}`)
  }

  const payload: unknown = await response.json()
  return endpoint.response.parse(payload) as ResponseOf<K>
}
