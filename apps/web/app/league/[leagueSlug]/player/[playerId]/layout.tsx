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
     * ⚠ ★★2026-09-03 · 껍데기를 벗겼다 — 사장님이 「오바쌈바」로 폐기하셨다★★
     *
     * > «★아 봤는데 진짜 오바쌈바임★ 걍 ui 디자인 명시 다시줄게 (…)
     * >  ★그냥 지금 우리 홈페이지랑 어울리는걸로 갈건데★»
     *
     * ★금속 콘솔 톤을 버리셨다.★ 새 기준은 ★「지금 사이트와 어울리는 것」★ 이다.
     * ★클래스만 뗐다★ — 아래 것들은 ★그대로 남아 있다★ (`CLAUDE.md` 1-4):
     * ```
     * `.sa-skin` CSS 블록 · `--color-sa-*` 토큰      packages/ui/src/styles.css
     * 대비 검사 56개                                 sa-contrast.test.ts
     * ★그 검사는 새 톤에도 걸려야 한다★ — 「무엇 위에 놓였느냐」를 재는 법이 거기 있다
     * ```
     * ★되살리려면 이 `<div>` 에 `className="sa-skin"` 한 개를 붙이면 된다.★
     *
     * ── 그때 알아낸 것 (되살리든 안 되살리든 ★사실로 남는다★)
     *   ★머리띠와 탭이 본문 밖이다★ — 본문에만 톤을 씌우면
     *   ★위는 파란 띠, 아래는 딴 톤★ 으로 갈린다. ★layout 째로 감싸야 한다★
     */
    <div>
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
