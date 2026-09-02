'use client'

import { use } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ClanIdentity, ClanProfileNav, ProfileEmpty, ProfileSkeleton } from '@sacloud/ui'
import { CLAIM_DOORS_OPEN } from '@sacloud/contract'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/**
 * 클랜 프로필 공통 — 신원 띠 + 탭(리그정보 / 클랜원).
 *
 * 탭이 가는 곳은 그대로다: `/clan/{slug}` · `/clan/{slug}/player`.
 */
export default function ClanLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ clanSlug: string }>
}) {
  const { clanSlug } = use(params)
  const pathname = usePathname() ?? ''
  const ready = useApiReady()

  const clan = useQuery({
    queryKey: ['clan', clanSlug],
    queryFn: () => apiGet('clanShow', { params: { clanSlug } }),
    enabled: ready,
  })

  const tabs = [
    { label: '리그정보', href: `/clan/${clanSlug}` },
    { label: '클랜원', href: `/clan/${clanSlug}/player` },
  ]

  return (
    <>
      {/*
        * ★로딩과 실패를 구분한다★ (2026-09-03 · O-033 · D-117 과 같은 방식)
        *
        * 전에는 `clan.data ? … : 스켈레톤` 하나였다. 조회가 404 나 500 을 내면
        * `data` 가 영영 안 채워지고 **화면이 영원히 로딩 중**으로 남는다.
        * 강민재가 실제로 그 화면을 봤다 — **아무 말도 없는 빈 상자**였다.
        *
        * 리그 선수 화면은 D-117 에서 이미 이걸 고쳤다. **클랜 쪽만 안 고쳐져 있었다.**
        * 새 방식을 만들지 않고 그쪽 모양을 그대로 가져온다.
        *
        * ```
        * 지금 받아오는 중   → 스켈레톤 (예전 그대로)
        * 그 외에 값이 없다  → ★말을 한다★
        * ```
        *
        * ── ★`isPending` 하나로는 모자라다★ (실제로 겪었다)
        *
        *   `isPending` 은 **「멈춰 있는 것」도 참**이다. 조회가 실패해서 재시도를 기다리는데
        *   그때 연결이 끊겨 있으면 react-query 가 재시도를 **`paused`** 로 세워 둔다 —
        *   그러면 `isPending` 이 영영 참이고 **화면은 다시 영원한 스켈레톤**이 된다.
        *   2026-09-03 에 없는 클랜으로 시험하다 이걸 그대로 봤다.
        *   ```
        *   pending=true error=false data=no status=pending fetch=paused
        *   ```
        *   그래서 **「지금 실제로 받아오는 중」일 때만** 스켈레톤을 그린다.
        */}
      {clan.isPending && clan.fetchStatus === 'fetching' ? (
        <div className="pc-container pt-[40px]">
          <ProfileSkeleton rows={1} height={120} />
        </div>
      ) : clan.data ? (
        /* `slug` 는 「알」이 깨졌는지 물어보는 데 쓴다 (`docs/EGG_SYSTEM_SPEC.md`) */
        <ClanIdentity
          name={clan.data.data.name}
          slug={clan.data.data.slug}
          mark={clan.data.data.mark}
          master={clan.data.data.master}
          establishedAt={clan.data.data.established_at}
          memberCount={clan.data.data.member_count}
        />
      ) : (
        <div className="pc-container pt-[40px]">
          <ProfileEmpty message="클랜을 불러오지 못했습니다." />
        </div>
      )}
      <ClanProfileNav tabs={tabs} current={pathname} />
      {/* 마스터 인증 입구 (2026-09-01 · D-253).
          탭으로 만들지 않았다 — 탭은 **볼 것**이고 이것은 **할 것**이다.
          비로그인에게도 보인다. 누르면 로그인으로 보내는 것이 「왜 안 보이지」보다 낫다.

          ── ★2026-09-03 (O-024) — 링크를 내렸다★
            **승인할 사람이 자리에 없다** (`O-008` ⑥). 신청 버튼만 보이면 사람은 누르고
            기다리는데 아무도 안 온다. 그건 「기능이 없는 것」보다 나쁘다.
            ⚠ **화면·라우트는 그대로 산다.** 주소를 직접 치면 열린다.
              `CLAIM_DOORS_OPEN` 을 `true` 로 되돌리면 이 줄이 그대로 돌아온다 */}
      {CLAIM_DOORS_OPEN ? (
        <div className="pc-container mt-3 flex justify-end">
          <Link href={`/clan/${clanSlug}/master`} className="text-[12px] text-meta hover:text-text">
            <span>마스터 인증하기</span>
          </Link>
        </div>
      ) : null}
      {children}
    </>
  )
}
