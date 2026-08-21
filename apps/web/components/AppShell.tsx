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
 * 로그인 여부는 `GET /infos` 의 `user` 로 판단한다 (원본과 동일한 부트스트랩 방식).
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

  const infos = useQuery({
    queryKey: ['infos'],
    queryFn: () => apiGet('infos'),
    enabled: ready,
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
    <SiteShell user={infos.data?.data.user ?? null} onLogout={logout}>
      {children}
    </SiteShell>
  )
}
