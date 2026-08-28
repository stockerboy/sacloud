'use client'

import { use } from 'react'
import type { PlayerRankRow } from '@sacloud/contract'
import { LoadMoreButton, PlayerRankTable, RankBox } from '@sacloud/ui'
import { useCursorQuery } from '@/lib/useCursorQuery'

/** 리그 참여 클랜원 `/league/{slug}/clan/{slug}/player`. */
export default function LeagueClanPlayersPage({
  params,
}: {
  params: Promise<{ leagueSlug: string; clanSlug: string }>
}) {
  const { leagueSlug, clanSlug } = use(params)

  const members = useCursorQuery<PlayerRankRow>(
    'leagueClanPlayers',
    ['league', leagueSlug, 'clan', clanSlug, 'players'],
    { params: { leagueSlug, clanSlug } },
  )

  /* 헤더·탭은 레이아웃이 그린다 (`../layout.tsx`) */
  return (
    <div className="pc-container mt-6 pb-10">
      <div className="mb-2 text-2xl">클랜원</div>
      <RankBox>
        <PlayerRankTable
          leagueSlug={leagueSlug}
          rows={members.items}
          loading={members.loading}
          error={members.error}
          onRetry={members.retry}
        />
      </RankBox>
      {members.hasMore ? (
        <LoadMoreButton onClick={members.loadMore} loading={members.loadingMore} />
      ) : null}
    </div>
  )
}
