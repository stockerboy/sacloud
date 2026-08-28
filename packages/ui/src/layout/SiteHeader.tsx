'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  FEATURED_LEAGUES,
  MOBILE_NAV_GROUPS,
  PRIMARY_NAV,
  type NavGroup,
  type NavLink,
} from '../site-config'
import { NavLogo } from './BrandLogo'

/**
 * 전역 상단 GNB.
 *
 * 원본 실측 구조 (2026-08-20)
 * ```
 * <nav class="fixed w-full top-0 h-18 z-50 bg-black">   높이 63px(4.5rem), 배경 #000
 *   <div class="pc-container h-full flex items-stretch">
 *     <div class="flex-grow flex items-stretch">        로고 + 대표리그 3 + 리그 + 게시판
 *     <div class="flex-grow flex justify-end relative"> 로그인
 * ```
 * - `.nav-item` : flex / items-center / justify-center / border 2px transparent / padding 0 1rem / color #E5E7EB
 *   hover 시 아래 테두리만 #E5E7EB 로 바뀐다
 * - `.nav-active`(리그·게시판) : font-weight 700 + 아래 테두리 3px 흰색
 * - `.league-nav-active`(대표 리그) : 테두리 없음 + 배경 #292929
 * - 홈(`/`)에서는 좌측 로고가 숨겨진다 (원본 `routerLinkActive="hidden"`)
 * - 로그인 링크는 현재 경로를 `returnUrl` 로 붙여서 이동한다
 */

const NAV_ITEM =
  'flex items-center justify-center cursor-pointer border-2 border-transparent px-4 text-nav-fg hover:border-b-nav-fg'

export interface SiteHeaderProps {
  featuredLeagues?: readonly NavLink[]
  primaryNav?: readonly NavLink[]
  /** 모바일 서랍의 묶음 구성. 원본 서랍은 `홈`/`리그`/`게시판` 으로 나뉜다 */
  navGroups?: readonly NavGroup[]
  /** 로그인한 사용자. null이면 `로그인` 링크를 보여준다 (원본 동작) */
  user?: { nickname: string } | null
  onLogout?: () => void
}

export function SiteHeader({
  featuredLeagues = FEATURED_LEAGUES,
  primaryNav = PRIMARY_NAV,
  navGroups = MOBILE_NAV_GROUPS,
  user = null,
  onLogout,
}: SiteHeaderProps) {
  const pathname = usePathname() ?? '/'
  const loginHref = `/auth/login?returnUrl=${encodeURIComponent(pathname)}`
  const [open, setOpen] = useState(false)

  /* 화면을 옮기면 서랍을 닫는다. 열어 둔 채로 넘어가면 새 화면을 가린다 */
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <nav className="fixed top-0 z-50 h-nav w-full bg-ink">
      <div className="pc-container flex h-full items-stretch">
        {/* --- 모바일: 햄버거. 원본 모바일은 1단에 이것과 로그인만 둔다 --- */}
        <button
          type="button"
          aria-label="메뉴"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center px-2 text-nav-fg md:hidden"
        >
          <MenuIcon />
        </button>

        <div className="hidden flex-grow items-stretch md:flex">
          {/* 홈에서는 숨긴다 — 홈은 본문 가운데에 큰 로고가 있다 */}
          <Link
            href="/"
            aria-label="홈"
            className={`flex items-center justify-center px-4 ${pathname === '/' ? 'hidden' : ''}`}
          >
            <NavLogo className="max-h-7" />
          </Link>

          {featuredLeagues.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${NAV_ITEM} ${
                isActive(pathname, item.href) ? 'border-none bg-nav-active' : ''
              }`}
            >
              {item.label}
            </Link>
          ))}

          {primaryNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${NAV_ITEM} ${
                isActive(pathname, item.href) ? 'border-b-[3px] border-b-white font-bold' : ''
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>

        {/* 모바일에서는 가운데를 비워 둔다 — 원본 1단에는 로고가 없다 */}
        <div className="flex-grow md:hidden" />

        <div className="relative flex justify-end md:flex-grow">
          {user ? (
            <>
              <Link href="/me" className={`${NAV_ITEM} max-md:px-2`}>
                <span className="hidden md:inline">{user.nickname}</span>
                <span className="md:hidden">
                  <AccountIcon />
                </span>
              </Link>
              <button type="button" onClick={onLogout} className={`${NAV_ITEM} max-md:hidden`}>
                로그아웃
              </button>
            </>
          ) : (
            <Link href={loginHref} aria-label="로그인" className={`${NAV_ITEM} max-md:px-2`}>
              <span className="hidden md:inline">로그인</span>
              <span className="md:hidden">
                <LoginIcon />
              </span>
            </Link>
          )}
        </div>
      </div>

      {/*
        --- 모바일 서랍 ---

        원본 모바일 서랍은 **제목이 붙은 묶음**이다 (2026-08-28 원본 관측).
        `홈` / `리그` / `게시판` 묶음이 있고, `리그` 묶음 안에 리그들이 들어간다.
        제목 줄은 아이콘 + 회색 글씨이고, 항목은 그 아래 들여쓰기 없이 이어진다.
      */}
      {open ? (
        <div className="bg-card pb-2 md:hidden">
          {navGroups.map((group) => (
            <div key={group.label} className="border-b border-divider py-2">
              <div className="flex items-center gap-2 px-4 py-2 font-bold text-ink">
                {group.label}
              </div>
              {group.items.map((item) => (
                <Link
                  key={`${group.label}:${item.href}`}
                  href={item.href}
                  className={`block px-6 py-3 text-meta ${
                    isActive(pathname, item.href) ? 'bg-row font-bold text-ink' : ''
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
          {user ? (
            <button
              type="button"
              onClick={onLogout}
              className="block w-full px-4 py-3 text-left text-meta"
            >
              로그아웃
            </button>
          ) : null}
        </div>
      ) : null}
    </nav>
  )
}

/* 아이콘은 원본 자산을 가져오지 않고 같은 크기로 새로 그렸다 (CLAUDE.md 3장 4번) */

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
      <rect x="2" y="5" width="20" height="2.2" rx="1.1" />
      <rect x="2" y="11" width="20" height="2.2" rx="1.1" />
      <rect x="2" y="17" width="20" height="2.2" rx="1.1" />
    </svg>
  )
}

function LoginIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
      <path d="M12 3.2h7.2c.9 0 1.6.7 1.6 1.6v14.4c0 .9-.7 1.6-1.6 1.6H12v-2h6.8V5.2H12z" />
      <path d="M9.9 7.6 8.5 9l2 2H3.2v2h7.3l-2 2 1.4 1.4L14.3 12z" />
    </svg>
  )
}

function AccountIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20.5c0-3.6 3.6-5.5 8-5.5s8 1.9 8 5.5z" />
    </svg>
  )
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
