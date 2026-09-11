'use client'

/**
 * ★클랜 층 레이아웃 v3★ (2026-09-10 · 사장님 시안 · "바로덮기")
 *
 *   필 탭 (기록실 / 클랜원 / 지난시즌) → 클랜 카드 (띠 + 클랜 테마 KPI + 성향 육각형) → 본문
 *
 * 옛 판은 `./LayoutLegacy.tsx` 에 ★한 글자도 안 바꾸고★ 있다 (`CLAUDE.md` 1-4).
 * 되돌리려면 아래 `PROFILE_LAYOUT_V3` 를 false 로.
 */
import { use, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ClanCardV3, GhostButton, PillTabs, ProfileEmpty, ProfileSkeleton, RelativeTime, clanThemeOf, useSeasonLabel } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'
import { useRefresh } from '@/lib/useRefresh'
import { leagueClanTabs } from '@/lib/profileTabs'
import LegacyLayout from './LayoutLegacy'

const PROFILE_LAYOUT_V3: boolean = true

export default function LeagueClanLayout(props: {
  children: React.ReactNode
  params: Promise<{ leagueSlug: string; clanSlug: string }>
}) {
  if (!PROFILE_LAYOUT_V3) return <LegacyLayout {...props} />
  return <LayoutV3 {...props} />
}

function LayoutV3({ children, params }: { children: React.ReactNode; params: Promise<{ leagueSlug: string; clanSlug: string }> }) {
  const { leagueSlug, clanSlug } = use(params)
  const pathname = usePathname() ?? ''
  const ready = useApiReady()
  const detail = useQuery({
    queryKey: ['league', leagueSlug, 'clan', clanSlug, 'show'],
    queryFn: () => apiGet('leagueClanShow', { params: { leagueSlug, clanSlug } }),
    enabled: ready,
  })
  const clan = useQuery({
    queryKey: ['clan', clanSlug],
    queryFn: () => apiGet('clanShow', { params: { clanSlug } }),
    enabled: ready,
  })
  const refresh = useRefresh('clanRenew', { clanSlug })
  const season = useSeasonLabel()
  const renewedAt = refresh.renewedAt ?? clan.data?.data.renewed_at ?? null
  const data = detail.data?.data
  /* ‹ › 로 옮긴 칸 수 — 출발점은 «내 티어» (2026-09-11 회차 1: CHALLENGER 2 클랜인데 CHALLENGER 1 이 먼저 보였다) */
  const [tierStep, setTierStep] = useState(0)
  /* 구간 승률 — 상대전적을 상대 티어로 접는다. 계약에 있는 값만 더한다 */
  const tierWins = useMemo(() => {
    if (!data) return []
    const by = new Map<number, { division: number; win: number; lose: number }>()
    for (const r of data.head_to_head) {
      if (r.division === null) continue
      const acc = by.get(r.division) ?? { division: r.division, win: 0, lose: 0 }
      acc.win += r.win
      acc.lose += r.lose
      by.set(r.division, acc)
    }
    return [...by.values()].sort((a, b) => a.division - b.division)
  }, [data])
  const ownTierAt = Math.max(0, tierWins.findIndex((t) => t.division === data?.division))
  const tierIndex = tierWins.length === 0 ? 0 : (ownTierAt + tierStep + tierWins.length * 64) % tierWins.length
  return (
    <>
      {data ? (
        <div className="pc-container">
          <PillTabs tabs={leagueClanTabs(leagueSlug, clanSlug)} current={pathname} top={22} />
          <ClanCardV3
            data={data}
            infoHref={`/clan/${clanSlug}`}
            seasonLabel={`SEASON ${(season ?? 'CLOUD 0').toUpperCase()}`}
            memberCount={data.member_count ?? null}
            renewedNote={
              <span style={{ display: 'inline-flex', gap: 4 }}>
                <span>최근갱신</span>
                {refresh.state === 'failed' ? <span style={{ color: '#ff5a63' }}>갱신 실패</span> : renewedAt === null ? <span>기록 없음</span> : <span style={{ color: '#a4b0c8' }}><RelativeTime value={renewedAt} /></span>}
              </span>
            }
            renewAction={
              <GhostButton onClick={refresh.run} disabled={refresh.state === 'pending'} theme={clanThemeOf(data.clan.slug)}>
                {refresh.state === 'pending' ? '갱신중' : '전적갱신'}
              </GhostButton>
            }
            tierWins={tierWins}
            tierIndex={tierIndex}
            onTierStep={(dir) => setTierStep((i) => i + dir)}
          />
        </div>
      ) : detail.isPending && detail.fetchStatus === 'fetching' ? (
        <div className="pc-container pt-[40px]">
          <ProfileSkeleton rows={1} height={120} />
        </div>
      ) : (
        <div className="pc-container pt-[40px]">
          <ProfileEmpty message="클랜을 찾을 수 없습니다." />
        </div>
      )}
      {children}
    </>
  )
}
