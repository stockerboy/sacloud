'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ClanRankRow } from '@sacloud/contract'
import { ClanRankTable, DivisionTabs, LoadMoreButton, RankBox, RankHeader } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'
import { useCursorQuery } from '@/lib/useCursorQuery'

/**
 * 클랜랭킹 `/league/{slug}/rank/clan/{division}`.
 *
 화면 순서: 제목+안내 → 부리그 탭 → 표 → 더 불러오기.
 * 갱신 주기(1시간)와 "배치고사 종료 대상만 표시"는 그대로다.
 */
export default function ClanRankPage({
  params,
}: {
  params: Promise<{ leagueSlug: string; division: string }>
}) {
  const { leagueSlug, division } = use(params)
  const ready = useApiReady()
  const current = Number(division) || 1

  const league = useQuery({
    queryKey: ['league', leagueSlug],
    queryFn: () => apiGet('leagueShow', { params: { leagueSlug } }),
    enabled: ready,
  })

  const ranks = useCursorQuery<ClanRankRow>(
    'leagueRankClans',
    ['ranks', 'clans', leagueSlug, current],
    { params: { leagueId: leagueSlug }, search: { division: current } },
  )

  return (
    <div className="pc-container">
      {/* 좁은 화면에서는 좌우 안쪽 여백을 없앤다.
          `.mobile-bleed`(표)는 `.pc-container` 의 0.75rem 만 되빼도록 만들어져 있어서,
          여기 좌우 여백이 남아 있으면 표가 화면 끝까지 가지 못한다.
          위아래 여백은 `--section-gap` 을 쓴다 — 화면을 꽉 채우지 않는다. */}
      <div className="py-[var(--section-gap)] max-md:py-8">
        <RankHeader
          title="클랜랭킹"
          notice="랭킹은 1시간마다 갱신되며, 배치고사가 종료된 클랜만 표시됩니다."
        />
        {/* 무소속리그는 같은 탭을 `1티어 … 5티어` 로 표기한다 (D-165). 값은 division 그대로다 */}
        <DivisionTabs
          leagueSlug={leagueSlug}
          divisionCount={league.data?.data.division_count ?? 1}
          current={current}
          leagueCategory={league.data?.data.category}
        />
        <RankBox>
          <ClanRankTable
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
