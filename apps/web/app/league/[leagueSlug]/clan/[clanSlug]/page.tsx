'use client'

import { use, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { MatchDetail, MatchListItem } from '@sacloud/contract'
import {
  ClanHexagon,
  ClanMetrics,
  ClanRoundMetrics,
  ClanRoster,
  ClanStatSidebar,
  LoadMoreButton,
  MatchCard,
  RecentMatchSummary,
  Skeleton,
  TeammateTable,
} from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'
import { useCursorQuery } from '@/lib/useCursorQuery'

/**
 * 클랜 기록실 `/league/{slug}/clan/{slug}`.
 *
 * 헤더·탭은 레이아웃이 그린다. 개인 기록실과 같은 배치지만 카드에 개인 KDA 대신
 * 팀 단위 정보가 나오고(매치의 `player_stat`이 null), 사이드는
 * `상세정보` + `최근 클랜전 플레이어 승률` 이다.
 */
export default function LeagueClanRecordPage({
  params,
}: {
  params: Promise<{ leagueSlug: string; clanSlug: string }>
}) {
  const { leagueSlug, clanSlug } = use(params)
  const ready = useApiReady()
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState<Record<string, MatchDetail>>({})

  const detail = useQuery({
    queryKey: ['league', leagueSlug, 'clan', clanSlug, 'show'],
    queryFn: () => apiGet('leagueClanShow', { params: { leagueSlug, clanSlug } }),
    enabled: ready,
  })

  const matches = useCursorQuery<MatchListItem>(
    'leagueClanMatches',
    ['league', leagueSlug, 'clan', clanSlug, 'matches'],
    { params: { leagueClanId: detail.data?.data.id ?? '' } },
    !!detail.data,
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

  if (!detail.data) {
    return (
      <div className="pc-container mt-10">
        <Skeleton className="h-[200px] w-full" />
      </div>
    )
  }

  const data = detail.data.data

  return (
    /*
      모바일 — 3:1 두 칸을 위아래로 쌓는다. `최근매치` 블록 안쪽은 다른 담당 구역이라
      손대지 않고 넘칠 때 그 블록 안에서만 가로로 밀리게 감싼다 (개인 기록실과 동일).
    */
    <div className="pc-container mt-2 flex max-md:flex-col">
      <div className="w-3/4 max-md:w-full max-md:min-w-0 max-md:order-2">
        {/* 클랜 화면의 상대 클랜 줄에는 킬뎃이 없다 (원본 실측 · UI_PARITY_AUDIT 5-7) */}
        <div className="mobile-scroll-x">
          <RecentMatchSummary
            summary={data.match_summary}
            leagueSlug={leagueSlug}
            showKdRate={false}
          />
        </div>
        {/* 클랜원 포지션 정리 (SITE_SPEC_V2 5-2 · D-199) — 지표보다 위다.
            사양이 `클랜명 → 클랜원 → 승률 추이 → 지표` 순서로 적혀 있다.

            **기존 클랜원 목록을 대체하지 않는다.** `클랜원` 탭(`/clan/{slug}/player`)의
            표는 그대로 있고 이것은 그 위에 얹은 새 섹터다 — 방식을 바꿀 때 앞 버전도
            남긴다는 사용자 지시다. 클랜원이 없으면 `null` 이고 그리지 않는다 (D-106) */}
        {data.roster ? <ClanRoster roster={data.roster} leagueSlug={leagueSlug} /> : null}
        {/* 클랜 지표 (SITE_SPEC_V2 5절) — 경기 목록보다 위다. 지표가 먼저 읽히고
            그 근거인 경기가 아래에 이어진다. 재료가 없으면 `null` 이고 그리지 않는다 (D-106) */}
        {data.metrics ? (
          <ClanMetrics
            metrics={data.metrics}
            leagueSlug={leagueSlug}
            leagueCategory={data.league.category}
          />
        ) : null}
        {/* 배틀로그 지표 (SITE_SPEC_V2 5-5절) — 클랜 지표 **바로 아래**다.
            배틀로그가 없는 클랜은 `null` 이고 그리지 않는다 (D-106) */}
        {/* 육각형은 배틀로그 지표 **바로 위**에 둔다 — 사양 원문도 `6각형` 다음 줄부터
            숫자가 이어진다. 그림으로 먼저 형태를 보고 아래에서 값을 읽는다 */}
        {data.round_metrics ? (
          <div className="mt-2 bg-card px-3 py-3 shadow-card">
            {data.hexagon ? <ClanHexagon hexagon={data.hexagon} /> : null}
          </div>
        ) : null}
        {data.round_metrics ? <ClanRoundMetrics metrics={data.round_metrics} /> : null}
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
                variant="clan"
              />
            ))
          )}
          {/* 기록실에 `더 불러오기` 가 없어 첫 페이지 뒤의 경기에 닿을 수 없었다.
              랭킹·게시판과 같은 커서 방식이라 같은 버튼을 쓴다.
              다음 커서가 없으면 렌더하지 않는다 (원본 동작). */}
          {matches.hasMore ? (
            <LoadMoreButton onClick={matches.loadMore} loading={matches.loadingMore} />
          ) : null}
        </div>
      </div>
      <div className="ml-2 w-1/4 max-md:ml-0 max-md:mt-0 max-md:w-full max-md:order-1 max-md:mb-2">
        <ClanStatSidebar
          rating={data.rating}
          placement={data.placement}
          win={data.win}
          lose={data.lose}
          winRate={data.win_rate}
          division={data.division}
          rank={data.rank}
        />
        <TeammateTable title="최근 클랜전 플레이어 승률" teammates={data.teammates} />
      </div>
    </div>
  )
}
