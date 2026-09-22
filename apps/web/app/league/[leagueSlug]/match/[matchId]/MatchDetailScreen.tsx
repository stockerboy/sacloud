'use client'

import { use } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ClanScoreboardV3, MatchCard, MatchCardV3, PageHead, ProfileEmpty, ProfileSkeleton, useSeasonLabel } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/**
 * 경기 상세 페이지 — 주소로 직접 들어온 경기 한 판.
 *
 * ── ★2026-09-22 밤 — 통일 카드로★ (사장님: 「경기카드는 무조건 통일이다 / Pc에서도
 *   한가지 형식 / 모바일에서도 한가지 형식」)
 *
 *   이 화면만 옛 `record/MatchCard` 를 쓰고 있어 ★네 번째 카드 형식★ 이었다
 *   (운영 화면을 찍어서 잡았다). 이제 리그홈·선수·클랜과 ★같은 `MatchCardV3`★ 를
 *   ★펼친 채로★ 세우고, 그 아래에 같은 스코어보드(`ClanScoreboardV3` · 경기분석 단추 포함)를 그린다.
 *
 *   `MatchDetail` 은 `MatchListItem` 을 확장한 것이라(계약 `MatchDetail = MatchListItem.extend`)
 *   카드에 그대로 넘긴다 — 값을 다시 만들지 않는다.
 *
 *   이 화면엔 기준 클랜이 없다 → `neutral` (이긴 쪽이 왼쪽 · WIN 표). 리그홈과 같은 규칙.
 *
 *   ★옛 카드는 지우지 않았다★ (`CLAUDE.md` 1-4) — `UNIFIED_MATCH_CARD` 를 `false` 로 두면
 *   `record/MatchCard`(`defaultExpanded`)가 그대로 돌아온다.
 *
 * ── 편은 서버가 정한다
 *   `viewer_side` 는 요청한 클랜 기준인데 이 화면은 주소로 들어오므로 없다.
 *   서버는 값이 없으면 `red` 쪽을 기준으로 본다. **그 기본값을 그대로 쓴다.**
 *   ⚠ 편을 지어내지 않는다. 없는 것을 있는 것처럼 만들지 않는다.
 */
const UNIFIED_MATCH_CARD: boolean = true

export default function MatchDetailPage({
  params,
}: {
  params: Promise<{ leagueSlug: string; matchId: string }>
}) {
  const { leagueSlug, matchId } = use(params)
  const ready = useApiReady()
  /* ★어느 시즌 경기인가★ — 이 화면은 Cloud 0 창 안 경기만 연다 (542a6f7).
     이름은 `SEASON_WINDOWS` 한 곳에서 온다. 모르면 리본 줄을 안 그린다 */
  const season = useSeasonLabel()

  const match = useQuery({
    queryKey: ['match', leagueSlug, matchId, 'page'],
    queryFn: () => apiGet('matchShow', { params: { leagueId: leagueSlug, matchId } }),
    enabled: ready,
  })
  /* 리그 분류(official/independent) — 티어 글자를 그릴지 카드가 이걸로 정한다. 경기 목록 페이지와 같은 조회 */
  const league = useQuery({
    queryKey: ['league', leagueSlug],
    queryFn: () => apiGet('leagueShow', { params: { leagueSlug } }),
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
        {/* ★Cloud 0 이전 경기는 못 연다★ (2026-09-04 · 사장님 지시).
            서버가 창 밖 경기를 404 로 돌려주므로 여기로 온다. 「없다」고만 하면
            ★기록이 지워진 줄 안다★ — 왜 안 보이는지를 적는다. 행은 DB 에 그대로 있다.
            ⚠ ★2026-09-06 (Part 5)★ — 문구의 「시즌0」을 ★Cloud 0★ 으로 바꿨다 (사장님 지시).
              ★디자인·배치는 건드리지 않았다.★ 글자만이다 */}
        <ProfileEmpty message="Cloud 0(9/3 07:00 이후) 경기만 볼 수 있습니다." />
        <div className="mt-6 text-center text-sm text-meta">
          <Link prefetch={false} href={`/league/${leagueSlug}`}>
            <span className="underline underline-offset-4">리그로 돌아가기</span>
          </Link>
        </div>
      </div>
    )
  }

  const detail = match.data.data
  const leagueCategory = league.data?.data.category ?? 'independent'

  return (
    <div className="pc-container pb-[40px]">
      {/* ★2026-09-07 (Part 10 ⑧)★ — 시안의 화면 머리. ★Cloud 표기가 여기 붙는다★ */}
      <PageHead
        kicker={season?.toUpperCase() ?? null}
        title="경기"
        /* 맵 이름 — 계약상 `GameMap` 객체다. 없으면 ★그 조각을 안 그린다★ */
        subtitle={detail.map?.name ?? undefined}
      />
      <div className="mt-[26px]" />
      {UNIFIED_MATCH_CARD ? (
        <MatchCardV3
          match={detail}
          detail={detail}
          league={{ category: leagueCategory, slug: leagueSlug }}
          neutral
          /* ★이 화면의 전부다★ — 링크를 받은 사람은 누르지 않아도 라인업을 본다. 접히지 않는다 */
          open
          onToggle={() => {}}
          renderDetail={(d) => <ClanScoreboardV3 detail={d} leagueCategory={leagueCategory} leagueSlug={leagueSlug} winnerFirst />}
        />
      ) : (
        <MatchCard
          match={detail}
          detail={detail}
          leagueSlug={leagueSlug}
          variant="clan"
          defaultExpanded
        />
      )}
    </div>
  )
}
