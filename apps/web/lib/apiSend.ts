import { buildPath, endpoints, resolveApiBaseUrl, type EndpointKey } from '@sacloud/contract'
import type { ResponseOf } from './api'
import { ApiError } from './api'

/**
 * 쓰기 계열(POST/PUT/DELETE) 요청.
 *
 * Mock(Phase 5~6) 단계에서는 계약 형태만 돌려준다 — 실제 저장·rate limit·캡차는 Phase 7 이후다.
 * 응답은 GET과 마찬가지로 계약 스키마로 검증한다.
 */

const BASE_URL = resolveApiBaseUrl({
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
})

export interface ApiSendOptions {
  params?: Record<string, string | number>
  body?: unknown
}

export async function apiSend<K extends EndpointKey>(
  key: K,
  options: ApiSendOptions = {},
): Promise<ResponseOf<K>> {
  const endpoint = endpoints[key]
  const path = buildPath(endpoint.path, options.params ?? {})

  const response = await fetch(`${BASE_URL}${path}`, {
    method: endpoint.method,
    headers: { 'content-type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  if (!response.ok) {
    throw new ApiError(response.status, `${endpoint.method} ${path} → ${response.status}`)
  }

  const payload: unknown = await response.json()
  return endpoint.response.parse(payload) as ResponseOf<K>
}
