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
import { PlayerDetailV3, ProfileEmpty, ProfileSkeleton, type StrengthCompare } from '@sacloud/ui'
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

/**
 * ★비교분석★ — 다른 선수 여섯 축을 겹쳐 그린다 (2026-09-12 사장님).
 *
 * 찾기는 `playersSearch`, 값은 그 선수의 `leaguePlayerShow` 에서 온다.
 * ★같은 리그 안에서만★ 견준다 — 축 백분위는 리그 안에서 매긴 값이라 리그를 섞으면
 * 뜻이 없다. 그 리그에 없는 선수를 고르면 값이 안 와서 겹치지 않는다.
 *
 * 스나수·라플수는 가리지 않는다 (사장님 지시). 싸움 축만 잣대가 달라서
 * 그림 밑에 그 말을 한 줄 적어 둔다.
 */
function useCompare(leagueSlug: string, playerId: string): StrengthCompare {
  const ready = useApiReady()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null)

  const q = query.trim()
  const found = useQuery({
    queryKey: ['compare', 'search', q],
    enabled: ready && q.length > 0,
    queryFn: () => apiGet('playersSearch', { params: { q } }),
  })

  const other = useQuery({
    queryKey: ['compare', 'hex', leagueSlug, picked?.id ?? ''],
    enabled: ready && picked !== null,
    queryFn: () => apiGet('leaguePlayerShow', { params: { leagueSlug, playerId: picked?.id ?? '' } }),
  })

  const values =
    picked === null
      ? null
      : (other.data?.data.hex?.axes ?? []).map((axis) => axis.percentile)

  return {
    picked,
    values: values === null || values.length === 0 ? null : values,
    /* 자기 자신은 고를 수 없다 — 겹쳐 봐야 같은 그림이다 */
    results: (found.data?.data ?? [])
      .filter((row) => row.id !== playerId)
      .slice(0, 8)
      .map((row) => ({ id: row.id, name: row.name, clanName: row.clan?.name ?? null })),
    loading: found.isFetching,
    onQueryChange: setQuery,
    onPick: (candidate) => setPicked({ id: candidate.id, name: candidate.name }),
    onClear: () => setPicked(null),
  }
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
  const compare = useCompare(leagueSlug, playerId)
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
        compare={compare}
      />
    </div>
  )
}
