'use client'

/**
 * ★선수 기록실 v3★ (2026-09-10 · 사장님 시안을 실데이터로 · "바로덮기")
 *
 * 옛 화면 `LeaguePlayerRecordScreen.tsx` 는 ★그대로 있다★ — `page.tsx` 의 import 한 줄을
 * 되돌리면 옛 판으로 돌아간다 (`CLAUDE.md` 1-4).
 *
 * 자료는 세 군데서 온다: 상세(`leaguePlayerShow` — 육각·구간·추이·신고 수까지 한 줄),
 * 최근 경기 목록(커서), 펼친 경기의 스코어보드(`matchShow`).
 */
import { use, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { MatchDetail, MatchListItem } from '@sacloud/contract'
import { PlayerDetailV3, ProfileEmpty, ProfileSkeleton } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'
import { useCursorQuery } from '@/lib/useCursorQuery'
import { usePlayerReport } from '@/lib/usePlayerReport'

export default function LeaguePlayerRecordPageV3({
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
      <div className="pc-container pt-[40px]">
        <ProfileEmpty message="기록을 찾을 수 없습니다." />
      </div>
    )
  }
  return <Body data={detail.data.data} leagueSlug={leagueSlug} playerId={playerId} matches={matches} expanded={expanded} onExpand={loadDetail} />
}

function Body({
  data,
  leagueSlug,
  playerId,
  matches,
  expanded,
  onExpand,
}: {
  data: NonNullable<ReturnType<typeof useQuery<Awaited<ReturnType<typeof apiGet<'leaguePlayerShow'>>>>>['data']>['data']
  leagueSlug: string
  playerId: string
  matches: ReturnType<typeof useCursorQuery<MatchListItem>>
  expanded: Record<string, MatchDetail>
  onExpand: (match: MatchListItem) => void
}) {
  const report = usePlayerReport(playerId, data.report_count)
  return (
    <div className="pc-container pb-[40px]">
      <PlayerDetailV3
        data={data}
        leagueSlug={leagueSlug}
        matches={matches.items}
        matchesLoading={matches.loading}
        hasMore={matches.hasMore ?? false}
        loadingMore={matches.loadingMore}
        onLoadMore={matches.loadMore}
        expanded={expanded}
        onExpand={onExpand}
        report={report}
      />
    </div>
  )
}
