'use client'

/**
 * ⚠ **옛 화면이다. 지금은 아무도 부르지 않는다** (2026-09-02 · D-260).
 *
 * 부리그(1부/2부) 탭이 있던 클랜랭킹 화면이다. 사용자가 *"1부2부 분류 체계 아예 없애기,
 * 1,2부라는 개념x"* 라고 해서 화면에서 내렸다. **지우지 않았다** (`CLAUDE.md` 10-4) —
 * 되돌리려면 같은 폴더의 `page.tsx` 가 redirect 대신 이것을 그리면 된다.
 *
 * 데이터(`LeagueClan.division` · 경기 당시 division 스냅샷)는 **그대로 살아 있다.**
 * 없앤 것은 사람에게 보이는 분류지 래더 계산의 입력이 아니다 (`CLAUDE.md` 3-B 4번).
 */

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ClanRankRow } from '@sacloud/contract'
import { leagueScreen } from '@sacloud/contract'
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
export function ClanRankDivisionLegacy({
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
