'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ProfileTabs, SeasonTable } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/** 지난시즌 `/league/{slug}/clan/{slug}/season`. */
export default function LeagueClanSeasonPage({
  params,
}: {
  params: Promise<{ leagueSlug: string; clanSlug: string }>
}) {
  const { leagueSlug, clanSlug } = use(params)
  const ready = useApiReady()

  const detail = useQuery({
    queryKey: ['league', leagueSlug, 'clan', clanSlug, 'show'],
    queryFn: () => apiGet('leagueClanShow', { params: { leagueSlug, clanSlug } }),
    enabled: ready,
  })

  const seasons = useQuery({
    queryKey: ['leagueclan', detail.data?.data.id, 'seasons'],
    queryFn: () =>
      apiGet('leagueClanSeasons', { params: { leagueClanId: detail.data!.data.id } }),
    enabled: ready && !!detail.data,
  })

  const base = `/league/${leagueSlug}/clan/${clanSlug}`
  const tabs = [
    { label: '기본정보', href: `/clan/${clanSlug}` },
    { label: '기록실', href: base },
    { label: '지난시즌', href: `${base}/season` },
  ]

  return (
    <>
      <ProfileTabs tabs={tabs} current={`${base}/season`} />
      <div className="pc-container mt-6 pb-10">
        <SeasonTable seasons={seasons.data?.data} kind="clan" />
      </div>
    </>
  )
}
