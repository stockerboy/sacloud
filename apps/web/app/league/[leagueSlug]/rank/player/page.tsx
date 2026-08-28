'use client'

import { use, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { PlayerRankRow, RankWeapon } from '@sacloud/contract'
import {
  FormTop3,
  LoadMoreButton,
  PlayerRankTable,
  RankBox,
  RankHeader,
  RankWeaponTabs,
} from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useCursorQuery } from '@/lib/useCursorQuery'
import { useApiReady } from '@/app/providers'

/**
 * 개인랭킹 `/league/{slug}/rank/player`. 부리그 탭은 없다 (원본 관측).
 *
 * 원본에 없는 우리 신규 기능 두 가지가 여기 붙는다 (D-169, 사용자 지시).
 *   ① 무기 탭 `통합 / 스나 / 라플` — 탭을 바꾸면 목록과 폼 TOP3 가 함께 그 축으로 바뀐다
 *   ② 폼 TOP3 — 랭킹 표 위, 탭 아래
 *
 * 탭 상태를 URL 이 아니라 컴포넌트 상태로 두는 이유:
 * 원본의 부리그 탭은 라우트가 나뉘어 있지만 이 탭은 **원본에 없는 축**이라
 * 대응하는 원본 URL 이 없다. 없는 URL 규칙을 지어내지 않는다.
 */
export default function PlayerRankPage({ params }: { params: Promise<{ leagueSlug: string }> }) {
  const { leagueSlug } = use(params)
  const [weapon, setWeapon] = useState<RankWeapon>('all')
  const ready = useApiReady()

  const ranks = useCursorQuery<PlayerRankRow>(
    'leagueRankPlayers',
    /* 무기 축이 쿼리 키에 들어가야 탭을 바꿀 때 캐시가 섞이지 않는다 */
    ['ranks', 'players', leagueSlug, weapon],
    { params: { leagueId: leagueSlug }, search: { weapon } },
  )

  const form = useQuery({
    queryKey: ['ranks', 'form', leagueSlug, weapon],
    enabled: ready,
    queryFn: () =>
      apiGet('leagueRankForm', { params: { leagueId: leagueSlug }, search: { weapon } }),
  })

  return (
    <div className="pc-container">
      {/* 좁은 화면에서는 좌우 안쪽 여백을 없앤다 — `.mobile-bleed`(표)가 화면 끝까지 가도록.
          자세한 근거는 클랜랭킹 페이지 주석 참조. 위아래 여백은 그대로 둔다. */}
      <div className="p-6 max-md:px-0">
        <RankHeader
          title="플레이어 개인랭킹"
          notice="랭킹은 1시간마다 갱신되며, 배치고사가 종료된 플레이어만 표시됩니다."
        />
        <RankWeaponTabs current={weapon} onChange={setWeapon} />
        <FormTop3
          leagueSlug={leagueSlug}
          form={form.data?.data}
          loading={form.isPending}
          error={form.isError}
        />
        <RankBox>
          <PlayerRankTable
            leagueSlug={leagueSlug}
            weapon={weapon}
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
