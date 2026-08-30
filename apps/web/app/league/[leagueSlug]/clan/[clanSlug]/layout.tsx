'use client'

import { use } from 'react'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { LeagueClanRecordHeader, ProfileNav, ProfileSkeleton } from '@sacloud/ui'
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
          divisionCount={data.league.division_count}
          rank={data.rank}
          renewedAt={refresh.renewedAt ?? clan.data?.data.renewed_at ?? null}
          refreshState={refresh.state}
          onRefresh={refresh.run}
        />
      ) : (
        <div className="pc-container pt-[40px]">
          <ProfileSkeleton rows={1} height={120} />
        </div>
      )}
      <ProfileNav tabs={leagueClanTabs(leagueSlug, clanSlug)} current={pathname} />
      {children}
    </>
  )
}
