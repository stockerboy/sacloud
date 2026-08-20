'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

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
 * 각 항목 앞에 아이콘이 붙고(`pr-2`), 현재 위치는 `nav-active`(굵게 + 3px 흰 밑줄)다.
 * 본문은 이 높이만큼 `pt-12`로 밀린다.
 */

const ITEM =
  'flex items-center justify-center cursor-pointer border-2 border-transparent px-4 text-tab-active-fg hover:border-b-nav-fg'

export function LeagueSubNav({ leagueSlug, leagueName }: { leagueSlug: string; leagueName: string }) {
  const pathname = usePathname() ?? ''
  const base = `/league/${leagueSlug}`

  const items = [
    { label: '리그홈', href: `${base}/home`, icon: <HomeIcon /> },
    { label: '클랜랭킹', href: `${base}/rank/clan`, icon: <ClanIcon /> },
    { label: '개인랭킹', href: `${base}/rank/player`, icon: <PlayerIcon /> },
  ]

  return (
    <div className="fixed top-nav z-30 h-12 w-full bg-subnav text-tab-active-fg shadow-inner">
      <div className="pc-container flex h-full items-stretch">
        <Link
          href={`${base}/home/info`}
          className="mr-14 flex w-52 items-center justify-center text-lg tracking-wider"
        >
          {leagueName}
        </Link>
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href === `${base}/home` ? `${base}/home/info` : item.href}
            className={`${ITEM} ${
              pathname.startsWith(item.href) ? 'border-b-[3px] border-b-white font-bold' : ''
            }`}
          >
            <span className="pr-2">{item.icon}</span>
            {item.label}
          </Link>
        ))}
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

function ClanIcon() {
  return (
    <svg viewBox="0 0 18 14" className="h-[14px] w-[18px]" fill="currentColor" aria-hidden>
      <path d="M0 12h4v2H0zM7 6h4v8H7zM14 9h4v5h-4z" />
    </svg>
  )
}

function PlayerIcon() {
  return (
    <svg viewBox="0 0 18 14" className="h-[14px] w-[18px]" fill="currentColor" aria-hidden>
      <circle cx="9" cy="4" r="3.2" />
      <path d="M2.5 14c0-3.6 2.9-5.6 6.5-5.6s6.5 2 6.5 5.6z" />
    </svg>
  )
}
