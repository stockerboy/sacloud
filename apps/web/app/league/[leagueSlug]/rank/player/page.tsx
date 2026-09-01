'use client'

import { use, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { PlayerRankRow, RankWeapon } from '@sacloud/contract'
import { isRankSplitLeague, leagueScreen } from '@sacloud/contract'
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
import { PlayerRankSplit } from './PlayerRankSplit'

/**
 * 개인랭킹 `/league/{slug}/rank/player`. 부리그 탭은 없다.
 *
 * 기능 두 가지가 여기 붙는다 (D-169, 사용자 지시).
 *   ① 무기 탭 `통합 / 스나 / 라플` — 탭을 바꾸면 목록과 폼 TOP3 가 함께 그 축으로 바뀐다
 *   ② 폼 TOP3 — 랭킹 표 위, 탭 아래
 *
 * 탭 상태를 URL 이 아니라 컴포넌트 상태로 둔다 — 부리그 탭과 달리 라우트가 나뉘지 않는다.
 */
export default function PlayerRankPage({ params }: { params: Promise<{ leagueSlug: string }> }) {
  const { leagueSlug } = use(params)

  /* SPL · IPL 은 **한 화면 두 칸**이다 (2026-09-01 사용자 지시 — "개인랭킹도 SPL은 왼쪽 IPL은 오른쪽").
     어느 쪽으로 들어와도 같은 화면이다. 라우트는 그대로 살아 있다.
     `10mountain` 은 아래의 한 리그짜리 화면을 그대로 쓴다 (D-245). */
  if (isRankSplitLeague(leagueSlug)) return <PlayerRankSplit />

  return <SingleLeaguePlayerRank leagueSlug={leagueSlug} />
}

/**
 * 리그 하나짜리 개인랭킹 — **옛 화면 그대로다** (`CLAUDE.md` 10-4).
 *
 * 지금은 `10mountain` 만 쓴다. 지우지 않았고, 되돌리려면 위 분기 한 줄만 빼면 된다.
 */
function SingleLeaguePlayerRank({ leagueSlug }: { leagueSlug: string }) {
  const [weapon, setWeapon] = useState<RankWeapon>('all')
  /* 보여 줄 칸은 `leagueScreen()` 이 정한다 —
     `10🏔`(`sanply`)는 비공식이라 래더도 순위도 없다 (2026-09-01 사용자 지시) */
  const columns = leagueScreen(leagueSlug).playerColumns
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
          자세한 근거는 클랜랭킹 페이지 주석 참조. */}
      <div className="py-[var(--section-gap)] max-md:py-8">
        <RankHeader
          title="플레이어 개인랭킹"
          notice="랭킹은 1시간마다 갱신되며, 한 경기부터 바로 반영됩니다."
        />
        <RankWeaponTabs current={weapon} onChange={setWeapon} />
        {/* 폼 TOP3 는 **래더 증감**만 보여 주는 칸이다. 래더가 없는 리그에서는 그리지 않는다 */}
        {columns.rating ? (
          <FormTop3
            leagueSlug={leagueSlug}
            form={form.data?.data}
            loading={form.isPending}
            error={form.isError}
          />
        ) : null}
        <RankBox>
          <PlayerRankTable
            leagueSlug={leagueSlug}
            weapon={weapon}
            rows={ranks.items}
            loading={ranks.loading}
            error={ranks.error}
            onRetry={ranks.retry}
            columns={columns}
          />
        </RankBox>
        {ranks.hasMore ? (
          <LoadMoreButton onClick={ranks.loadMore} loading={ranks.loadingMore} />
        ) : null}
      </div>
    </div>
  )
}
