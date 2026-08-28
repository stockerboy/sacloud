'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LeagueSubNav } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/**
 * 리그 화면 공통 레이아웃.
 *
 * 원본은 전역 GNB(4.5rem) 아래에 리그 서브내비(3rem)를 하나 더 고정하고,
 * 본문을 그만큼(`pt-12`) 아래로 민다.
 *
 * 모바일에서는 서브내비가 **두 줄**(리그명 줄 + 탭 줄)이라 그만큼 더 민다 — `pt-24`.
 */
export default function LeagueLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ leagueSlug: string }>
}) {
  const { leagueSlug } = use(params)
  const ready = useApiReady()

  const league = useQuery({
    queryKey: ['league', leagueSlug],
    queryFn: () => apiGet('leagueShow', { params: { leagueSlug } }),
    enabled: ready,
  })

  return (
    <>
      {/* 시즌 배지는 넘기지 않는다 — 원본 서브내비에 그런 표시가 없다 (UI_PARITY_AUDIT 2-2) */}
      <LeagueSubNav leagueSlug={leagueSlug} leagueName={league.data?.data.name ?? ''} />
      <div className="pt-24 md:pt-12">{children}</div>
    </>
  )
}
