'use client'

import { use } from 'react'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { LeaguePlayerRecordHeader, ProfileEmpty, ProfileNav, ProfileSkeleton } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'
import { leaguePlayerTabs } from '@/lib/profileTabs'

/**
 * 리그 선수 화면 공통 — 헤더 + 탭.
 *
 * 클랜과 달리 `전적갱신` · `최근갱신` 이 **없다** (원본 실측).
 * 선수 화면의 갱신 버튼은 전역 프로필 `/player/{id}` 의 `정보갱신` 뿐이다.
 */
/*
 * ★로딩과 「없음」을 구분한다★ (2026-09-03 · O-008 ④ · O-033 ② 와 같은 처방).
 *
 * 전에는 `data ? 머리띠 : 스켈레톤` 하나였다. 없는 주소로 들어가면 `data` 가 영영
 * 안 채워지고 **화면이 영원히 로딩 중**으로 남는다. 운영에서 실제로 그랬다 —
 * 「없습니다」도 없는 **빈 상자**였다.
 *
 * ⚠ `isPending` 하나로는 모자란다 — **멈춰 있는 것도 참**이다.
 *   연결이 끊겨 재시도가 `paused` 로 서면 `isPending` 이 영영 참이다.
 *   그래서 **「지금 실제로 받아오는 중」일 때만** 스켈레톤을 그린다.
 */
export default function LeaguePlayerLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ leagueSlug: string; playerId: string }>
}) {
  const { leagueSlug, playerId } = use(params)
  const pathname = usePathname() ?? ''
  const ready = useApiReady()

  const detail = useQuery({
    queryKey: ['league', leagueSlug, 'player', playerId],
    queryFn: () => apiGet('leaguePlayerShow', { params: { leagueSlug, playerId } }),
    enabled: ready,
  })

  const data = detail.data?.data

  return (
    /*
     * ★`sa-skin` — 시안 톤 껍데기★ (O-050 2단계 · 2026-09-03).
     *
     * ⚠ ★처음에는 본문(`page` 쪽)에만 씌웠다. 그게 틀렸다★ —
     *   ★머리띠와 탭이 껍데기 밖★ 이라 자기 배경(`--color-player-header` #2c304c)을
     *   그대로 칠했다. 화면이 ★위에서부터 파란 띠 → 파란 탭 → 갑자기 검정 무광 본문★ 이었다.
     *   ★사장님이 제일 먼저 보실 자리다.★ 그래서 ★layout 째로 감싼다.★
     *
     * ⚠ ★이 클래스 하나가 경계다.★ 안쪽만 시안 값으로 다시 칠해지고 ★바깥은 그대로다.★
     *   「이 톤 아니다」가 나오면 ★이 클래스만 지우면 원래 화면이다★ (CLAUDE.md 1-4).
     *   자세한 것은 `packages/ui/src/styles.css` 의 `.sa-skin` 주석.
     */
    <div className="sa-skin">
      {data ? (
        <LeaguePlayerRecordHeader
          leagueName={data.league.name}
          name={data.player.name}
          infoHref={`/player/${playerId}`}
          clan={data.clan}
          rank={data.rank}
          /* 포지션 (D-199). 판정이 없으면 헤더가 그 줄을 그리지 않는다 */
          position={data.position_label}
        />
      ) : detail.isPending && detail.fetchStatus === 'fetching' ? (
        <div className="pc-container pt-[40px]">
          <ProfileSkeleton rows={1} height={120} />
        </div>
      ) : (
        <div className="pc-container pt-[40px]">
          <ProfileEmpty message="선수를 찾을 수 없습니다." />
        </div>
      )}
      <ProfileNav tabs={leaguePlayerTabs(leagueSlug, playerId)} current={pathname} />
      {children}
    </div>
  )
}
