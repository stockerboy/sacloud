'use client'

import { use } from 'react'
import type { PlayerRankRow } from '@sacloud/contract'
import { LoadMoreButton, PlayerRankTable, ProfileTabs, RankBox } from '@sacloud/ui'
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

  const base = `/league/${leagueSlug}/clan/${clanSlug}`
  const tabs = [
    { label: '기본정보', href: `/clan/${clanSlug}` },
    { label: '기록실', href: base },
    { label: '지난시즌', href: `${base}/season` },
  ]

  return (
    <>
      <ProfileTabs tabs={tabs} current={base} />
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
    </>
  )
}
