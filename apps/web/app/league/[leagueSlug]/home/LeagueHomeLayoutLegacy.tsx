'use client'

import { use } from 'react'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { LeagueHeader, LeagueHomeTabs, Skeleton } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/**
 * ⚠ **옛 판이다. 지금 아무 화면도 이것을 쓰지 않는다** (2026-09-01 · D-251).
 *
 * 사용자 지시로 리그 탭에서 「리그홈」을 없앴다 —
 * *"리그홈은 다 없애고 클랜랭킹이랑 개인랭킹만 해"*.
 * 파일을 지우지 않고 이름만 바꿔 남겨 뒀다 (`CLAUDE.md` 10-4).
 * 되살리려면 이 파일을 다시 `layout.tsx` 로 되돌리고, 지금의 `layout.tsx`(리다이렉트)를
 * 치우면 된다. `info/page.tsx` · `desc/page.tsx` 는 **한 글자도 안 건드렸다.**
 *
 * ── 원래 설명
 * 리그홈 공통 — 리그 헤더 + 리그정보/리그소개 탭.
 * `pc-container` 안에 헤더 → 탭 → 내용 순으로 놓는다.
 */
export default function LeagueHomeLayoutLegacy({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ leagueSlug: string }>
}) {
  const { leagueSlug } = use(params)
  const pathname = usePathname() ?? ''
  const ready = useApiReady()
  const current = pathname.endsWith('/desc') ? 'desc' : 'info'

  const league = useQuery({
    queryKey: ['league', leagueSlug],
    queryFn: () => apiGet('leagueShow', { params: { leagueSlug } }),
    enabled: ready,
  })

  return (
    <div className="pc-container mt-[var(--section-gap)] pb-16">
      {league.data ? (
        <LeagueHeader league={league.data.data} />
      ) : (
        <div className="border-b border-line bg-card px-8 py-10 max-md:px-4">
          <Skeleton className="h-[35px] w-96 max-w-full" />
        </div>
      )}
      {/*
        `Beta Season` 안내 박스는 사용자 화면에 그리지 않는다. 헤더 바로 다음이 탭이다.
        `BetaNotice` 컴포넌트와 문구 상수는 관리자 화면 등에서 쓸 수 있어 남겨 둔다.
      */}
      <LeagueHomeTabs leagueSlug={leagueSlug} current={current} />
      <div>{children}</div>
    </div>
  )
}
