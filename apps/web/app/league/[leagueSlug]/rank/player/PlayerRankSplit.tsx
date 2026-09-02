'use client'

/**
 * ⚠ **이 화면은 폐지됐다. 지금은 아무도 부르지 않는다** (2026-09-02 · D-260).
 *
 * > "이건 폐지 서플라이 형식을 따르기로 했다고 위에서 얘기함" — 사용자, 2026-09-02
 *
 * SPL(왼쪽) · IPL(오른쪽) 두 칸 분할 개인랭킹이다. 지금은 모든 리그가 `page.tsx` 의
 * 한 리그짜리 「개인순위」 화면을 쓴다.
 * **지우지 않았다** (`CLAUDE.md` 10-4) — 되돌리려면 `page.tsx` 가 이것을 부르면 된다.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { PlayerRankRow, RankWeapon } from '@sacloud/contract'
import { RANK_SPLIT_LEAGUES, leagueScreen } from '@sacloud/contract'
import {
  FormTop3,
  LoadMoreButton,
  PlayerRankTable,
  RankBox,
  RankHeader,
  RankSplit,
  RankSplitColumn,
  RankWeaponTabs,
} from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'
import { useCursorQuery } from '@/lib/useCursorQuery'

/**
 * 개인랭킹 — **SPL(왼쪽) · IPL(오른쪽) 한 화면** (2026-09-01 사용자 지시).
 *
 * > "개인랭킹도 SPL은 왼쪽 IPL은 오른쪽"
 *
 * ── 티어 구분선이 **없다**
 *   클랜랭킹과 달리 개인랭킹에는 티어 축이 없다. `PlayerRankRow` 에도
 *   `LeaguePlayer` 에도 `division` 이 없다 — 티어는 클랜에 붙는 값이다.
 *   **없는 구분을 지어내지 않는다** (`CLAUDE.md` 3장 7번). 두 칸 다 한 줄이다.
 *
 * ── 무기 탭은 **하나**다
 *   `통합 / 스나 / 라플` 은 화면 전체의 축이라 위에 한 벌만 둔다. 탭을 바꾸면
 *   두 칸이 같이 그 축으로 바뀐다 (D-169). 폼 TOP3 는 리그마다 다른 값이므로
 *   칸 안에 하나씩 둔다 — 없애면 데이터가 사라진다.
 *
 * ── 옛 화면
 *   리그 하나짜리 개인랭킹은 같은 파일(`page.tsx`)의 `SingleLeaguePlayerRank` 로
 *   그대로 남아 있고 `10mountain` 이 지금도 그걸 쓴다 (`CLAUDE.md` 10-4).
 */

/** 한 칸 — 리그 하나의 개인랭킹 */
function Column({ slug, name, weapon }: { slug: string; name: string; weapon: RankWeapon }) {
  const ready = useApiReady()
  const columns = leagueScreen(slug).playerColumns

  const ranks = useCursorQuery<PlayerRankRow>(
    'leagueRankPlayers',
    /* 무기 축이 쿼리 키에 들어가야 탭을 바꿀 때 캐시가 섞이지 않는다 */
    ['ranks', 'players', slug, weapon],
    { params: { leagueId: slug }, search: { weapon } },
  )

  const form = useQuery({
    queryKey: ['ranks', 'form', slug, weapon],
    enabled: ready,
    queryFn: () => apiGet('leagueRankForm', { params: { leagueId: slug }, search: { weapon } }),
  })

  return (
    <RankSplitColumn leagueName={name}>
      {/* 폼 TOP3 는 **래더 증감**만 보여 주는 칸이다. 래더가 없는 리그에서는 그리지 않는다 */}
      {columns.rating ? (
        <FormTop3
          leagueSlug={slug}
          form={form.data?.data}
          loading={form.isPending}
          error={form.isError}
        />
      ) : null}
      <RankBox>
        <PlayerRankTable
          leagueSlug={slug}
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
    </RankSplitColumn>
  )
}

export function PlayerRankSplit() {
  const [weapon, setWeapon] = useState<RankWeapon>('all')

  return (
    <div className="pc-container">
      {/* 좁은 화면에서는 좌우 안쪽 여백을 없앤다 — `.mobile-bleed`(표)가 화면 끝까지 가도록 */}
      <div className="py-[var(--section-gap)] max-md:py-8">
        <RankHeader
          title="플레이어 개인랭킹"
          notice="랭킹 숫자는 약 1시간마다 다시 계산됩니다. 한 경기부터 바로 반영됩니다."
        />
        <RankWeaponTabs current={weapon} onChange={setWeapon} />
        {/* 순서가 곧 좌우다 — 계약의 `RANK_SPLIT_LEAGUES` 가 SPL · IPL 순으로 들고 있다 */}
        <RankSplit>
          {RANK_SPLIT_LEAGUES.map((league) => (
            <Column key={league.slug} slug={league.slug} name={league.name} weapon={weapon} />
          ))}
        </RankSplit>
      </div>
    </div>
  )
}
