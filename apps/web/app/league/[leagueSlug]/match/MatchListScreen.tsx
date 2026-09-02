'use client'

import { use, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { MatchDetail, MatchListItem } from '@sacloud/contract'
import {
  MatchCard,
  ProfileEmpty,
  ProfileLoadMore,
  ProfileSkeleton,
  SectionTitle,
} from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useCursorQuery } from '@/lib/useCursorQuery'

/**
 * 리그 경기 목록 `/league/{leagueSlug}/match` (2026-09-03 · O-015).
 *
 * ══ 왜 필요한가 ══
 *
 * **닉네임도 클랜명도 모르는 사람은 이 사이트에서 볼 게 하나도 없었다.**
 * 홈의 최근경기는 O-001 로 뺐고(사장님 지시), 경기 목록 화면은 원래 없었다.
 * > 강민재 — *"검색어를 모르는 사람이 사이트에서 처음으로 볼 게 생긴다."*
 *
 * ══ 새로 만든 것이 거의 없다 ══
 *
 * ```
 * 카드    `MatchCard` 그대로. 새 카드를 만들지 않았다
 * 더보기  `useCursorQuery` + `ProfileLoadMore` — 다른 목록과 같은 방식
 * 펼치기  `matchShow` 지연 로드 — 클랜·선수 기록실이 하던 그대로
 * ```
 *
 * ══ 펼칠 때 `league_clan_id` 를 붙인다 ══
 *
 * ⚠ **경기 한 판 화면(O-014)과 여기는 다르다.**
 * 거기는 링크를 받은 사람이 **아무 편도 아니어서** 붙이지 않았다.
 * 여기 카드는 **이긴 팀 기준**으로 서 있고(`match.league_clan` 이 그 팀이다),
 * 카드가 보여 주는 승/패·래더 증감이 이미 그 팀 것이다. 펼친 상세도 같은 편에서
 * 봐야 앞뒤가 맞는다 — 안 붙이면 **접힌 줄과 펼친 표가 서로 다른 편**을 말한다.
 */
export default function MatchListPage({ params }: { params: Promise<{ leagueSlug: string }> }) {
  const { leagueSlug } = use(params)
  const queryClient = useQueryClient()

  const matches = useCursorQuery<MatchListItem>('leagueMatches', ['league', leagueSlug, 'matches'], {
    params: { leagueId: leagueSlug },
  })

  const [expanded, setExpanded] = useState<Record<string, MatchDetail>>({})

  /* 클랜·선수 기록실과 **같은 함수 모양**이다. 규칙을 새로 만들지 않는다 */
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

  return (
    <div className="pc-container pb-[40px] pt-[40px]">
      <SectionTitle title="경기" note="최신순입니다. 카드를 누르면 라인업이 펼쳐집니다." />

      {matches.loading ? (
        <ProfileSkeleton rows={3} height={96} />
      ) : matches.items.length === 0 ? (
        /* 탭을 감춰서 없는 것처럼 만들지 않는다 — 없으면 없다고 말한다 */
        <ProfileEmpty message="아직 경기가 없습니다." />
      ) : (
        <>
          {matches.items.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              detail={expanded[match.id]}
              onExpand={loadDetail}
              leagueSlug={leagueSlug}
              variant="clan"
            />
          ))}
          {matches.hasMore ? (
            <ProfileLoadMore onClick={matches.loadMore} loading={matches.loadingMore} />
          ) : null}
        </>
      )}
    </div>
  )
}
