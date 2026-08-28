'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SeasonTable } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/** 지난시즌 `/league/{slug}/player/{id}/season`. */
export default function LeaguePlayerSeasonPage({
  params,
}: {
  params: Promise<{ leagueSlug: string; playerId: string }>
}) {
  const { leagueSlug, playerId } = use(params)
  const ready = useApiReady()

  const detail = useQuery({
    queryKey: ['league', leagueSlug, 'player', playerId],
    queryFn: () => apiGet('leaguePlayerShow', { params: { leagueSlug, playerId } }),
    enabled: ready,
  })

  const league = useQuery({
    queryKey: ['league', leagueSlug],
    queryFn: () => apiGet('leagueShow', { params: { leagueSlug } }),
    enabled: ready,
  })

  const seasons = useQuery({
    queryKey: ['leagueplayer', detail.data?.data.id, 'seasons'],
    queryFn: () =>
      apiGet('leaguePlayerSeasons', { params: { leaguePlayerId: detail.data!.data.id } }),
    enabled: ready && !!detail.data,
  })

  /* 헤더·탭은 레이아웃이 그린다 (`../layout.tsx`) */
  return (
    <div className="pc-container mt-6 pb-10">
      <SeasonTable
        seasons={seasons.data?.data}
        kind="player"
        hidesCumulativeKd={league.data?.data.hides_cumulative_kd ?? false}
      />
    </div>
  )
}
