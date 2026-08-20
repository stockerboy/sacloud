'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { resolveApiBaseUrl, resolveApiMode } from '@sacloud/contract'

/**
 * 전역 프로바이더 — Mock API 부팅 + 서버 상태(TanStack Query).
 *
 * `NEXT_PUBLIC_API_MODE=mock`이면 MSW Service Worker를 띄운다.
 * 워커가 준비되기 전에 요청을 보내면 가로채지 못하므로 준비 상태를 컨텍스트로 알린다.
 * 화면(헤더·히어로·카드 틀)은 기다리지 않고 바로 그리고, **데이터 요청만** 기다린다.
 * `live`(Phase 7 이후)에서는 처음부터 준비 완료다.
 */

const API_MODE = resolveApiMode({ NEXT_PUBLIC_API_MODE: process.env.NEXT_PUBLIC_API_MODE })
const API_BASE_URL = resolveApiBaseUrl({
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
})

const ApiReadyContext = createContext(false)

/** API 요청을 보내도 되는 상태인지 (Mock 모드에서 MSW 기동 완료 여부) */
export function useApiReady(): boolean {
  return useContext(ApiReadyContext)
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Mock은 고정 시드라 매번 같은 값이다. 창을 옮길 때마다 다시 부를 이유가 없다.
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 60_000,
      },
    },
  })
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(createQueryClient)
  const [ready, setReady] = useState(API_MODE !== 'mock')

  useEffect(() => {
    if (API_MODE !== 'mock') return
    let cancelled = false

    void (async () => {
      const { createWorker } = await import('@sacloud/mock/browser')
      const worker = createWorker(API_BASE_URL)
      await worker.start({ onUnhandledRequest: 'bypass', quiet: true })

      // Service Worker를 처음 설치한 방문에서는 등록이 끝나도 이 페이지를 아직 제어하지 않는다.
      // 그 사이에 나간 요청은 가로채이지 못하고 그대로 네트워크로 나가 응답 없이 매달린다.
      // 제어가 넘어올 때까지 기다렸다가 준비 완료로 표시한다.
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((resolve) => {
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
            once: true,
          })
        })
      }

      if (!cancelled) setReady(true)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ApiReadyContext.Provider value={ready}>{children}</ApiReadyContext.Provider>
    </QueryClientProvider>
  )
}
