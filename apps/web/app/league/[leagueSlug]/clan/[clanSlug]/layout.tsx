'use client'

/**
 * ★클랜 층 레이아웃 v3★ (2026-09-10 · 사장님 시안 · "바로덮기")
 *
 *   필 탭 (기록실 / 클랜원 / 지난시즌) → 클랜 카드 (띠 + 클랜 테마 KPI + 성향 육각형) → 본문
 *
 * 옛 판은 `./LayoutLegacy.tsx` 에 ★한 글자도 안 바꾸고★ 있다 (`CLAUDE.md` 1-4).
 * 되돌리려면 아래 `PROFILE_LAYOUT_V3` 를 false 로.
 */
import { use, useEffect, useMemo, useState } from 'react'
import { tierGroupOf } from '@sacloud/contract'
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
  /**
   * ★들어오면 맨 위부터★ (2026-09-13 사장님).
   *
   * > «클랜페이지 들어왔을때 (…) 맨위에서 시작하는게 아니라 살짝 내려와있어
   * >  클랜페이지 들어오면 가장 먼저 보이는게 육각이야 클랜명이 보이는게 아니라»
   *
   * ── 왜 브라우저에 맡기면 안 되나
   *   이 화면은 ★들어온 뒤에 자란다★ — 클랜 정보와 경기 목록이 따로 와서 붙는다.
   *   그 사이 브라우저의 ★스크롤 앵커링★ 과 iOS 사파리의 ★스크롤 복원★ 이
   *   「보고 있던 자리」를 지키려고 화면을 도로 내린다. 그래서 클랜 이름이 위로 밀려
   *   나가고 육각형부터 보인다.
   *
   * ── 무엇을 하나
   *   ★클랜이 바뀔 때 한 번★ 맨 위로 올린다 (`clanSlug` 가 열쇠다).
   *   같은 클랜 안에서 탭을 옮기거나(기록실 → 클랜원) 카드를 펼칠 때는 ★안 건드린다★ —
   *   보고 있던 자리가 튀면 그게 더 나쁘다.
   *   `pageshow` 도 같이 듣는다. 뒤로 가기로 되살아난 화면(bfcache)은 `useEffect` 가
   *   다시 돌지 않아서, 그 길로 들어오면 여전히 내려가 있다.
   */
  useEffect(() => {
    const toTop = () => window.scrollTo(0, 0)
    toTop()
    window.addEventListener('pageshow', toTop)
    return () => window.removeEventListener('pageshow', toTop)
  }, [clanSlug])

  /* ★끝날 때까지 기다렸다가 화면을 다시 그린다★ (2026-09-22 사장님) */
  const refresh = useRefresh(
    'clanRenew',
    { clanSlug },
    { statusPath: `/api/clans/${clanSlug}/renew-status` },
  )
  const season = useSeasonLabel()
  const renewedAt = refresh.renewedAt ?? clan.data?.data.renewed_at ?? null
  const data = detail.data?.data
  /* ‹ › 로 옮긴 칸 수 — 출발점은 «내 티어» (2026-09-11 회차 1: CHALLENGER 2 클랜인데 CHALLENGER 1 이 먼저 보였다) */
  const [tierStep, setTierStep] = useState(0)
  /* 구간 승률 — 상대전적을 상대 티어로 접는다. 계약에 있는 값만 더한다 */
  const tierWins = useMemo(() => {
    if (!data) return []
    /*
     * ⚠ ★2026-09-13 — CHALLENGER 를 한 칸으로★ (사장님: «challenger1,2 없애고 통일»).
     *   옛 판은 `r.division` 으로 나눠서 «CHALLENGER» 칸이 ★두 개★ 나왔다 —
     *   ‹ › 로 넘겨도 같은 이름이 두 번 나와 무엇이 다른지 알 수 없었다.
     *   묶는 규칙은 계약의 `tierGroupOf` 한 곳이다.
     *   보여 줄 번호는 ★그 무리의 대표★ (챌린저면 2) 를 쓴다.
     */
    const by = new Map<number, { division: number; win: number; lose: number }>()
    for (const r of data.head_to_head) {
      if (r.division === null) continue
      const key = tierGroupOf(r.division) === 1 ? 1 : 2
      const acc = by.get(key) ?? { division: key, win: 0, lose: 0 }
      acc.win += r.win
      acc.lose += r.lose
      by.set(key, acc)
    }
    return [...by.values()].sort((a, b) => a.division - b.division)
  }, [data])
  const ownTierAt = Math.max(0, tierWins.findIndex((t) => t.division === (data ? (tierGroupOf(data.division) === 1 ? 1 : 2) : 0)))
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
            /* ★2026-09-12 사장님★ — 「플레이스타일」 탭을 없애고 육각형을 카드 왼쪽으로 데려왔다.
               옛 판은 여기가 false 였고 탭이 그렸다 (2026-09-11) */
            showHexagon
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
