'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { LeagueClan } from '@sacloud/contract'
import { LeagueInfoPanel, LoadMoreButton, Skeleton } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'
import { useCursorQuery } from '@/lib/useCursorQuery'

/** 리그정보 — 관리자 / 리그맵 / 대전인원 / 참여중인 클랜. */
export default function LeagueInfoPage({
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

  const clans = useCursorQuery<LeagueClan>('leagueClans', ['league', leagueSlug, 'clans'], {
    params: { leagueSlug },
  })

  if (!league.data) {
    return (
      <div className="border-b border-line-soft px-8 py-6 max-md:px-4">
        <Skeleton className="h-[22px] w-full" />
      </div>
    )
  }

  return (
    <>
      <LeagueInfoPanel
        league={league.data.data}
        clans={clans.items}
        clansLoading={clans.loading}
      />
      {clans.hasMore ? (
        <LoadMoreButton onClick={clans.loadMore} loading={clans.loadingMore} />
      ) : null}
    </>
  )
}
