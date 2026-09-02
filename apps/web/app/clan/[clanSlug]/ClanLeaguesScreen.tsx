'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ClanLeagueList, ProfileEmpty } from '@sacloud/ui'
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

  /*
   * ★실패를 로딩으로 그리지 않는다★ (2026-09-03 · O-033 · D-117 과 같은 방식)
   *
   * 전에는 `loading={!leagues.data}` 하나였다. 조회가 깨지면 `data` 가 영영 없으니
   * **영원히 로딩 중**이 된다. 사람은 기다리다 나간다 — 무엇이 잘못됐는지 못 듣는다.
   */
  /* `isPending` 은 「멈춰 있는 것」도 참이다 — 자세한 이유는 `layout.tsx` 에 적었다.
     「지금 실제로 받아오는 중」만 로딩으로 친다 */
  const loading = leagues.isPending && leagues.fetchStatus === 'fetching'

  if (!loading && !leagues.data) {
    return (
      <div className="pc-container pb-[40px] pt-[40px]">
        <ProfileEmpty message="참여중인 리그를 불러오지 못했습니다." />
      </div>
    )
  }

  return (
    <div className="pc-container pb-[40px]">
      <ClanLeagueList
        clanSlug={clanSlug}
        entries={leagues.data?.data}
        loading={loading}
      />
    </div>
  )
}
