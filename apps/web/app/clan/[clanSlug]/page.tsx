'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ClanLeagueCards } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/** 클랜 리그정보 탭 — 참여중인 리그 카드. */
export default function ClanLeaguesPage({
  params,
}: {
  params: Promise<{ clanSlug: string }>
}) {
  const { clanSlug } = use(params)
  const ready = useApiReady()

  const leagues = useQuery({
    queryKey: ['clan', clanSlug, 'leagues'],
    queryFn: () => apiGet('clanLeagues', { params: { clanSlug } }),
    enabled: ready,
  })

  return (
    <div className="pc-container mt-6">
      <div className="mb-2 text-2xl">참여중인 리그</div>
      <ClanLeagueCards
        clanSlug={clanSlug}
        entries={leagues.data?.data}
        loading={!leagues.data}
      />
    </div>
  )
}
