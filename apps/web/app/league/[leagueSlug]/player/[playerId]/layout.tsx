'use client'

import { use } from 'react'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { LeaguePlayerRecordHeader, ProfileTabs, Skeleton } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'
import { leaguePlayerTabs } from '@/lib/profileTabs'

/**
 * 리그 선수 화면 공통 — 헤더 + 탭.
 *
 * 클랜과 달리 `전적갱신` · `최근갱신` 이 **없다** (원본 실측).
 * 선수 화면의 갱신 버튼은 전역 프로필 `/player/{id}` 의 `정보갱신` 뿐이다.
 */
export default function LeaguePlayerLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ leagueSlug: string; playerId: string }>
}) {
  const { leagueSlug, playerId } = use(params)
  const pathname = usePathname() ?? ''
  const ready = useApiReady()

  const detail = useQuery({
    queryKey: ['league', leagueSlug, 'player', playerId],
    queryFn: () => apiGet('leaguePlayerShow', { params: { leagueSlug, playerId } }),
    enabled: ready,
  })

  const data = detail.data?.data

  return (
    <>
      {data ? (
        <LeaguePlayerRecordHeader
          leagueName={data.league.name}
          name={data.player.name}
          infoHref={`/player/${playerId}`}
          clan={data.clan}
          rank={data.rank}
        />
      ) : (
        <div className="mt-5 h-56 bg-player-header py-10 max-md:mt-0 max-md:h-auto max-md:py-5">
          <div className="pc-container">
            <Skeleton className="h-[51px] w-96 max-w-full" />
          </div>
        </div>
      )}
      <ProfileTabs tabs={leaguePlayerTabs(leagueSlug, playerId)} current={pathname} />
      {children}
    </>
  )
}
