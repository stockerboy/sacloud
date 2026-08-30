'use client'

import { use, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { MatchDetail, MatchListItem } from '@sacloud/contract'
import {
  LoadMoreButton,
  MatchCard,
  PlaystyleBars,
  PlayerStatSidebar,
  RecentMatchSummary,
  Skeleton,
  TeammateTable,
  TraitHexagon,
} from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'
import { useCursorQuery } from '@/lib/useCursorQuery'

/**
 * 개인 기록실 `/league/{slug}/player/{id}`.
 *
 * 원본 구성: 최근매치 요약 → 매치 카드(아코디언) 목록 + 우측 사이드(상세정보·최근 같이한 플레이어).
 * 탭: 기본정보(전역 `/player/{id}`) / 기록실(현재) / 지난시즌.
 */
export default function LeaguePlayerRecordPage({
  params,
}: {
  params: Promise<{ leagueSlug: string; playerId: string }>
}) {
  const { leagueSlug, playerId } = use(params)
  const ready = useApiReady()
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState<Record<string, MatchDetail>>({})

  const detail = useQuery({
    queryKey: ['league', leagueSlug, 'player', playerId],
    queryFn: () => apiGet('leaguePlayerShow', { params: { leagueSlug, playerId } }),
    enabled: ready,
  })

  const matches = useCursorQuery<MatchListItem>(
    'leaguePlayerMatches',
    ['league', leagueSlug, 'player', playerId, 'matches'],
    { params: { leagueId: leagueSlug, playerId } },
  )

  /**
   * 매치 상세 지연 로드.
   * `league_clan_id`는 "어느 클랜 기준으로 보는지"를 알려준다 — 상대 클랜 소속 플레이어의
   * 딜량·헤드샷을 `알수없음`으로 지우는 데 쓰인다 (docs/DECISIONS.md D-004).
   * 이 값은 매치 자신이 들고 있다.
   */
  const loadDetail = (match: MatchListItem) => {
    const matchId = match.id
    if (expanded[matchId]) return
    const leagueClanId = match.league_clan.league_clan_id
    void queryClient
      .fetchQuery({
        queryKey: ['match', leagueSlug, matchId, leagueClanId],
        queryFn: () =>
          apiGet('matchShow', {
            params: { leagueId: leagueSlug, matchId },
            search: { league_clan_id: leagueClanId },
          }),
      })
      .then((response) => setExpanded((prev) => ({ ...prev, [matchId]: response.data })))
  }

  /* 로딩과 "없음"을 구분한다.
     예전에는 둘 다 스켈레톤이라, 조회가 404를 내면 화면이 **영원히 로딩 중**으로 보였다.
     실제로 이 리그 선수 전원이 그 상태였다 (D-117). */
  if (detail.isPending) {
    return (
      <div className="pc-container mt-10">
        <Skeleton className="h-[200px] w-full" />
      </div>
    )
  }

  if (!detail.data) {
    return (
      <div className="pc-container mt-10">
        <div className="border border-divider bg-row px-6 py-10 text-center text-meta">
          기록을 찾을 수 없습니다.
        </div>
      </div>
    )
  }

  const data = detail.data.data

  return (
    <>
      {/*
        개인 기록 카드 배치 (`docs/PLAYER_TRAITS_SPEC.md` 9절 · D-185).

        ```
        ┌ 육각형 ─────────────────┬ 상세정보 ┐
        ├ 플레이스타일 바 2줄 ──────┴─────────┤
        ├ 최근매치 요약 + **오늘 기록** ──────┤
        └ 경기 상세기록 (기존 그대로) ────────┘
        ```

        `상세정보` 는 **옮긴 것**이지 새로 만든 것이 아니다 — 사이드에 있던 그 패널
        그대로다(사양 9절 "자리만 육각형 옆으로 옮긴다"). 그래서 오른쪽 칸에는
        `최근 같이한 플레이어` 만 남는다.

        **오늘 기록은 따로 카드를 두지 않는다** (D-186). `최근매치` 카드 안에서
        예전 `최근 폼` 이 있던 자리를 그대로 이어받는다 — 사용자가 그 자리를 지목했다.

        육각형·바·오늘 줄은 **원본에 없는 화면**이다. 값이 없는 축을 0으로 그리지 않고
        `측정중` 으로 둔다 (D-106).
      */}
      <div className="pc-container mt-2 flex max-md:flex-col">
        <div className="w-3/4 max-md:w-full max-md:min-w-0">
          {data.traits === null ? null : <TraitHexagon traits={data.traits} />}
        </div>
        <div className="ml-2 w-1/4 max-md:ml-0 max-md:mt-2 max-md:w-full">
          <PlayerStatSidebar
            rating={data.rating}
            placement={data.placement}
            /* 선수가 직접 설정하는 값이다 (D-161). `null` 이면 사이드바가 줄을 그리지 않는다 */
            position={data.player.position}
            win={data.win}
            lose={data.lose}
            winRate={data.win_rate}
            kill={data.kill}
            death={data.death}
            kdRate={data.kd_rate}
            killPerMatch={data.kill_per_match}
            mvpCount={data.mvp_count}
            rank={data.rank}
            rankCount={data.rank_count}
            clan={data.clan ? { ...data.clan, isOfficialClan: data.clan.is_official_clan } : null}
          />
        </div>
      </div>
      <div className="pc-container">
        {data.playstyle === null ? null : <PlaystyleBars playstyle={data.playstyle} />}
      </div>

      {/*
        모바일 — 3:1 두 칸을 위아래로 쌓는다.
        예전에는 `order` 로 `상세정보` 를 이 묶음의 맨 위로 끌어올렸다
        (2026-08-28 사용자 지시 — "첫번째 카드가 최상단에 있어야 하고 그 밑에부터 기록").
        **이제 `상세정보` 는 위 카드로 올라갔으므로** 그 뒤집기가 필요 없다 — 그대로 두면
        `최근 같이한 플레이어` 가 경기 기록 위로 올라와 그 지시를 거스른다.
        `최근매치` 블록 안쪽(`packages/ui/src/record/RecordPanels.tsx`)은 다른 담당 구역이라
        손대지 않고, 넘칠 때 **그 블록 안에서만** 가로로 밀리도록 감싸기만 한다.
        `.mobile-scroll-x` 는 `@media (max-width:767px)` 안에서만 정의돼 PC 는 무영향이다.
      */}
      <div className="pc-container mt-2 flex max-md:flex-col">
        <div className="w-3/4 max-md:w-full max-md:min-w-0">
          <div className="mobile-scroll-x">
            {/* `today` 를 넘기면 승률 도넛 자리에 **오늘 기록**이 들어간다 (D-186).
                예전에는 여기가 `최근 폼` 6개월 그래프였다 — 사용자 지시로 뺐다.
                클랜 기록실은 이 값을 넘기지 않으므로 도넛이 그대로 남는다 */}
            <RecentMatchSummary
              summary={data.match_summary}
              leagueSlug={leagueSlug}
              today={data.today}
              days={data.recent_days}
            />
          </div>
          <div className="mt-2">
            {matches.loading ? (
              <Skeleton className="h-[105px] w-full" />
            ) : matches.items.length === 0 ? (
              <div className="mt-4 text-center text-meta">기록된 경기가 없습니다.</div>
            ) : (
              matches.items.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  leagueSlug={leagueSlug}
                  detail={expanded[match.id]}
                  onExpand={loadDetail}
                />
              ))
            )}
            {/* 기록실에는 `더 불러오기` 가 없었다. 첫 페이지(20건)만 보이고 그 뒤의
                경기는 화면에서 닿을 수 없었다 — 사용자가 "기록이 분명 더 있는데
                버튼이 없다" 고 지적한 그것이다. 랭킹·게시판과 같은 커서 방식이라
                같은 버튼을 쓴다. 다음 커서가 없으면 렌더하지 않는다 (원본 동작). */}
            {matches.hasMore ? (
              <LoadMoreButton onClick={matches.loadMore} loading={matches.loadingMore} />
            ) : null}
          </div>
        </div>
        <div className="ml-2 w-1/4 max-md:ml-0 max-md:mt-2 max-md:w-full">
          {/*
            `상세정보`(`PlayerStatSidebar`) 는 **위 카드로 옮겼다** (사양 9절 · D-185).
            같은 패널을 그대로 옮긴 것이라 항목·순서·표기는 하나도 바뀌지 않았다.

            `무기별 기록`(`WeaponStatPanel`) 은 **원본에 없어서 뺐다**
            (2026-08-27 원본 실측 · UI_PARITY_AUDIT 6-1). 컴포넌트와 계약 필드
            (`weapon_stats` · `sniper_*` · `rifle_*`)는 그대로 두었다.
          */}
          <TeammateTable title="최근 같이한 플레이어" teammates={data.teammates} />
        </div>
      </div>
    </>
  )
}
