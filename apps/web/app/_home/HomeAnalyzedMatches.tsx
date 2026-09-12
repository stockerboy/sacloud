'use client'

/**
 * ★홈 · 경기분석까지 끝난 최근 경기 셋★ (2026-09-12 사장님)
 *
 * > «가장최근 끝난 IPL SPL 경기 (경기분석까지 마친) 3개보여주자»
 * > «여기 그냥 경기 카테고리에 있는 카드랑 똑같은 카드를 세개 배치하면 돼
 * >  누르면 바로가기 후 화면 전환이 아니라 경기상세 페이지를 이 화면에서 보여주면 돼»
 *
 * ── 카드는 ★경기 목록과 같은 물건★ 이다
 *   `MatchListV3` 를 그대로 쓴다. 줄을 누르면 그 자리에서 스코어보드가 펼쳐진다 —
 *   경기 목록 화면(`MatchListScreen`)의 `loadDetail` 과 ★같은 함수 모양★ 이다.
 *
 * ── 왜 한 줄에 하나씩 `MatchListV3` 인가
 *   그 컴포넌트는 ★리그 하나★ 를 받는다. 홈은 IPL·SPL 을 섞어 보여 주므로
 *   줄마다 제 리그를 들고 따로 그린다. 줄 모양은 완전히 같다.
 *
 * ⚠ 이 자리에는 아까 「부문별 1위」가 있었다 (같은 날). 사장님이 바꾸셨다 —
 *   `HomeTopPlayers.tsx` 는 지우지 않았다 (`CLAUDE.md` 1-4).
 */
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { MatchDetail, MatchListItem } from '@sacloud/contract'
import { MatchListV3 } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

export function HomeAnalyzedMatches() {
  const ready = useApiReady()
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState<Record<string, MatchDetail>>({})

  const q = useQuery({
    queryKey: ['home', 'analyzedMatches'],
    enabled: ready,
    queryFn: () => apiGet('homeAnalyzedMatches'),
  })
  const rows = q.data?.data ?? []

  /* 경기 목록 화면과 ★같은 함수 모양★ 이다. 규칙을 새로 만들지 않는다 */
  const loadDetail = (leagueSlug: string) => (match: MatchListItem) => {
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

  /* 아직 못 받았거나 한 줄도 없으면 ★자리를 안 만든다★ — 빈 상자를 남기지 않는다 */
  if (rows.length === 0) return null

  return (
    <section aria-label="최근 분석 완료 경기" className="sac-v2 mt-7">
      <div className="mx-auto w-full max-w-[900px]">
        <div className="mb-[8px] flex items-baseline gap-[7px] px-[2px]">
          <span className="text-[10px] font-bold tracking-[.16em] text-[var(--v2-text-ghost)]">
            최근 경기
          </span>
          <span className="text-[10px] text-[var(--v2-text-ghost)]">
            경기분석 완료 · 줄을 누르면 여기서 펼쳐집니다
          </span>
        </div>

        {rows.map((row) => (
          <MatchListV3
            key={row.match.id}
            leagueSlug={row.league_slug}
            leagueCategory={row.league_category}
            matches={[row.match]}
            matchesLoading={false}
            hasMore={false}
            loadingMore={false}
            onLoadMore={() => {}}
            expanded={expanded}
            onExpand={loadDetail(row.league_slug)}
          />
        ))}
      </div>
    </section>
  )
}
