'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  GNB_LEAGUES,
  MOBILE_NAV_GROUPS,
  PRIMARY_NAV,
  type NavGroup,
  type NavLink,
} from '../site-config'
import { NavLogo } from './BrandLogo'
import { LeagueLabel } from './LeagueLabel'

/**
 * 전역 상단 GNB.
 *
 * ── 2026-08-30: 원본 재현을 그만두고 자체 디자인(`적진`)으로 다시 짰다
 *   예전 GNB 는 대표 리그 4개 + 리그 + 게시판 + 로그인을 **한 줄에 전부** 늘어놓은
 *   촘촘한 검은 띠였다. 원본을 흉내 낸 모양이다. 이제 그럴 이유가 없다.
 *
 * ── 겉만 바꿨다. 갈 수 있는 곳은 하나도 줄지 않았다
 *   `이동 경로(href)와 버튼이 하는 일은 바꾸지 않는다` 가 이 작업의 조건이다.
 *   그래서 대표 리그를 **지우지 않고** `리그` 아래로 넣었다.
 *   `리그` 자체는 여전히 `/leagues` 로 가는 링크다 — 누르면 리그 목록으로 가고,
 *   포인터를 올리거나 키보드 포커스가 닿으면 대표 리그가 아래로 펼쳐진다.
 *   상태를 따로 들지 않고 `group-hover` / `group-focus-within` 으로만 연다.
 *
 * ── 모양 규칙 (`적진`)
 *   - 배경은 페이지와 같은 검정. 경계는 아래쪽 1px 선 하나뿐이다. 그림자 없음
 *   - 항목은 평소 `--color-meta`, 올리면 `--color-text-strong`
 *   - 현재 위치만 진홍 밑줄 1px. 진홍으로 면을 칠하지 않는다
 *   - 로고를 제외하면 `--font-display` 를 쓰지 않는다. 메뉴는 라벨이지 제목이 아니다
 */

/*
 * 헤더 높이.
 *
 * `--spacing-nav` 를 그대로 따라간다. 리그 서브내비(`LeagueSubNav`)가 `top-nav` 로
 * 이 높이 바로 아래에 붙기 때문에 **두 값이 같아야 틈이 안 생긴다.**
 * 토큰이 사라지더라도 헤더가 접히지 않도록 대체값을 둔다.
 */
const NAV_HEIGHT = 'h-[var(--spacing-nav,64px)]'

const NAV_LINK =
  'relative flex h-full items-center px-3 text-[13px] tracking-wide text-meta transition-colors duration-100 hover:text-[var(--color-text-strong,#f6eded)]'

/** 현재 위치 표시 — 가는 진홍 밑줄 하나 */
const NAV_ACTIVE =
  'text-[var(--color-text-strong,#f6eded)] after:absolute after:inset-x-3 after:bottom-[-1px] after:h-px after:bg-accent'

export interface SiteHeaderProps {
  featuredLeagues?: readonly NavLink[]
  primaryNav?: readonly NavLink[]
  /** 모바일 서랍의 묶음 구성 */
  navGroups?: readonly NavGroup[]
  /** 로그인한 사용자. null이면 `로그인` 링크를 보여준다 */
  user?: { nickname: string } | null
  onLogout?: () => void
}

