'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FEATURED_LEAGUES, PRIMARY_NAV, type NavLink } from '../site-config'
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
  /** 로그인한 사용자. null이면 `로그인` 링크를 보여준다 (원본 동작) */
  user?: { nickname: string } | null
  onLogout?: () => void
}

export function SiteHeader({
  featuredLeagues = FEATURED_LEAGUES,
  primaryNav = PRIMARY_NAV,
  user = null,
  onLogout,
}: SiteHeaderProps) {
  const pathname = usePathname() ?? '/'
  const loginHref = `/auth/login?returnUrl=${encodeURIComponent(pathname)}`

  return (
    <nav className="fixed top-0 z-50 h-nav w-full bg-ink">
      <div className="pc-container flex h-full items-stretch">
        <div className="flex flex-grow items-stretch">
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

        <div className="relative flex flex-grow justify-end">
          {user ? (
            <>
              <Link href="/me" className={NAV_ITEM}>
                {user.nickname}
              </Link>
              <button type="button" onClick={onLogout} className={NAV_ITEM}>
                로그아웃
              </button>
            </>
          ) : (
            <Link href={loginHref} className={NAV_ITEM}>
              로그인
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
