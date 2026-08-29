'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LeaguePreparing, LeagueSubNav, isLeaguePreparing } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/**
 * 리그 화면 공통 레이아웃.
 *
 * 원본은 전역 GNB(4.5rem) 아래에 리그 서브내비(3rem)를 하나 더 고정하고,
 * 본문을 그만큼(`pt-12`) 아래로 민다.
 *
 * 모바일에서는 서브내비가 **두 줄**(리그명 줄 + 탭 줄)이라 그만큼 더 민다 — `pt-24`.
 *
 * ── 준비중인 리그 (D-178)
 *   `isLeaguePreparing(slug)` 이면 **본문을 그리지 않고** 안내만 띄운다.
 *   리그 하위 경로(리그홈 · 클랜랭킹 · 개인랭킹 · 클랜/선수 상세)가 전부 이 레이아웃을
 *   지나므로 여기 한 곳만 막으면 랭킹·집계가 어느 경로로도 나가지 않는다.
 *   페이지마다 조건을 뿌리면 새 경로가 생길 때 빠진다.
 *   서브내비 탭도 그리지 않는다 — 누를 곳을 주면 "준비중인데 왜 탭이 있나" 가 된다.
 */
export default function LeagueLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ leagueSlug: string }>
}) {
  const { leagueSlug } = use(params)
  const ready = useApiReady()
  const preparing = isLeaguePreparing(leagueSlug)

  const league = useQuery({
    queryKey: ['league', leagueSlug],
    queryFn: () => apiGet('leagueShow', { params: { leagueSlug } }),
    /* 준비중인 리그는 조회조차 하지 않는다. 그려 줄 것이 없는데 요청을 보내면
       응답(랭킹 링크 · 참가 클랜 수)이 클라이언트 캐시에 남는다 */
    enabled: ready && !preparing,
  })

  if (preparing) return <LeaguePreparing />

  return (
    <>
      {/* 시즌 배지는 넘기지 않는다 — 원본 서브내비에 그런 표시가 없다 (UI_PARITY_AUDIT 2-2) */}
      <LeagueSubNav leagueSlug={leagueSlug} leagueName={league.data?.data.name ?? ''} />
      <div className="pt-24 md:pt-12">{children}</div>
    </>
  )
}
