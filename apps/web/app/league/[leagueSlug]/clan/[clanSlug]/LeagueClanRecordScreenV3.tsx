'use client'

/**
 * ★클랜 기록실 v3★ (2026-09-10 · 사장님 시안을 실데이터로 · "바로덮기")
 *
 * 옛 화면 `LeagueClanRecordScreen.tsx` 는 ★그대로 있다★ — `page.tsx` 의 import 한 줄을
 * 되돌리면 옛 판으로 돌아간다 (`CLAUDE.md` 1-4).
 *
 * 클랜 카드(띠 · KPI · 육각형)는 layout 이 그린다 — 기록실 · 클랜원 · 지난시즌 탭이 같이 쓴다.
 * 여기는 그 아래: vs 티어 스트립 · 상대전적 · 최근 경기.
 */
import { use, useState } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ClanRankRow, MatchDetail, MatchListItem } from '@sacloud/contract'
import { ClanDetailV3, ProfileEmpty, ProfileSkeleton } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'
import { useCursorQuery } from '@/lib/useCursorQuery'

export default function LeagueClanRecordPageV3({
  params,
}: {
  params: Promise<{ leagueSlug: string; clanSlug: string }>
}) {
  const { leagueSlug, clanSlug } = use(params)
  const ready = useApiReady()
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState<Record<string, MatchDetail>>({})
  const [opponent, setOpponent] = useState<string | null>(null)
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
  /* 맞대결 기록 — `?opponent=` 로 그 상대와의 경기만 (2026-09-10) */
  const vs = useCursorQuery<MatchListItem>(
    'leagueClanMatches',
    ['league', leagueSlug, 'clan', clanSlug, 'matches', 'vs', opponent ?? ''],
    { params: { leagueClanId: detail.data?.data.id ?? '' }, search: { opponent: opponent ?? '' } },
    !!detail.data && opponent !== null,
  )
  /* 티어별 클랜 전부 — «vs 티어» 마크 줄에 내 클랜 빼고 전부 나열한다 (2026-09-11 사장님) */
  const divisionCount = detail.data?.data.league.division_count ?? 0
  const tierQueries = useQueries({
    queries: Array.from({ length: divisionCount }, (_, i) => i + 1).map((division) => ({
      queryKey: ['ranks', 'clans', leagueSlug, division, 'all'],
      queryFn: () => apiGet('leagueRankClans', { params: { leagueId: leagueSlug }, search: { division, size: 60 } }),
      enabled: ready && divisionCount > 0,
      staleTime: 10 * 60 * 1000,
    })),
  })
  const tierClansOf = (division: number): readonly ClanRankRow[] | null => {
    const q = tierQueries[division - 1]
    return q?.data ? q.data.data : null
  }
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
  if (detail.isPending && detail.fetchStatus === 'fetching') {
    return (
      <div className="pc-container pt-[40px]">
        <ProfileSkeleton rows={2} height={180} />
      </div>
    )
  }
  if (!detail.data) {
    return (
      <div className="pc-container pb-[40px] pt-[40px]">
        <ProfileEmpty message="기록을 찾을 수 없습니다." />
      </div>
    )
  }
  return (
    <div className="pc-container pb-[40px]">
      <ClanDetailV3
        data={detail.data.data}
        leagueSlug={leagueSlug}
        matches={matches.items}
        matchesLoading={matches.loading}
        hasMore={matches.hasMore ?? false}
        loadingMore={matches.loadingMore}
        onLoadMore={matches.loadMore}
        expanded={expanded}
        onExpand={loadDetail}
        vsMatches={opponent === null || vs.loading ? null : vs.items}
        onSelectOpponent={setOpponent}
        tierClansOf={tierClansOf}
      />
    </div>
  )
}
