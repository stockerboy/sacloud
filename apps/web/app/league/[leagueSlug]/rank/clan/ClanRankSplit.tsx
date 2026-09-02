'use client'

import { useQuery } from '@tanstack/react-query'
import type { ClanRankRow } from '@sacloud/contract'
import { RANK_SPLIT_LEAGUES, leagueScreen, showsDivision } from '@sacloud/contract'
import {
  ClanRankTable,
  LoadMoreButton,
  RankBox,
  RankHeader,
  RankSplit,
  RankSplitColumn,
} from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'
import { useCursorQuery } from '@/lib/useCursorQuery'

/**
 * 클랜랭킹 — **SPL(왼쪽) · IPL(오른쪽) 한 화면** (2026-09-01 사용자 지시).
 *
 * > "클랜랭킹 그냥 SPL이랑 IPL 한공간에 둬 SPL이 왼쪽 IPL이 오른쪽
 * >  SPL은 1,2부 나누지 말고 그냥 순위대로 배열하고 IPL도 세로로 일열 배열하는데
 * >  우리가 정해놨던 티어별로 선을 그어서 나눠줘"
 *
 * ── 무엇이 바뀌었나
 *   예전에는 리그마다 화면이 따로 있고 위에 `1티어 … 6티어` 탭이 있어서
 *   **한 번에 한 티어만** 보였다. 이제 한 화면에 두 리그가 전부 들어간다.
 *
 * ── 데이터를 없애지 않았다
 *   승률 · N승N패 · 래더 · 클랜마크 · 알 · 배치고사 제외 규칙까지 예전 표 그대로다.
 *   바뀐 것은 **어떤 행이 어떤 순서로 오느냐** 하나다 (`division=0`).
 *
 * ── 옛 화면
 *   부리그 탭 화면은 `/league/{slug}/rank/clan/{division}` 에 그대로 살아 있다
 *   (`CLAUDE.md` 10-4). 지우지 않았다.
 *
 * ── 더 불러오기
 *   두 칸이 **각자** 커서를 들고 각자 더 불러온다. 20건 단위는 그대로다.
 */

/** 한 칸 — 리그 하나의 클랜랭킹 전체 (부리그를 나누지 않는다) */
function Column({ slug, name }: { slug: string; name: string }) {
  const ready = useApiReady()

  const league = useQuery({
    queryKey: ['league', slug],
    queryFn: () => apiGet('leagueShow', { params: { leagueSlug: slug } }),
    enabled: ready,
  })

  /* `division: 0` = 부리그를 나누지 않는다.
     공식리그는 부리그를 섞어 래더 순, 무소속리그는 티어 오름차순을 유지한다
     (`apps/web/lib/server/queries/leagues.ts` 의 `getClanRanks` 주석). */
  const ranks = useCursorQuery<ClanRankRow>(
    'leagueRankClans',
    ['ranks', 'clans', slug, 'all'],
    { params: { leagueId: slug }, search: { division: 0 } },
  )

  const category = league.data?.data.category
  const independent = category === 'independent'
  /* 부리그를 화면에 내지 않는 리그(지시 #9 · D-265 ③)는 「티어별」 메모도 없다.
     경계선은 표(`ClanRankTable`)가 같은 규칙으로 스스로 뺀다 */
  const divisionShown = showsDivision(slug)

  return (
    <RankSplitColumn
      leagueName={name}
      /* 리그를 아직 못 받았으면 **아무 말도 하지 않는다.** 기본값을 써 두면
         IPL 자리에 잠깐 「부리그 통합 순위」가 떴다가 「티어별」로 바뀐다 —
         한 번이라도 틀린 글자를 보여 주느니 늦게 나오는 편이 낫다 */
      note={
        category === undefined || !divisionShown
          ? undefined
          : independent
            ? '티어별'
            : '부리그 통합 순위'
      }
    >
      <RankBox>
        <ClanRankTable
          leagueSlug={slug}
          rows={ranks.items}
          loading={ranks.loading}
          error={ranks.error}
          onRetry={ranks.retry}
          /* 티어를 유지하는 리그에서만 경계선을 긋는다.
             SPL 은 «1,2부 나누지 말고» 라는 지시라 선을 긋지 않는다 */
          groupByDivision={independent}
          leagueCategory={category}
          /* 어떤 칸을 보여 줄지는 화면이 아니라 `leagueScreen()` 한 곳이 정한다 (2026-09-01) */
          columns={leagueScreen(slug).clanColumns}
        />
      </RankBox>
      {ranks.hasMore ? (
        <LoadMoreButton onClick={ranks.loadMore} loading={ranks.loadingMore} />
      ) : null}
    </RankSplitColumn>
  )
}

export function ClanRankSplit() {
  return (
    <div className="pc-container">
      {/* 좁은 화면에서는 좌우 안쪽 여백을 없앤다 — `.mobile-bleed`(표)가 화면 끝까지 가도록 */}
      <div className="py-[var(--section-gap)] max-md:py-8">
        <RankHeader
          title="클랜랭킹"
          notice="랭킹 숫자는 약 1시간마다 다시 계산됩니다. 한 경기부터 바로 반영됩니다."
        />
        {/* 순서가 곧 좌우다 — 계약의 `RANK_SPLIT_LEAGUES` 가 SPL · IPL 순으로 들고 있다 */}
        <RankSplit>
          {RANK_SPLIT_LEAGUES.map((league) => (
            <Column key={league.slug} slug={league.slug} name={league.name} />
          ))}
        </RankSplit>
      </div>
    </div>
  )
}
