'use client'

import { use, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { MatchDetail, MatchListItem } from '@sacloud/contract'
import {
  MatchCard,
  PlayerStatSidebar,
  ProfileTabs,
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

  const base = `/league/${leagueSlug}/player/${playerId}`
  const tabs = [
    { label: '기본정보', href: `/player/${playerId}` },
    { label: '기록실', href: base },
    { label: '지난시즌', href: `${base}/season` },
  ]

  if (!detail.data) {
    return (
      <div className="pc-container mt-10">
        <Skeleton className="h-[200px] w-full" />
      </div>
    )
  }

  const data = detail.data.data

  return (
    <>
      <ProfileTabs tabs={tabs} current={base} />
      <div className="pc-container mt-2 flex">
        <div className="w-3/4">
          <RecentMatchSummary summary={data.match_summary} leagueSlug={leagueSlug} />
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
          </div>
        </div>
        <div className="ml-2 w-1/4">
          <PlayerStatSidebar
            rating={data.rating}
            placement={data.placement}
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
            clan={data.clan}
          />
          <TeammateTable title="최근 같이한 플레이어" teammates={data.teammates} />
        </div>
      </div>
    </>
  )
}
