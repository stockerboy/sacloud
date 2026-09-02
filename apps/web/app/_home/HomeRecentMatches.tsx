'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { MatchDetail, MatchListItem } from '@sacloud/contract'
import { leagueLandingPath } from '@sacloud/contract'
import { MatchCard } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { HomeEmpty, HomeLeagueHead, HomeLoadFailed, HomeSectionHead } from './homeKit'
import { HomeRecentList } from './HomeRecentList'
import { HOME_RECENT_LOOK, type HomeRecentLeague } from './homeTypes'

/**
 * ② 최근 경기 — **SPL 왼쪽 · IPL 오른쪽**, 각 6경기, **한 경기 한 줄** (2026-09-02 사장님 지시 #11).
 *
 * > "최근 경기는 승리 카드로 하지말고 그냥 간략하게 왼쪽(이긴팀)vs오른쪽(진팀) 이런 정보만 줘라
 * >  몇분전에 한 경기인지는 꼭 알려줘라 그리고 가장최신경기 6건씩을 붙이면 된다 iplspl 둘다 마찬가지이다"
 *
 * ```
 * SPL                                   IPL
 * [마크] 이긴 클랜  vs  [마크] 진 클랜   12분 전    [마크] A  vs  [마크] B   3시간 전
 * ⋮ (6줄)                               ⋮
 * ```
 *
 * 줄 하나의 규칙(왼쪽 = 이긴 팀 · 상대시간 · `결과 알수없음` · 클랜명 → 클랜 기록실)은
 * `HomeRecentList` 주석에 있다. 홈이 열릴 때 나가는 요청은 없다 — 목록은 서버가 읽어 넘긴다.
 *
 * ── 옛 모습(카드)은 지우지 않았다 (`CLAUDE.md` 10-4)
 *   `homeTypes.ts` 의 `HOME_RECENT_LOOK` 을 `'card'` 로 바꾸면 #3 때의 기록실 카드(`MatchCard` ·
 *   접힘 기본 · 꺾쇠로 펼침 · 펼칠 때 `matchShow` 지연 로드)가 그대로 돌아온다. 그때 카드는
 *   `variant` 기본(`player`)이고 주인 선수가 없어 K/D/A 칸이 없다 — `맵 · 시간 · 승패 · 두 클랜 · 증감`.
 *
 * ── 좌우
 *   순서는 `homeData.ts` 의 `HOME_RECENT_LEAGUES` 한 줄이 정한다 (지시 #10 으로 SPL 왼쪽).
 *   1024px 아래에서는 두 칸을 위아래로 쌓는다 (SPL 먼저).
 */

/** 한 줄 모양 (지금) */
function ListSector({ league }: { league: HomeRecentLeague }) {
  return (
    <section className="min-w-0">
      <HomeLeagueHead name={league.name} href={leagueLandingPath(league.slug)} action="리그 보기 →" />
      {league.rows.length === 0 ? (
        <HomeEmpty>아직 기록된 경기가 없습니다.</HomeEmpty>
      ) : (
        <HomeRecentList rows={league.rows} leagueSlug={league.slug} />
      )}
    </section>
  )
}

/** 카드 모양 (옛 방식 · `HOME_RECENT_LOOK === 'card'`) */
function CardSector({ league }: { league: HomeRecentLeague }) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState<Record<string, MatchDetail>>({})

  /**
   * 매치 상세 지연 로드 — 기록실과 같은 코드.
   * `league_clan_id` 는 어느 클랜 기준으로 보는지를 알려준다 (D-004). 매치 자신이 들고 있다.
   */
  const loadDetail = (match: MatchListItem) => {
    const matchId = match.id
    if (expanded[matchId]) return
    const leagueClanId = match.league_clan.league_clan_id
    void queryClient
      .fetchQuery({
        queryKey: ['match', league.slug, matchId, leagueClanId],
        queryFn: () =>
          apiGet('matchShow', {
            params: { leagueId: league.slug, matchId },
            search: { league_clan_id: leagueClanId },
          }),
      })
      .then((response) => setExpanded((prev) => ({ ...prev, [matchId]: response.data })))
  }

  return (
    <section className="min-w-0">
      <HomeLeagueHead name={league.name} href={leagueLandingPath(league.slug)} action="리그 보기 →" />
      {league.matches.length === 0 ? (
        <HomeEmpty>아직 기록된 경기가 없습니다.</HomeEmpty>
      ) : (
        <div className="mt-4">
          {league.matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              leagueSlug={league.slug}
              detail={expanded[match.id]}
              onExpand={loadDetail}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export function HomeRecentMatches({ leagues }: { leagues: HomeRecentLeague[] | null }) {
  const Sector = HOME_RECENT_LOOK === 'card' ? CardSector : ListSector
  return (
    <section aria-labelledby="home-recent-title">
      <HomeSectionHead id="home-recent-title" title="최근 경기" note="리그마다 최신 6경기" />
      {leagues === null ? (
        <HomeLoadFailed />
      ) : (
        /* 순서가 곧 좌우다 — `HOME_RECENT_LEAGUES` 가 SPL · IPL 순으로 들고 있다 */
        <div className="grid grid-cols-2 gap-8 max-lg:grid-cols-1 max-lg:gap-10">
          {leagues.map((league) => (
            <Sector key={league.slug} league={league} />
          ))}
        </div>
      )}
    </section>
  )
}
