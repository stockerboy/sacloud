'use client'

import { use } from 'react'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { LeagueHeader, LeagueHomeTabs, Skeleton } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/**
 * 리그홈 공통 — 리그 헤더 + 리그정보/리그소개 탭.
 * 원본은 `mt-10 pc-container` 안에 헤더(검보라 배경) → 탭 → 내용 순으로 놓는다.
 */
export default function LeagueHomeLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ leagueSlug: string }>
}) {
  const { leagueSlug } = use(params)
  const pathname = usePathname() ?? ''
  const ready = useApiReady()
  const current = pathname.endsWith('/desc') ? 'desc' : 'info'

  const league = useQuery({
    queryKey: ['league', leagueSlug],
    queryFn: () => apiGet('leagueShow', { params: { leagueSlug } }),
    enabled: ready,
  })

  return (
    <div className="pc-container mt-10">
      {league.data ? (
        <LeagueHeader league={league.data.data} />
      ) : (
        <div className="bg-league-header px-10 py-10">
          <Skeleton className="h-[35px] w-96" />
        </div>
      )}
      {/*
        `Beta Season` 안내 박스는 **원본에 없는 블록**이라 뺐다 (UI_PARITY_AUDIT 2-2).
        원본은 히어로 배너 바로 다음이 탭이다. `BetaNotice` 컴포넌트와 문구 상수는
        관리자 화면 등에서 쓸 수 있으니 남겨 두고, 사용자 화면에서만 그리지 않는다.
      */}
      <LeagueHomeTabs leagueSlug={leagueSlug} current={current} />
      <div>{children}</div>
    </div>
  )
}
