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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRefresh } from '@/lib/useRefresh'
import { PillTabs, PlayerHeaderV3, ProfileEmpty, ProfileSkeleton, mainWeaponFromStats, useSeasonLabel } from '@sacloud/ui'
import { leagueScreen } from '@sacloud/contract'
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
  /*
   * ★정보갱신★ (2026-09-21 사장님: 「정보갱신 버튼을 여기에도 만들어」).
   *
   *   누르면 병영을 읽어 ★닉네임과 소속★ 을 고친다. 고친 값이 화면에 바로 보이도록
   *   ★몇 번 나눠 다시 읽는다★ — 서버가 병영을 읽는 데 2~3초가 걸리기 때문이다.
   *   한 번만 읽으면 ★아직 안 고쳐진 값★ 을 받아 「안 됐네」 로 보인다.
   */
  /* ★끝날 때까지 기다렸다가 화면을 다시 그린다★ — 「되는 척」 을 없앤다 (2026-09-22) */
  const refresh = useRefresh(
    'playerRenew',
    { playerId },
    { statusPath: `/api/players/${playerId}/renew-status` },
  )
  const queryClient = useQueryClient()
  const onRenew = () => {
    refresh.run()
    for (const wait of [2500, 5000, 9000]) {
      window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['league', leagueSlug, 'player', playerId] })
      }, wait)
    }
  }
  return (
    /* `sac-player-page` — 선수 페이지만 컨테이너를 넓힌다 (2026-09-23 저녁 사장님 「카드 가로 조금 더」 · supply-skin.css) */
    <div className="sac-player-page">
      {data ? (
        <div className="pc-container">
          {/* ★킬데스는 리그가 정한다★ (2026-09-14) — 가리면 그 자리에 판수가 선다 */}
          <PlayerHeaderV3
            showsKd={leagueScreen(leagueSlug).playerColumns.kd}
            data={data}
            infoHref={`/player/${playerId}`}
            seasonLabel={`SEASON ${(season ?? 'CLOUD 0').toUpperCase()}`}
            mainWeapon={data.hex?.weapon ?? mainWeaponFromStats(data.weapon_stats)}
            report={report}
            onRenew={onRenew}
            renewing={refresh.state === 'pending'}
          />
          {/* 폰은 본문 안 탭(기록실 | 플레이분석)이 대신한다 (2026-09-23 오후 사장님 「육각을 지난시즌 대신」) — supply-skin.css `.sac-pilltabs-pc` */}
          <div className="sac-pilltabs-pc">
            <PillTabs tabs={leaguePlayerTabs(leagueSlug, playerId)} current={pathname} />
          </div>
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
