'use client'

/**
 * ★선수 층 레이아웃 v3★ (2026-09-10 · 사장님 시안 · "바로덮기")
 *
 *   선수 카드 (띠 + 클랜 테마 KPI 4칸) → 필 탭 (기록실 / 지난시즌) → 본문
 *
 * 옛 판은 `./LayoutLegacy.tsx` 에 ★한 글자도 안 바꾸고★ 있다 (`CLAUDE.md` 1-4).
 * 되돌리려면 아래 `PROFILE_LAYOUT_V3` 를 false 로.
 */
import { use } from 'react'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { PillTabs, PlayerHeaderV3, ProfileEmpty, ProfileSkeleton, mainWeaponFromStats, useSeasonLabel } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'
import { leaguePlayerTabs } from '@/lib/profileTabs'
import { usePlayerReport } from '@/lib/usePlayerReport'
import LegacyLayout from './LayoutLegacy'

const PROFILE_LAYOUT_V3: boolean = true

export default function LeaguePlayerLayout(props: {
  children: React.ReactNode
  params: Promise<{ leagueSlug: string; playerId: string }>
}) {
  if (!PROFILE_LAYOUT_V3) return <LegacyLayout {...props} />
  return <LayoutV3 {...props} />
}

function LayoutV3({ children, params }: { children: React.ReactNode; params: Promise<{ leagueSlug: string; playerId: string }> }) {
  const { leagueSlug, playerId } = use(params)
  const pathname = usePathname() ?? ''
  const ready = useApiReady()
  const detail = useQuery({
    queryKey: ['league', leagueSlug, 'player', playerId],
    queryFn: () => apiGet('leaguePlayerShow', { params: { leagueSlug, playerId } }),
    enabled: ready,
  })
  const data = detail.data?.data
  const season = useSeasonLabel()
  /* 핵의심은 머리 카드 안에 있다 (2026-09-11 목업) — 훅은 조건 없이 부른다 */
  const report = usePlayerReport(playerId, data?.report_count ?? 0)
  return (
    <div>
      {data ? (
        <div className="pc-container">
          <PlayerHeaderV3
            data={data}
            infoHref={`/player/${playerId}`}
            seasonLabel={`SEASON ${(season ?? 'CLOUD 0').toUpperCase()}`}
            mainWeapon={data.hex?.weapon ?? mainWeaponFromStats(data.weapon_stats)}
            report={report}
          />
          <PillTabs tabs={leaguePlayerTabs(leagueSlug, playerId)} current={pathname} />
        </div>
      ) : detail.isPending && detail.fetchStatus === 'fetching' ? (
        <div className="pc-container pt-[40px]">
          <ProfileSkeleton rows={1} height={120} />
        </div>
      ) : (
        <div className="pc-container pt-[40px]">
          <ProfileEmpty message="선수를 찾을 수 없습니다." />
        </div>
      )}
      {children}
    </div>
  )
}
