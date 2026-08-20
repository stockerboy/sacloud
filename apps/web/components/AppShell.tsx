'use client'

import { usePathname } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { SiteShell } from '@sacloud/ui'
import { setMockRole } from '@sacloud/mock/session'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/**
 * 전역 셸 + 로그인 상태 연결.
 *
 * 로그인 여부는 `GET /infos` 의 `user` 로 판단한다 (원본과 동일한 부트스트랩 방식).
 * 로그아웃은 Mock 단계에서 세션 스위치를 `guest` 로 되돌리는 것으로 대신한다 —
 * 실제 세션 만료·토큰 폐기는 Phase 7에서 붙인다.
 *
 * **인증 화면(`/auth/*`)에서는 전역 GNB·푸터를 그리지 않는다.**
 * 원본이 인증 화면을 화면 전체 카드 단독 레이아웃으로 두기 때문이다 (2026-08-21 관측).
 */
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
    setMockRole('guest')
    void queryClient.invalidateQueries()
  }

  if (pathname.startsWith('/auth/')) return <>{children}</>

  return (
    <SiteShell user={infos.data?.data.user ?? null} onLogout={logout}>
      {children}
    </SiteShell>
  )
}
