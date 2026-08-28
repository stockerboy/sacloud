'use client'

import { use, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { MatchDetail, MatchListItem } from '@sacloud/contract'
import {
  LoadMoreButton,
  MatchCard,
  PlayerStatSidebar,
  RecentMatchSummary,
  Skeleton,
  TeammateTable,
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
        모바일 — 3:1 두 칸을 위아래로 쌓는다 (기록 → 상세정보 순서는 그대로).
        `최근매치` 블록 안쪽(`packages/ui/src/record/RecordPanels.tsx`)은 다른 담당 구역이라
        손대지 않고, 넘칠 때 **그 블록 안에서만** 가로로 밀리도록 감싸기만 한다.
        `.mobile-scroll-x` 는 `@media (max-width:767px)` 안에서만 정의돼 PC 는 무영향이다.
      */}
      <div className="pc-container mt-2 flex max-md:flex-col">
        <div className="w-3/4 max-md:w-full max-md:min-w-0">
          <div className="mobile-scroll-x">
            <RecentMatchSummary summary={data.match_summary} leagueSlug={leagueSlug} />
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
            clan={
              data.clan
                ? { ...data.clan, isOfficialClan: data.clan.is_official_clan }
                : null
            }
          />
          {/*
            `무기별 기록`(`WeaponStatPanel`) 은 **원본에 없어서 뺐다**
            (2026-08-27 원본 실측 · UI_PARITY_AUDIT 6-1). 컴포넌트와 계약 필드
            (`weapon_stats` · `sniper_*` · `rifle_*`)는 그대로 두었다.

            사이드바의 `포지션` 줄은 **되살렸다** (D-161).
            "원본에 없다" 던 2026-08-27 판정이 틀렸다 — 값이 있는 선수에게만 나오는 줄이라
            표본에서 안 보였을 뿐이다. 원본 응답 `data.player.position` 이 그 값이고,
            선수가 직접 설정한다. 무기별 경기 수로 계산하던 예전의 `포지션` 과는 다른 것이다.
          */}
          <TeammateTable title="최근 같이한 플레이어" teammates={data.teammates} />
        </div>
      </div>
    </>
  )
}
