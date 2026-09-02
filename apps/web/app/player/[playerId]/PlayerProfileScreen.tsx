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

  /*
   * ── ★요청 둘을 하나로★ (2026-09-03 · O-034)
   *
   *   전에는 `playerShow` 와 `playerLeagues` 를 따로 불렀다. 둘 다 같은 사람 것이고
   *   항상 같이 쓰인다. 공개일에 천 명이 각자 다른 닉을 치면 **서로 다른 캐시 키가
   *   수천 개**이고 전부 첫 방문이라 전부 DB 로 간다 — 그때 요청이 둘이면 **접속 자리를
   *   두 번 잡는다.** 자리는 5개다.
   *
   *   ⚠ **화면 값은 하나도 안 줄었다.** 합친 것이지 뺀 것이 아니다.
   *   ⚠ 옛 두 경로는 그대로 산다 — 되돌리려면 위 옛 코드를 그대로 쓰면 된다
   *     (`CLAUDE.md` 10-4).
   */
  const profile = useQuery({
    queryKey: ['player', playerId, 'profile'],
    queryFn: () => apiGet('playerProfile', { params: { playerId } }),
    enabled: ready,
  })

  const refresh = useRefresh('playerRenew', { playerId })

  if (!profile.data) {
    return (
      <div className="pc-container pt-[40px]">
        <ProfileSkeleton rows={1} height={120} />
      </div>
    )
  }

  const data = profile.data.data.player

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
          entries={profile.data.data.leagues}
          loading={false}
        />
      </div>
    </>
  )
}
