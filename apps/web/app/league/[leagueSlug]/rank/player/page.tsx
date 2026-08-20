'use client'

import { use } from 'react'
import type { PlayerRankRow } from '@sacloud/contract'
import { LoadMoreButton, PlayerRankTable, RankBox, RankHeader } from '@sacloud/ui'
import { useCursorQuery } from '@/lib/useCursorQuery'

/** 개인랭킹 `/league/{slug}/rank/player`. 부리그 탭은 없다 (원본 관측). */
export default function PlayerRankPage({ params }: { params: Promise<{ leagueSlug: string }> }) {
  const { leagueSlug } = use(params)

  const ranks = useCursorQuery<PlayerRankRow>(
    'leagueRankPlayers',
    ['ranks', 'players', leagueSlug],
    { params: { leagueId: leagueSlug } },
  )

  return (
    <div className="pc-container">
      <div className="p-6">
        <RankHeader
          title="플레이어 개인랭킹"
          notice="랭킹은 1시간마다 갱신되며, 배치고사가 종료된 플레이어만 표시됩니다."
        />
        <RankBox>
          <PlayerRankTable
            leagueSlug={leagueSlug}
            rows={ranks.items}
            loading={ranks.loading}
            error={ranks.error}
            onRetry={ranks.retry}
          />
        </RankBox>
        {ranks.hasMore ? (
          <LoadMoreButton onClick={ranks.loadMore} loading={ranks.loadingMore} />
        ) : null}
      </div>
    </div>
  )
}
