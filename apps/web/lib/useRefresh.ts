'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { markRenewBust } from './api'
import type { EndpointKey } from '@sacloud/contract'
import type { RefreshState } from '@sacloud/ui'
import { buildPath, endpoints } from '@sacloud/contract'
import { resolveApiBaseUrl } from '@sacloud/contract'

/**
 * ★★「정보갱신」 — 끝날 때까지 기다렸다가 화면을 다시 그린다★★
 *
 * > 「정보갱신 안된다 또 ★되는척만하고★ … 왜 바로바로 안돼 진짜 열받게」
 * >   — 사장님, 2026-09-22
 *
 * ── 여태 무엇이 「되는 척」 이었나 (실측)
 *
 *   ```
 *   14:46:57  누름 → 큐에 들어감 → 답이 옴 → 「갱신중…」 이 「정보갱신」 으로
 *   14:47:08  일꾼이 병영을 읽고 ★닉을 고침★ (11초)
 *   ```
 *   ★DB 는 11초 만에 제대로 바뀌었다.★ 그런데 화면은 페이지를 ★다시 읽지 않았다.★
 *   그래서 옛 닉이 그대로 남았고, 「최근갱신 방금 전」 만 새것이 됐다.
 *
 * ── 이제
 *
 *   ```
 *   누름 → 큐에 넣음 → ★끝났나? 끝났나?★ (1초마다 물어봄)
 *        → 끝나면 ★router.refresh()★ → 그 자리에서 새 닉·새 소속이 보인다
 *   ```
 *
 * ⚠ ★영영 기다리지 않는다★ — `MAX_WAIT_MS` 가 지나면 그냥 다시 그린다.
 *   일꾼이 늦어도 화면이 「갱신중…」 에 갇히지 않는다.
 * ⚠ ★상태를 못 물어보는 화면에서도 동작한다★ — `statusPath` 가 없으면
 *   여태처럼 한 번만 부르고 끝낸다 (옛 방식 · `CLAUDE.md` 1-4).
 */

const BASE_URL = resolveApiBaseUrl({
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
})

/** 얼마나 자주 물어보나 */
const POLL_MS = 1000
/** 아무리 늦어도 여기까지만 기다린다 — 예약이 1분마다 도니 이 안에 대개 끝난다 */
const MAX_WAIT_MS = 75_000

interface Options {
  /**
   * 끝났는지 물어볼 주소. 주면 ★끝날 때까지 기다렸다가★ 화면을 다시 그린다.
   * 안 주면 옛 방식대로 한 번만 부르고 끝낸다.
   */
  statusPath?: string
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export function useRefresh(
  key: EndpointKey,
  params: Record<string, string>,
  options: Options = {},
) {
  const [state, setState] = useState<RefreshState>('idle')
  const [renewedAt, setRenewedAt] = useState<string | null>(null)
  const router = useRouter()
  const queryClient = useQueryClient()

  /** 끝날 때까지 물어본다. 못 물어보면 조용히 접는다 — 화면은 어차피 다시 그린다 */
  const waitUntilDone = async (statusPath: string): Promise<void> => {
    const until = Date.now() + MAX_WAIT_MS
    while (Date.now() < until) {
      await sleep(POLL_MS)
      try {
        /* ★지금 보고 있는 쪽★ 을 같이 알려 준다 — 그 한 쪽의 캐시를 털어야
           다시 읽었을 때 옛 화면이 안 온다 */
        const here = typeof window === 'undefined' ? '' : window.location.pathname
        const join = statusPath.includes('?') ? '&' : '?'
        const res = await fetch(
          `${BASE_URL}${statusPath}${join}path=${encodeURIComponent(here)}`,
          { cache: 'no-store' },
        )
        if (!res.ok) return
        const payload = (await res.json()) as { data?: { phase?: string } }
        const phase = payload.data?.phase
        /* ★끝났거나 접었으면 더 기다리지 않는다★ */
        if (phase === 'done' || phase === 'failed') return
      } catch {
        /* 한 번 못 물어본 것으로 포기하지 않는다 — 다음 판에 다시 묻는다 */
      }
    }
  }

  const run = () => {
    if (state === 'pending') return
    setState('pending')
    const endpoint = endpoints[key]
    void (async () => {
      try {
        const response = await fetch(`${BASE_URL}${buildPath(endpoint.path, params)}`, {
          method: endpoint.method,
        })
        if (!response.ok) throw new Error(String(response.status))
        const payload = (await response.json()) as { data: { renewed_at: string | null } }
        setRenewedAt(payload.data.renewed_at)

        /* ★여기서 끝내지 않는다★ — 진짜로 바뀐 뒤에 화면을 다시 그린다 */
        if (options.statusPath !== undefined) await waitUntilDone(options.statusPath)
        /* ★엣지 캐시를 우회해 다시 읽는다★ — 표식을 세운 뒤 클라이언트 쿼리를 전부 무효화 (api.ts markRenewBust 주석) */
        markRenewBust()
        void queryClient.invalidateQueries()
        router.refresh()
        setState('idle')
      } catch {
        setState('failed')
      }
    })()
  }

  return { state, renewedAt, run }
}
