'use client'

import { use } from 'react'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { BetaNotice, LeagueHeader, LeagueHomeTabs, Skeleton } from '@sacloud/ui'
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
      {/* 베타일 때만 한 번 뜬다. 다른 리그 화면에는 서브내비 배지만 남는다 */}
      <BetaNotice seasonType={league.data?.data.season_type} />
      <LeagueHomeTabs leagueSlug={leagueSlug} current={current} />
      <div>{children}</div>
    </div>
  )
}
