'use client'

import { use, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { MatchDetail, MatchListItem } from '@sacloud/contract'
import {
  MatchCard,
  ProfileTabs,
  RecentMatchSummary,
  Skeleton,
  TeammateTable,
} from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'
import { useCursorQuery } from '@/lib/useCursorQuery'

/**
 * 클랜 기록실 `/league/{slug}/clan/{slug}`.
 * 개인 기록실과 같은 레이아웃이지만 카드에 개인 KDA 대신 팀 단위 정보만 나오고
 * (매치의 `player_stat`이 null), 사이드는 상세정보 대신 최근 클랜전 플레이어 승률만 보여준다.
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

  const base = `/league/${leagueSlug}/clan/${clanSlug}`
  const tabs = [
    { label: '기본정보', href: `/clan/${clanSlug}` },
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
          <TeammateTable title="최근 클랜전 플레이어" teammates={data.teammates} />
        </div>
      </div>
    </>
  )
}
