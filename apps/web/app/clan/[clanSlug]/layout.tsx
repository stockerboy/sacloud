'use client'

import { use } from 'react'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ClanIdentity, ClanProfileNav, ProfileSkeleton } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/**
 * 클랜 프로필 공통 — 신원 띠 + 탭(리그정보 / 클랜원).
 *
 * 탭이 가는 곳은 그대로다: `/clan/{slug}` · `/clan/{slug}/player`.
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
        /* `slug` 는 「알」이 깨졌는지 물어보는 데 쓴다 (`docs/EGG_SYSTEM_SPEC.md`) */
        <ClanIdentity
          name={clan.data.data.name}
          slug={clan.data.data.slug}
          mark={clan.data.data.mark}
          master={clan.data.data.master}
          establishedAt={clan.data.data.established_at}
          memberCount={clan.data.data.member_count}
        />
      ) : (
        <div className="pc-container pt-[40px]">
          <ProfileSkeleton rows={1} height={120} />
        </div>
      )}
      <ClanProfileNav tabs={tabs} current={pathname} />
      {children}
    </>
  )
}
