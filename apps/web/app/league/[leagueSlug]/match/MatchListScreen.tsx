'use client'

import { use, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { MatchDetail, MatchListItem } from '@sacloud/contract'
import {
  MatchCard,
  MatchListV3,
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
 * ══ 2026-09-11 · v3 로 덮었다 (QA 회차 1) ══
 *
 * 옛 `MatchCard` 는 마크 없이 «2티어 알수없음» 을 적고 펼쳐도 비어 있었다.
 * 선수·클랜 상세와 같은 줄(`MatchListV3`) + 같은 스코어보드로 바꿨다.
 * 옛 카드 분기는 `USE_V3 = false` 로 되돌릴 수 있게 남겼다 (`CLAUDE.md` 1-4).
 *
 * ══ 펼칠 때 `league_clan_id` 를 붙인다 ══
 *
 * ⚠ **경기 한 판 화면(O-014)과 여기는 다르다.**
 * 거기는 링크를 받은 사람이 **아무 편도 아니어서** 붙이지 않았다.
 * 여기 카드는 **이긴 팀 기준**으로 서 있고(`match.league_clan` 이 그 팀이다),
 * 카드가 보여 주는 승/패·래더 증감이 이미 그 팀 것이다. 펼친 상세도 같은 편에서
 * 봐야 앞뒤가 맞는다 — 안 붙이면 **접힌 줄과 펼친 표가 서로 다른 편**을 말한다.
 */
const USE_V3 = true

export default function MatchListPage({ params }: { params: Promise<{ leagueSlug: string }> }) {
  const { leagueSlug } = use(params)
  const queryClient = useQueryClient()

  const league = useQuery({
    queryKey: ['league', leagueSlug],
    queryFn: () => apiGet('leagueShow', { params: { leagueSlug } }),
  })

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

  if (USE_V3) {
    return (
      <div className="pc-container pb-[40px] pt-[24px]">
        <SectionTitle title="경기" note="최신순입니다. 줄을 누르면 스코어보드가 펼쳐집니다." />
        <MatchListV3
          leagueSlug={leagueSlug}
          leagueCategory={league.data?.data.category ?? 'independent'}
          matches={matches.items}
          matchesLoading={matches.loading}
          hasMore={matches.hasMore ?? false}
          loadingMore={matches.loadingMore}
          onLoadMore={matches.loadMore}
          expanded={expanded}
          onExpand={loadDetail}
        />
      </div>
    )
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
