'use client'

import { use } from 'react'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ClanHeader, ProfileTabs, Skeleton } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/**
 * 클랜 프로필 공통 — 헤더 + 리그정보/클랜원 탭.
 * 원본 탭: `/clan/{slug}` (리그정보), `/clan/{slug}/player` (클랜원).
 */
export default function ClanLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ clanSlug: string }>
}) {
  const { clanSlug } = use(params)
  const pathname = usePathname() ?? ''
  const ready = useApiReady()

  const clan = useQuery({
    queryKey: ['clan', clanSlug],
    queryFn: () => apiGet('clanShow', { params: { clanSlug } }),
    enabled: ready,
  })

  const tabs = [
    { label: '리그정보', href: `/clan/${clanSlug}` },
    { label: '클랜원', href: `/clan/${clanSlug}/player` },
  ]

  return (
    <>
      {clan.data ? (
        <ClanHeader
          name={clan.data.data.name}
          mark={clan.data.data.mark}
          master={clan.data.data.master}
          establishedAt={clan.data.data.established_at}
        />
      ) : (
        <div className="mt-5 h-52 bg-clan-header py-10 max-md:mt-0 max-md:h-auto max-md:py-5">
          <div className="pc-container">
            <Skeleton className="h-[51px] w-96 max-w-full" />
          </div>
        </div>
      )}
      <ProfileTabs tabs={tabs} current={pathname} />
      {children}
    </>
  )
}
