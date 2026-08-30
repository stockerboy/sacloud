'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LeagueDescription, Skeleton } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/** 리그소개 — 관리자가 저장한 HTML. 렌더 전 새니타이즈한다. */
export default function LeagueDescPage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>
}) {
  const { leagueSlug } = use(params)
  const ready = useApiReady()

  const league = useQuery({
    queryKey: ['league', leagueSlug],
    queryFn: () => apiGet('leagueShow', { params: { leagueSlug } }),
    enabled: ready,
  })

  if (!league.data) {
    return (
      <div className="border-b border-line-soft px-8 py-8 max-md:px-4">
        <Skeleton className="h-[22px] w-full" />
      </div>
    )
  }

  return <LeagueDescription html={league.data.data.description} />
}
