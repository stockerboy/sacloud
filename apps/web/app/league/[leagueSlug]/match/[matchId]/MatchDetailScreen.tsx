'use client'

import { use } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { MatchCard, ProfileEmpty, ProfileSkeleton } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/**
 * 경기 한 판 `/league/{leagueSlug}/match/{matchId}` (2026-09-03 · O-014).
 *
 * ══ 무엇을 만든 것인가 — **새로 만든 것이 거의 없다** ══
 *
 * 경기 상세는 **이미 다 있었다. 자기 주소가 없었을 뿐이다.**
 * `MatchCard` 가 펼치면 라인업 10명 표 전체를 그리고, `GET /leagues/:id/matches/:matchId`
 * 도 있었다. 그런데 **카드를 눌러야만 보이고 친구에게 링크를 못 보냈다.**
 *
 * > 강민재 — *"링크를 보낼 수 있어야 사이트가 밖으로 퍼진다."*
 *
 * 그래서 이 화면이 하는 일은 셋뿐이다.
 * ```
 * 1  `matchShow` 를 한 번 부른다
 * 2  그 값으로 `MatchCard` 를 ★펼친 채로★ 세운다 (`defaultExpanded`)
 * 3  못 찾으면 말을 한다
 * ```
 * **새 카드도 새 표도 만들지 않았다.**
 *
 * ══ 왜 한 번만 부르나 ══
 *
 * `MatchCard` 는 접힌 줄(`match`)과 펼친 상세(`detail`)를 따로 받는데,
 * 계약에서 **`MatchDetail` 이 `MatchListItem` 을 확장**한다 (`entities/match.ts` 243행).
 * 그래서 같은 응답 하나를 양쪽에 준다 — 왕복이 늘지 않는다.
 *
 * ══ `league_clan_id` 를 안 붙인다 ══
 *
 * 선수·클랜 화면은 **어느 기록실에서 펼쳤는지**를 알아서 그 값을 붙인다. 상대 클랜
 * 선수의 딜량·헤드샷을 `알수없음` 으로 지우는 데 쓰인다 (D-004).
 * 이 화면은 **어느 기록실도 아니다** — 링크를 받은 사람은 아무 편도 아니다.
 * 서버는 값이 없으면 `red` 쪽을 기준으로 본다. **그 기본값을 그대로 쓴다.**
 * ⚠ 편을 지어내지 않는다. 없는 것을 있는 것처럼 만들지 않는다.
 */
export default function MatchDetailPage({
  params,
}: {
  params: Promise<{ leagueSlug: string; matchId: string }>
}) {
  const { leagueSlug, matchId } = use(params)
  const ready = useApiReady()

  const match = useQuery({
    queryKey: ['match', leagueSlug, matchId, 'page'],
    queryFn: () => apiGet('matchShow', { params: { leagueId: leagueSlug, matchId } }),
    enabled: ready,
  })

  /* 「지금 실제로 받아오는 중」만 로딩으로 친다 — `isPending` 은 **멈춰 있는 것**도 참이다.
     연결이 끊겨 재시도가 `paused` 로 서면 화면이 영원한 스켈레톤이 된다 (O-033 ②) */
  const loading = match.isPending && match.fetchStatus === 'fetching'

  if (loading) {
    return (
      <div className="pc-container pt-[40px]">
        <ProfileSkeleton rows={2} height={180} />
      </div>
    )
  }

  if (!match.data) {
    return (
      <div className="pc-container pb-[40px] pt-[40px]">
        <ProfileEmpty message="경기를 찾을 수 없습니다." />
        <div className="mt-6 text-center text-sm text-meta">
          <Link href={`/league/${leagueSlug}`}>
            <span className="underline underline-offset-4">리그로 돌아가기</span>
          </Link>
        </div>
      </div>
    )
  }

  const detail = match.data.data

  return (
    <div className="pc-container pb-[40px] pt-[40px]">
      <MatchCard
        match={detail}
        detail={detail}
        leagueSlug={leagueSlug}
        variant="clan"
        /* ★이 화면의 전부다★ — 링크를 받은 사람은 누르지 않아도 라인업을 본다 */
        defaultExpanded
      />
    </div>
  )
}
