'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PlayerHeader, PlayerLeagueCards, ProfileTabs, Skeleton } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'
import { useRefresh } from '@/lib/useRefresh'

/**
 * 플레이어 기본정보 `/player/{playerId}`.
 * 원본 구성: 헤더(마크·닉네임·정보갱신·소속) → 탭(리그정보) → 참여중인 리그 카드.
 */
export default function PlayerPage({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = use(params)
  const ready = useApiReady()

  const player = useQuery({
    queryKey: ['player', playerId],
    queryFn: () => apiGet('playerShow', { params: { playerId } }),
    enabled: ready,
  })

  const leagues = useQuery({
    queryKey: ['player', playerId, 'leagues'],
    queryFn: () => apiGet('playerLeagues', { params: { playerId } }),
    enabled: ready,
  })

  const refresh = useRefresh('playerRenew', { playerId })

  if (!player.data) {
    return (
      <>
        <div className="mt-5 bg-player-header py-10">
          <div className="pc-container">
            <Skeleton className="h-[51px] w-96" />
          </div>
        </div>
      </>
    )
  }

  const data = player.data.data

  return (
    <>
      <PlayerHeader
        name={data.name}
        clan={data.clan}
        renewedAt={refresh.renewedAt ?? data.renewed_at}
        refreshState={refresh.state}
        onRefresh={refresh.run}
      />
      <ProfileTabs
        tabs={[{ label: '리그정보', href: `/player/${playerId}` }]}
        current={`/player/${playerId}`}
      />
      <div className="pc-container mt-6">
        <div className="mb-2 text-2xl">참여중인 리그</div>
        <PlayerLeagueCards entries={leagues.data?.data} loading={!leagues.data} />
      </div>
    </>
  )
}
