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
  /** 한 번이라도 받아왔는지 — 최초 로딩 판정용 */
  const hasData = !!infos.data
  /**
   * **되돌려보낼지는 갱신이 끝난 뒤에 판정한다.**
   *
   * `invalidateQueries` 직후에도 이전 응답이 잠시 남아 있다. 그 값으로 판정하면
   * 방금 로그인한 사용자를 비로그인으로 보고 로그인 화면으로 되돌린다.
   *
   * 반대로 **갱신 중이라고 children을 내리면 안 된다.** 내렸다가 다시 올리면
   * 하위 화면이 새로 마운트되면서 입력값이나 "저장했습니다" 같은 상태가 사라진다
   * (실제로 그렇게 만들었다가 되돌렸다). 판정만 미루고 화면은 계속 그린다.
   */
  const settled = hasData && !infos.isFetching

  useEffect(() => {
    if (settled && !user) {
      router.replace(`/auth/login?returnUrl=${encodeURIComponent(pathname)}`)
    }
  }, [settled, user, pathname, router])

  if (!hasData) return <Skeleton className="mt-10 h-[300px] w-full" />
  // 사용자가 없으면 판정이 끝났을 때만 비우고, 갱신 중이면 잠깐 기다린다.
  // (로그인 상태에서는 이 분기를 타지 않으므로 children이 다시 마운트되지 않는다)
  if (!user) return settled ? null : <Skeleton className="mt-10 h-[300px] w-full" />

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
