'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ClanLeagueList } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/** 클랜 리그정보 탭 — 참여중인 리그. 가는 곳은 그대로 `/league/{slug}/clan/{slug}` 다 */
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
    <div className="pc-container pb-[40px]">
      <ClanLeagueList
        clanSlug={clanSlug}
        entries={leagues.data?.data}
        loading={!leagues.data}
      />
    </div>
  )
}
