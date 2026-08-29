'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BETA_NOTICE, BETA_NOTICE_HEADLINE } from './betaNoticeText'

/**
 * 리그 화면 공통 서브내비 — 전역 GNB 바로 아래 고정된다.
 *
 * 원본 실측 구조
 * ```
 * <div class="fixed top-18 w-full h-12 z-30 bg-brownGray-900 shadow-inner text-gray-100">
 *   <div class="flex items-stretch pc-container h-full">
 *     <a class="flex items-center justify-center w-52 mr-14 tracking-wider text-lg">{리그명}</a>
 *     <a class="nav-item" href="/league/{slug}/home">      리그홈
 *     <a class="nav-item" href="/league/{slug}/rank/clan"> 클랜랭킹
 *     <a class="nav-item" href="/league/{slug}/rank/player">개인랭킹
 * ```
 * 실측: 높이 3rem(42px) · 배경 #292929 · 글자 #F3F4F6 · 리그명 칸 13rem(182px) + 오른쪽 여백 3.5rem
 * 각 항목 앞에 아이콘이 붙고(`pr-2`), 현재 위치는 `nav-active`다.
 * `nav-active` 실측(2026-08-27): 글자·밑줄 **주황 #F59E0B · 4px · 굵기 700**.
 * 예전에는 흰 글자 + 흰 3px 밑줄이었다 (UI_PARITY_AUDIT 2-4).
 * 본문은 이 높이만큼 `pt-12`로 밀린다.
 */

const ITEM =
  'flex items-center justify-center cursor-pointer border-b-4 border-b-transparent px-4 text-tab-active-fg'
const ITEM_ACTIVE = 'border-b-subnav-active font-bold text-subnav-active'

/**
 * 베타 시즌 배지.
 *
 * 베타는 **숨겨진 시즌이 아니라 공개 시즌**이다. 그래서 감추지 않고 표시하되,
 * 사이트 전체를 덮는 경고문으로 만들지 않는다 — 작은 배지 하나 + 설명이면 된다.
 *
 * 내부 번호가 0이라고 `Season 0`이라고 쓰지 않는다. 이름은 서버가 준 `season_label`이다 (D-098).
 */
export function BetaBadge({ label = BETA_NOTICE_HEADLINE }: { label?: string }) {
  return (
    <span
      className="ml-2 rounded border border-white/60 px-1.5 py-0.5 text-[11px] font-bold leading-none"
      title={BETA_NOTICE}
    >
      {label}
    </span>
  )
}

export function LeagueSubNav({
  leagueSlug,
  leagueName,
}: {
  leagueSlug: string
  leagueName: string
}) {
  const pathname = usePathname() ?? ''
  const base = `/league/${leagueSlug}`

  /* 아이콘은 원본이 클랜랭킹·개인랭킹 **둘 다 정렬 아이콘**을 쓴다 (2026-08-27 실측).
     우리는 막대그래프/사람으로 갈라 놓았었다 (UI_PARITY_AUDIT 2-7). */
  const items = [
    { label: '리그홈', href: `${base}/home`, icon: <HomeIcon /> },
    { label: '클랜랭킹', href: `${base}/rank/clan`, icon: <SortIcon /> },
    { label: '개인랭킹', href: `${base}/rank/player`, icon: <SortIcon /> },
  ]

  return (
    <div className="fixed top-nav z-30 w-full text-tab-active-fg shadow-inner">
      {/* --- PC: 리그명과 탭이 한 줄이다 (원본 실측 구조 그대로) --- */}
      <div className="hidden h-12 bg-subnav md:block">
        <div className="pc-container flex h-full items-stretch">
          {/*
            리그명 옆에 붙어 있던 `Beta Season` 배지는 **원본에 없다** — 뺐다
            (UI_PARITY_AUDIT 2-2 · 2-3). 배지에 밀려 리그명이 두 줄로 깨지기도 했다.
            `BetaBadge` 컴포넌트 자체는 관리자 화면 등에서 쓸 수 있어 남겨 둔다.
          */}
          <Link
            href={`${base}/home`}
            className="mr-14 flex w-52 items-center justify-center text-lg tracking-wider"
          >
            {leagueName}
          </Link>
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${ITEM} ${pathname.startsWith(item.href) ? ITEM_ACTIVE : ''}`}
            >
              <span className="pr-2">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      {/* --- 모바일: 두 줄이다. 리그명 줄 + 탭 줄 (2026-08-28 원본 관측) --- */}
      <div className="md:hidden">
        {/* 1줄 — 왼쪽 리그명, 오른쪽 `리그홈`(주황) */}
        <div className="flex h-12 items-center justify-between bg-ink px-3">
          <span className="truncate text-base tracking-wider">{leagueName}</span>
          <Link
            href={`${base}/home`}
            className="flex shrink-0 items-center gap-1.5 pl-3 text-subnav-active"
          >
            <HomeIcon />
            <span className="font-bold">리그홈</span>
          </Link>
        </div>

        {/* 2줄 — 탭 3개가 화면 폭을 균등 분할한다 */}
        <div className="flex h-12 items-stretch bg-subnav">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 items-center justify-center border-b-4 border-b-transparent text-base ${
                pathname.startsWith(item.href) ? ITEM_ACTIVE : 'text-tab-active-fg'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

/* 아이콘은 원본이 Font Awesome을 쓰지만 자산을 가져오지 않고 같은 크기로 새로 그렸다 (18×14) */

function HomeIcon() {
  return (
    <svg viewBox="0 0 18 14" className="h-[14px] w-[18px]" fill="currentColor" aria-hidden>
      <path d="M9 0 0 7h2.5v7h5V9.5h3V14h5V7H18z" />
    </svg>
  )
}

/** 정렬 아이콘 — 원본은 클랜랭킹·개인랭킹에 **같은** 아이콘을 쓴다 (2026-08-27 실측) */
function SortIcon() {
  return (
    <svg viewBox="0 0 18 14" className="h-[14px] w-[18px]" fill="currentColor" aria-hidden>
      <path d="M4 0h1.6v10.4L8 8l1.1 1.1-4.3 4.3-4.3-4.3L1.6 8l2.4 2.4z" />
      <path d="M11 1h7v1.6h-7zM11 5h5.5v1.6H11zM11 9h4v1.6h-4z" />
    </svg>
  )
}
