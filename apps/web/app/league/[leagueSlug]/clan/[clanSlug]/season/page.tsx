'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SeasonTable } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/** 지난시즌 `/league/{slug}/clan/{slug}/season`. */
export default function LeagueClanSeasonPage({
  params,
}: {
  params: Promise<{ leagueSlug: string; clanSlug: string }>
}) {
  const { leagueSlug, clanSlug } = use(params)
  const ready = useApiReady()

  const detail = useQuery({
    queryKey: ['league', leagueSlug, 'clan', clanSlug, 'show'],
    queryFn: () => apiGet('leagueClanShow', { params: { leagueSlug, clanSlug } }),
    enabled: ready,
  })

  const seasons = useQuery({
    queryKey: ['leagueclan', detail.data?.data.id, 'seasons'],
    queryFn: () =>
      apiGet('leagueClanSeasons', { params: { leagueClanId: detail.data!.data.id } }),
    enabled: ready && !!detail.data,
  })

  /* 헤더·탭은 레이아웃이 그린다 (`../layout.tsx`) */
  return (
    <div className="pc-container mt-6 pb-10">
      <SeasonTable
        seasons={seasons.data?.data}
        kind="clan"
        leagueName={detail.data?.data.league.name}
      />
    </div>
  )
}
