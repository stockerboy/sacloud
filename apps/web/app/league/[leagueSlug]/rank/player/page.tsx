'use client'

import { use, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { PlayerRankRow, RankWeapon } from '@sacloud/contract'
import { leagueScreen } from '@sacloud/contract'
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
 * 「개인순위」 `/league/{slug}/rank/player`. 부리그 탭은 없다.
 *
 * 기능 두 가지가 여기 붙는다 (D-169, 사용자 지시).
 *   ① 무기 탭 `통합 / 스나 / 라플` — 탭을 바꾸면 목록과 폼 TOP3 가 함께 그 축으로 바뀐다
 *   ② 폼 TOP3 — 랭킹 표 위, 탭 아래
 *
 * 탭 상태를 URL 이 아니라 컴포넌트 상태로 둔다 — 부리그 탭과 달리 라우트가 나뉘지 않는다.
 *
 * ── 2026-09-02 (D-260) — **두 칸 분할을 폐지했다**
 *   > (SPL 왼쪽 · IPL 오른쪽 분할에 대해) "이건 폐지 서플라이 형식을 따르기로 했다고 위에서 얘기함"
 *
 *   어느 리그로 들어오든 **그 리그 하나만** 보여 준다. 분할 화면(`PlayerRankSplit.tsx`)은
 *   **지우지 않았다** (`CLAUDE.md` 10-4) — 되돌리려면 그것을 다시 부르면 된다.
 *   화면 이름도 `플레이어 개인랭킹` → `개인순위` 로 바꿨다. 사용자가 고른 말이다.
 */
export default function PlayerRankPage({ params }: { params: Promise<{ leagueSlug: string }> }) {
  const { leagueSlug } = use(params)
  return <SingleLeaguePlayerRank leagueSlug={leagueSlug} />
}

/**
 * 리그 하나짜리 개인순위 — **모든 리그가 이것을 쓴다** (2026-09-02 · D-260).
 *
 * 예전에는 `10mountain` 만 이 화면이었고 SPL·IPL 은 두 칸 분할이었다. 분할이 폐지되면서
 * 셋 다 같은 화면으로 돌아왔다. **리그별 분기는 없다** (D-204) — 칸 구성만
 * `leagueScreen()` 이 정한다.
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
          title="개인순위"
          notice="랭킹 숫자는 약 1시간마다 다시 계산됩니다. 한 경기부터 바로 반영됩니다."
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