export function SiteHeader({
  /* 상단바 순서는 홈과 다르다 (IPL 먼저 · 지시 #14). 목록은 `FEATURED_LEAGUES` 하나, 순서만 여기서 */
  featuredLeagues = GNB_LEAGUES,
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

  /* 첫 항목(`/leagues`)만 리그 묶음의 머리로 쓰고 나머지는 그대로 이어 붙인다.
     머리 항목이 **없으면**(지시 #14 ① — `PRIMARY_NAV` 가 비었다) 대표 리그를 1차 메뉴로 바로 그린다.
     드롭다운 가지는 지우지 않았다 — `PRIMARY_NAV` 를 되돌리면 그대로 돌아온다 */
  const [leagueEntry, ...restNav] = primaryNav

  return (
    /* `bg-ink` — 셸은 본문보다 어둡다 (「투톤」 · D-251).
       그때는 `bg-page` 였고, 그때는 두 토큰의 값이 **같아서** 층이 없었다. */
    <nav
      className={`fixed top-0 z-50 w-full border-b border-line bg-ink ${NAV_HEIGHT}`}
    >
      <div className="mx-auto flex h-full w-full max-w-[var(--layout-max,1120px)] items-stretch px-5 max-md:px-3">
        {/* --- 모바일: 햄버거 --- */}
        <button
          type="button"
          aria-label="메뉴"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center pr-3 text-meta md:hidden"
        >
          <MenuIcon />
        </button>

        {/* 홈에서는 숨긴다 — 홈 본문 가운데에 큰 로고가 있다 */}
        <Link
          href="/"
          aria-label="홈"
          className={`flex items-center pr-8 ${pathname === '/' ? 'hidden' : ''}`}
        >
          {/*
            두 줄짜리 확정 로고다. 18px 로 놓으면 글자가 6px 이 되어 안 읽힌다 —
            32px 로 놓아야 `3RD` 가 10px 쯤 된다. 머리띠가 64px 이라 여유가 있고,
            그 높이에서도 폭은 92px 로 옛 로고(99px)보다 좁아 GNB 가 밀리지 않는다.
          */}
          <NavLogo className="h-[32px] w-auto max-md:h-[26px]" />
        </Link>

        <div className="hidden items-stretch md:flex">
          {/* --- 리그: 링크이면서 대표 리그를 펼치는 자리 --- */}
          {leagueEntry ? (
            <div className="group relative flex items-stretch">
              <Link
                href={leagueEntry.href}
                className={`${NAV_LINK} ${
                  isLeagueArea(pathname, leagueEntry.href, featuredLeagues) ? NAV_ACTIVE : ''
                }`}
              >
                {leagueEntry.label}
              </Link>

              <div className="invisible absolute left-0 top-full z-10 min-w-[168px] border border-line bg-card py-1 opacity-0 transition-opacity duration-100 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                {featuredLeagues.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block border-l border-transparent px-4 py-2.5 text-[13px] text-meta transition-colors duration-100 hover:border-l-accent hover:text-[var(--color-text-strong,#f6eded)] ${
                      isActive(pathname, item.href)
                        ? 'border-l-accent text-[var(--color-text-strong,#f6eded)]'
                        : ''
                    }`}
                  >
                    {/* 리그 이름은 `LeagueLabel` 로 찍는다 — `10mountain` 에만 산 표시가 붙는다 */}
                    <LeagueLabel name={item.label} />
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            /* 지시 #14 ① — 상단바는 IPL · SPL · 10🏔 셋뿐. 각각이 1차 메뉴이고 현재 리그에 밑줄 */
            featuredLeagues.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${NAV_LINK} ${isActive(pathname, item.href) ? NAV_ACTIVE : ''}`}
              >
                <LeagueLabel name={item.label} />
              </Link>
            ))
          )}

          {restNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${NAV_LINK} ${isActive(pathname, item.href) ? NAV_ACTIVE : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="flex-grow" />

        <div className="flex items-stretch">
          {user ? (
            <>
              <Link
                href="/me"
                className={`${NAV_LINK} ${isActive(pathname, '/me') ? NAV_ACTIVE : ''}`}
              >
                <span className="hidden md:inline">{user.nickname}</span>
                <span className="md:hidden">
                  <AccountIcon />
                </span>
              </Link>
              <button type="button" onClick={onLogout} className={`${NAV_LINK} max-md:hidden`}>
                로그아웃
              </button>
            </>
          ) : (
            <Link href={loginHref} aria-label="로그인" className={NAV_LINK}>
              <span className="hidden md:inline">로그인</span>
              <span className="md:hidden">
                <LoginIcon />
              </span>
            </Link>
          )}
        </div>
      </div>

      {/* --- 모바일 서랍 --- */}
      {open ? (
        <div className="border-b border-line bg-card pb-2 md:hidden">
          {navGroups.map((group) => (
            <div key={group.label} className="border-b border-[var(--color-line-soft,#1a1010)]">
              <div className="px-4 pb-1 pt-4 text-[11px] tracking-widest text-[var(--color-faint,#6b5555)]">
                {group.label}
              </div>
              {group.items.map((item) => (
                <Link
                  key={`${group.label}:${item.href}`}
                  href={item.href}
                  className={`block border-l border-transparent px-4 py-3 text-meta ${
                    isActive(pathname, item.href)
                      ? 'border-l-accent text-[var(--color-text-strong,#f6eded)]'
                      : ''
                  }`}
                >
                  {/* 서랍의 리그 묶음에도 같은 라벨을 쓴다 (리그가 아닌 항목은 글자만 나온다) */}
                  <LeagueLabel name={item.label} />
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

/* 아이콘은 원본 자산을 가져오지 않고 새로 그렸다 (CLAUDE.md 3장 4번) */

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <rect x="2" y="5" width="20" height="1.6" />
      <rect x="2" y="11" width="20" height="1.6" />
      <rect x="2" y="17" width="20" height="1.6" />
    </svg>
  )
}

function LoginIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M12 3.2h7.2c.9 0 1.6.7 1.6 1.6v14.4c0 .9-.7 1.6-1.6 1.6H12v-2h6.8V5.2H12z" />
      <path d="M9.9 7.6 8.5 9l2 2H3.2v2h7.3l-2 2 1.4 1.4L14.3 12z" />
    </svg>
  )
}

function AccountIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20.5c0-3.6 3.6-5.5 8-5.5s8 1.9 8 5.5z" />
    </svg>
  )
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * `리그` 항목이 현재 위치인가.
 * 대표 리그를 그 아래로 넣었으므로, 개별 리그 화면에 있을 때도 `리그` 가 켜져야
 * "지금 어디에 있는지" 가 맞는다.
 */
function isLeagueArea(
  pathname: string,
  leaguesHref: string,
  featuredLeagues: readonly NavLink[],
): boolean {
  if (isActive(pathname, leaguesHref)) return true
  return featuredLeagues.some((item) => isActive(pathname, item.href))
}
