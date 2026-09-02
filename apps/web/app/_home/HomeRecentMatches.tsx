'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { MatchDetail, MatchListItem } from '@sacloud/contract'
import { leagueLandingPath } from '@sacloud/contract'
import { MatchCard } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { HomeEmpty, HomeLeagueHead, HomeLoadFailed, HomeSectionHead } from './homeKit'
import type { HomeRecentLeague } from './homeTypes'

/**
 * ② 최근 경기 — **IPL 왼쪽 · SPL 오른쪽**, 각 5경기 (2026-09-02 사장님 지시).
 *
 * ```
 * IPL                         SPL
 * ┃ 맵 - 3분 전        +6점   ┃ 맵 - 10분 전       알수없음
 * ┃ 승리  [A] vs [B]      ⌄   ┃ 승리  [C] vs [D]      ⌄
 * ⋮ (5장)                    ⋮
 * ```
 *
 * ── 카드는 기록실 것 그대로다
 *   `MatchCard` 를 재사용한다. **접힌 것이 기본**이고 꺾쇠를 누르면 펼쳐진다 — 기록실과
 *   같은 동작이다 (버튼이 하는 일을 바꾸지 않는다). 펼칠 때 상세를 지연 로드하는 것도
 *   기록실(`league/[leagueSlug]/player/[playerId]/page.tsx` 의 `loadDetail`)과 같은 코드다.
 *   경기 목록 자체는 서버가 읽어 넘긴다 — 홈이 열릴 때 나가는 요청은 없고,
 *   꺾쇠를 누를 때만 `GET /leagues/{slug}/matches/{id}` 하나가 나간다.
 *
 *   `variant` 는 기본(`player`)이다. 홈 카드에는 주인 선수가 없어 `player_stat` 이 `null` 이고
 *   K/D/A 칸이 그려지지 않는다 — 남는 것은 `맵 · 시간 · 승패 · 두 클랜 · 증감` 이다.
 *   `clan` 변형(선레드 · 5 vs 5 칸)을 쓰면 반 폭 칸에서 카드가 넘친다.
 *
 * ── 왼쪽 클랜은 이긴 쪽이다
 *   서버가 이긴 쪽을 «보는 쪽» 으로 두고 카드를 만든다 (`homeRecent.ts`). 그래서 `승리` 가
 *   왼쪽에 서고 그 옆이 이긴 클랜이다. 승자를 모르는 경기만 레드 슬롯 기준이다.
 *
 * ── 좁은 화면
 *   1024px 아래에서는 두 칸을 위아래로 쌓는다 (IPL 먼저). 카드는 기록실과 같이
 *   `.mobile-bleed` 로 화면 끝까지 찬다.
 */

function Sector({ league }: { league: HomeRecentLeague }) {
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
  return (
    <section aria-labelledby="home-recent-title">
      <HomeSectionHead id="home-recent-title" title="최근 경기" note="리그마다 최근 5경기" />
      {leagues === null ? (
        <HomeLoadFailed />
      ) : (
        /* 순서가 곧 좌우다 — `HOME_RECENT_LEAGUES` 가 IPL · SPL 순으로 들고 있다 */
        <div className="grid grid-cols-2 gap-8 max-lg:grid-cols-1 max-lg:gap-10">
          {leagues.map((league) => (
            <Sector key={league.slug} league={league} />
          ))}
        </div>
      )}
    </section>
  )
}
