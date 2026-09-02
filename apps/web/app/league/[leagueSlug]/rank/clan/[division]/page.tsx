'use client'

import { use } from 'react'
import { redirect } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import type { ClanRankRow } from '@sacloud/contract'
import { leagueScreen, showsDivision } from '@sacloud/contract'
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

  /* 부리그를 화면에 내지 않는 리그(지시 #9 · D-265 ③)로 이 주소를 직접 치고 들어오면
     **합친 화면(`/rank/clan`)으로 보낸다.** 그 리그의 클랜랭킹은 그것 하나뿐이고,
     한 부리그만 보여 주는 이 화면은 감춘 개념을 다시 꺼내게 된다. 라우트는 지우지 않았다 —
     스위치를 끄면 이 화면이 그대로 돌아온다 (`CLAUDE.md` 10-4). 죽지 않고 안내한다 */
  if (!showsDivision(leagueSlug)) redirect(`/league/${leagueSlug}/rank/clan`)

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
          notice="랭킹 숫자는 약 1시간마다 다시 계산됩니다. 한 경기부터 바로 반영됩니다."
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
            columns={leagueScreen(leagueSlug).clanColumns}
          />
        </RankBox>
        {ranks.hasMore ? (
          <LoadMoreButton onClick={ranks.loadMore} loading={ranks.loadingMore} />
        ) : null}
      </div>
    </div>
  )
}
