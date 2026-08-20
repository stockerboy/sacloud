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
      <LeagueSubNav leagueSlug={leagueSlug} leagueName={league.data?.data.name ?? ''} />
      <div className="pt-12">{children}</div>
    </>
  )
}
