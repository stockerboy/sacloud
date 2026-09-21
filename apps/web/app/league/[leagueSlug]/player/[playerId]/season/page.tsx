'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SeasonTable } from '@sacloud/ui'
import { leagueScreen } from '@sacloud/contract'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/* ★갱신 주기 60초★ (2026-09-21) — 까닭은 `app/player/[playerId]/page.tsx` 에 한 번만 적었다 */
export const revalidate = 60


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
        /* 카드 왼쪽 위 리그 이름은 원본 카드에 있는 값이다 (관측 2026-08-28) */
        leagueName={league.data?.data.name}
        /* ★두 곳 중 하나만 «가린다» 해도 가린다★ (2026-09-14).
           `hides_cumulative_kd` 는 DB 리그 깃발(D-107)이고,
           `playerColumns.kd` 는 사장님이 그날 정하신 리그 규칙이다 */
        hidesCumulativeKd={(league.data?.data.hides_cumulative_kd ?? false) || !leagueScreen(leagueSlug).playerColumns.kd}
      />
    </div>
  )
}
