'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/**
 * 로그인이 필요한 화면 보호막.
 *
 * 미인증이면 `?returnUrl=` 을 붙여 로그인으로 보낸다 (원본 GNB 로그인 링크와 같은 규칙).
 * `requireLinked` 를 켜면 서든어택 계정 연동까지 확인한다 —
 * 원본은 **계정 연동을 마친 회원만 리그를 만들 수 있다**(관측).
 */
export function AuthGuard({
  children,
  requireLinked,
}: {
  children: React.ReactNode
  requireLinked?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname() ?? '/'
  const ready = useApiReady()

  const infos = useQuery({
    queryKey: ['infos'],
    queryFn: () => apiGet('infos'),
    enabled: ready,
  })

  const user = infos.data?.data.user ?? null
  const loaded = !!infos.data

  useEffect(() => {
    if (loaded && !user) {
      router.replace(`/auth/login?returnUrl=${encodeURIComponent(pathname)}`)
    }
  }, [loaded, user, pathname, router])

  if (!loaded) return <Skeleton className="mt-10 h-[300px] w-full" />
  if (!user) return null

  if (requireLinked && !user.player) {
    return (
      <div className="pc-container mt-10 rounded bg-card px-6 py-10 text-center shadow-card">
        <div className="text-xl">서든어택 계정 연동이 필요합니다.</div>
        <div className="mt-2 text-meta">
          리그를 만들려면 먼저 마이페이지에서 서든어택 계정을 연동해 주세요.
        </div>
        <a
          href="/me/link"
          className="mt-5 inline-flex h-10 items-center rounded bg-more px-4 text-white"
        >
          계정 연동하러 가기
        </a>
      </div>
    )
  }

  return <>{children}</>
}
