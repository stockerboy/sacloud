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
    /*
     * ★서버가 준 이유를 실어 던진다★ (2026-09-02 · O-023).
     *
     * 그전에는 상태 코드만 남기고 본문을 버렸다. 서버는 `{ message, errors }` 로
     * 칸마다 사람 말을 만들어 주고 있는데(`signupFieldMessage()`) 그게 여기서
     * 사라져서, 화면은 「가입하지 못했습니다」 같은 한 줄밖에 못 그렸다.
     * **가입이 왜 막혔는지 아무도 알 수 없었다** — 사장님도 그래서 막히셨다.
     *
     * 본문을 못 읽어도 **던지는 것 자체는 그대로 한다.** 오류를 삼키면 안 된다.
     */
    let serverMessage: string | undefined
    let fieldErrors: Record<string, string[]> | undefined
    try {
      const body: unknown = await response.json()
      if (body && typeof body === 'object') {
        const raw = body as { message?: unknown; errors?: unknown }
        if (typeof raw.message === 'string') serverMessage = raw.message
        if (raw.errors && typeof raw.errors === 'object') {
          fieldErrors = raw.errors as Record<string, string[]>
        }
      }
    } catch {
      /* 본문이 JSON 이 아니거나 비었다. 아래에서 기계어만 남는다 */
    }
    throw new ApiError(
      response.status,
      `${endpoint.method} ${path} → ${response.status}`,
      serverMessage,
      fieldErrors,
    )
  }

  const payload: unknown = await response.json()
  return endpoint.response.parse(payload) as ResponseOf<K>
}
