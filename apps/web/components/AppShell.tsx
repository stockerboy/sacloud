'use client'

import { usePathname } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { SiteShell } from '@sacloud/ui'
import { resolveApiMode } from '@sacloud/contract'
import { apiGet } from '@/lib/api'
import { apiSend } from '@/lib/apiSend'
import { useApiReady } from '@/app/providers'

/**
 * 전역 셸 + 로그인 상태 연결.
 *
 * 로그인 여부는 `GET /me` 로 판단한다.
 * (예전에는 `GET /infos` 의 `user` 였다 — 원본과 같은 부트스트랩 방식이었는데,
 *  익명 방문마다 DB 를 두 번 때려서 바꿨다. 아래 useQuery 주석에 이유가 있다)
 *
 * 로그아웃
 * - `live` — 서버에 `POST /auth/logout`. 세션이 httpOnly 쿠키라 **서버만 지울 수 있다.**
 * - `mock` — 서버가 없으므로 개발용 세션 스위치를 `guest`로 되돌린다.
 *
 * **인증 화면(`/auth/*`)에서는 전역 GNB·푸터를 그리지 않는다.**
 * 원본이 인증 화면을 화면 전체 카드 단독 레이아웃으로 두기 때문이다 (2026-08-21 관측).
 */
const API_MODE = resolveApiMode({ NEXT_PUBLIC_API_MODE: process.env.NEXT_PUBLIC_API_MODE })

export function AppShell({ children }: { children: React.ReactNode }) {
  const ready = useApiReady()
  const pathname = usePathname() ?? ''
  const queryClient = useQueryClient()

  /*
   * ── ★익명 방문이 DB 를 안 때리게 한다★ (2026-09-03 · O-018)
   *
   *   전에는 여기서 `GET /infos` 를 불렀다. 셸은 **모든 화면**에 붙으니
   *   **사람이 사이트에 들어오는 순간 무조건 한 번** 나간다. 그런데 `/infos` 는
   *   ```
   *   buildConfigs()               DB
   *   boardCategory.findMany()     DB   ← 게시판은 지금 닫혀 있다
   *   currentUser(request)         쿠키 없으면 DB 안 봄
   *   ```
   *   셸이 쓰는 건 저 셋 중 **`user` 하나뿐**이다. 나머지 둘은 버린다.
   *   천 명이 한꺼번에 오면 **익명 방문 천 번 × DB 2회**가 그대로 나간다.
   *
   *   `GET /me` 는 쿠키를 먼저 본다 — **로그인 안 한 사람은 DB 를 한 번도 안 본다.**
   *   비로그인은 401 이고, 셸에게 401 은 오류가 아니라 **「로그인 안 함」**이다.
   *
   *   ⚠ **「쿠키가 없으면 아예 안 부른다」는 못 한다.** 세션 쿠키가 `httpOnly` 라
   *     브라우저 JS 가 볼 수 없다. 부르되 **싸게** 부르는 것이 답이다.
   *
   *   ⚠ `retry: false` 가 필수다. 401 을 오류로 보고 세 번 더 부르면
   *     안 때리려던 걸 네 번 때린다.
   *
   *   되돌리려면 — `queryKey: ['infos']` · `apiGet('infos')` 로 바꾸고
   *   아래 `user` 를 `me.data?.data.user` 로 되돌린다.
   */
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet('meShow'),
    enabled: ready,
    retry: false,
  })

  const logout = () => {
    void (async () => {
      if (API_MODE === 'live') {
        await apiSend('authLogout', { body: {} })
      } else {
        // Mock 전용 경로. 번들에 픽스처가 딸려오지 않도록 동적 import 한다 (D-020).
        const { setMockRole } = await import('@sacloud/mock/session')
        setMockRole('guest')
      }
      await queryClient.invalidateQueries()
    })()
  }

  if (pathname.startsWith('/auth/')) return <>{children}</>

  return (
    <SiteShell user={me.data?.data ?? null} onLogout={logout}>
      {children}
    </SiteShell>
  )
}
