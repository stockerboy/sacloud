'use client'

import { showsTier } from '@sacloud/contract'

import { use } from 'react'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { LeagueClanRecordHeader, ProfileEmpty, ProfileNav, ProfileSkeleton } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'
import { useRefresh } from '@/lib/useRefresh'
import { leagueClanTabs } from '@/lib/profileTabs'

/**
 * 리그 클랜 화면 공통 — 헤더 + 탭.
 *
 * 원본은 `기록실` `클랜원` `지난시즌` 세 화면 모두에서 같은 헤더와 탭을 보여 준다.
 * 페이지마다 따로 그리면 세 곳이 갈라지므로 레이아웃으로 올린다
 * (전역 클랜 화면 `/clan/{slug}/layout.tsx` 와 같은 방식).
 */
/*
 * ★로딩과 「없음」을 구분한다★ (2026-09-03 · O-008 ④ · O-033 ② 와 같은 처방).
 *
 * 전에는 `data ? 머리띠 : 스켈레톤` 하나였다. 없는 주소로 들어가면 `data` 가 영영
 * 안 채워지고 **화면이 영원히 로딩 중**으로 남는다. 운영에서 실제로 그랬다 —
 * 「없습니다」도 없는 **빈 상자**였다.
 *
 * ⚠ `isPending` 하나로는 모자란다 — **멈춰 있는 것도 참**이다.
 *   연결이 끊겨 재시도가 `paused` 로 서면 `isPending` 이 영영 참이다.
 *   그래서 **「지금 실제로 받아오는 중」일 때만** 스켈레톤을 그린다.
 */
export default function LeagueClanLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ leagueSlug: string; clanSlug: string }>
}) {
  const { leagueSlug, clanSlug } = use(params)
  const pathname = usePathname() ?? ''
  const ready = useApiReady()

  const detail = useQuery({
    queryKey: ['league', leagueSlug, 'clan', clanSlug, 'show'],
    queryFn: () => apiGet('leagueClanShow', { params: { leagueSlug, clanSlug } }),
    enabled: ready,
  })

  /* 헤더의 `최근갱신` 은 리그 참가 정보가 아니라 **클랜 자체**의 값이라
     `leagueClanShow` 에 없다. 전역 클랜 응답에서 가져온다 (계약은 그대로 둔다). */
  const clan = useQuery({
    queryKey: ['clan', clanSlug],
    queryFn: () => apiGet('clanShow', { params: { clanSlug } }),
    enabled: ready,
  })

  const refresh = useRefresh('clanRenew', { clanSlug })
  const data = detail.data?.data

  return (
    <>
      {data ? (
        <LeagueClanRecordHeader
          leagueName={data.league.name}
          name={data.clan.name}
          infoHref={`/clan/${clanSlug}`}
          clan={data.clan}
          division={data.division}
          /* 부리그를 화면에 내지 않는 리그(지시 #9 · D-265 ③)는 단일리그처럼 넘긴다 —
             헤더의 «divisionCount 가 1 이면 N부리그를 안 붙인다» 규칙을 그대로 탄다 */
          divisionCount={showsTier(leagueSlug) ? data.league.division_count : 1}
          rank={data.rank}
          renewedAt={refresh.renewedAt ?? clan.data?.data.renewed_at ?? null}
          refreshState={refresh.state}
          onRefresh={refresh.run}
        />
      ) : detail.isPending && detail.fetchStatus === 'fetching' ? (
        <div className="pc-container pt-[40px]">
          <ProfileSkeleton rows={1} height={120} />
        </div>
      ) : (
        <div className="pc-container pt-[40px]">
          <ProfileEmpty message="클랜을 찾을 수 없습니다." />
        </div>
      )}
      <ProfileNav tabs={leagueClanTabs(leagueSlug, clanSlug)} current={pathname} />
      {children}
    </>
  )
}
