'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PlayerIdentity, PlayerLeagueList, ProfileSkeleton } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'
import { useRefresh } from '@/lib/useRefresh'

/**
 * 플레이어 프로필 `/player/{playerId}`.
 *
 * 화면 순서 — 신원 띠(마크 · 닉네임 · 소속 · 최근갱신 · 정보갱신) → 참여중인 리그.
 *
 * 하던 일은 그대로다. 부르는 API 도(`playerShow` / `playerLeagues` / `playerRenew`),
 * 리그 카드가 가는 곳도(`/league/{slug}/player/{playerId}`) 바뀌지 않았다.
 *
 * 탭 줄(`리그정보` 하나짜리)은 없앴다. 항목이 하나뿐이라 **지금 보고 있는 화면으로**
 * 가는 링크였고, 화면 위쪽을 한 줄 잡아먹기만 했다. 탭이 둘 이상인 클랜 쪽은 그대로 둔다.
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
      <div className="pc-container pt-[40px]">
        <ProfileSkeleton rows={1} height={120} />
      </div>
    )
  }

  const data = player.data.data

  return (
    <>
      <PlayerIdentity
        name={data.name}
        clan={data.clan}
        renewedAt={refresh.renewedAt ?? data.renewed_at}
        refreshState={refresh.state}
        onRefresh={refresh.run}
      />
      <div className="pc-container pb-[40px]">
        <PlayerLeagueList
          playerId={playerId}
          entries={leagues.data?.data}
          loading={!leagues.data}
        />
      </div>
    </>
  )
}
