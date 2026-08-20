'use client'

import { useEffect, useState } from 'react'
import { resolveApiBaseUrl, resolveApiMode } from '@sacloud/contract'

/**
 * Mock API 부팅.
 *
 * `NEXT_PUBLIC_API_MODE=mock`이면 MSW Service Worker를 띄운 뒤 화면을 그린다.
 * `live`면 아무것도 하지 않는다 (Phase 7에서 실제 API로 전환).
 */

const API_MODE = resolveApiMode({ NEXT_PUBLIC_API_MODE: process.env.NEXT_PUBLIC_API_MODE })
const API_BASE_URL = resolveApiBaseUrl({
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
})

export function MockApiProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(API_MODE !== 'mock')

  useEffect(() => {
    if (API_MODE !== 'mock') return
    let cancelled = false

    void (async () => {
      const { createWorker } = await import('@sacloud/mock/browser')
      const worker = createWorker(API_BASE_URL)
      await worker.start({ onUnhandledRequest: 'bypass', quiet: true })
      if (!cancelled) setReady(true)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  if (!ready) {
    return <p style={{ padding: 16 }}>Mock API 준비 중…</p>
  }

  return <>{children}</>
}

export { API_BASE_URL, API_MODE }
