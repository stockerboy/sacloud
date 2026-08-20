'use client'

import { useState } from 'react'
import type { EndpointKey } from '@sacloud/contract'
import type { RefreshState } from '@sacloud/ui'
import { buildPath, endpoints } from '@sacloud/contract'
import { resolveApiBaseUrl } from '@sacloud/contract'

/**
 * `정보갱신` / `전적갱신` 요청.
 *
 * 원본은 버튼을 누르면 수집을 요청하고, 아래에 `최근갱신: N일 전`을 갱신한다.
 * Mock 단계에서는 지연 후 성공/실패를 흉내낸다 (계약: `RenewResult`).
 * 실제 수집 연동은 Phase 8이다.
 */

const BASE_URL = resolveApiBaseUrl({
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
})

export function useRefresh(key: EndpointKey, params: Record<string, string>) {
  const [state, setState] = useState<RefreshState>('idle')
  const [renewedAt, setRenewedAt] = useState<string | null>(null)

  const run = () => {
    if (state === 'pending') return
    setState('pending')
    const endpoint = endpoints[key]
    void fetch(`${BASE_URL}${buildPath(endpoint.path, params)}`, { method: endpoint.method })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status))
        const payload = (await response.json()) as { data: { renewed_at: string | null } }
        setRenewedAt(payload.data.renewed_at)
        setState('idle')
      })
      .catch(() => setState('failed'))
  }

  return { state, renewedAt, run }
}
