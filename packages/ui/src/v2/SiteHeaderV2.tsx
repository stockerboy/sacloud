'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { GNB_LEAGUES, MOBILE_NAV_GROUPS, PRIMARY_NAV, type NavGroup, type NavLink } from '../site-config'
import { NavLogo } from '../layout/BrandLogo'
import { LeagueLabel } from '../layout/LeagueLabel'
import { v2Class } from './leagueAccent'

/**
 * ★★v2 전역 머리띠★★ — 68px (2026-09-07 · Part 10 ③ · 사장님 승인)
 *
 * ── 시안 실측 (`ranking` · `player` · `pastseasons` 세 파일이 똑같다)
 *   ```
 *   ┌────────────────────────────────────────────────── 68px ──┐
 *   │ [로고]   IPL  SPL  10⛰                          로그인 │
 *   └──────────────────────────────────────────────────────────┘
 *     gap 36        gap 28 · 22px                      13.5px
 *   ```
 *   배경 `--v2-bar` · 아래 1px `--v2-bar-border` · 본문과 같은 1180px 폭.
 *
 * ── ★옛 판을 지우지 않았다★ (`CLAUDE.md` 1-4)
 *   `packages/ui/src/layout/SiteHeader.tsx` 가 그대로 있다. 되돌리려면
 *   `SiteShell` 의 import 한 줄만 되돌린다 — 다른 파일은 안 건드려도 된다.
 *
 * ── ★갈 수 있는 곳은 하나도 줄지 않았다★
 *   리그 링크 · 로그인 · 내 정보 · 로그아웃 · 모바일 서랍 전부 그대로다.
 *   href 는 한 글자도 바뀌지 않았다.
 *
 * ── ★로고는 우리 것을 쓴다★
 *   시안은 `/assets/<화면>/cloud-mark.png` 를 부르는데 **우리에게 없는 그림**이다.
 *   없는 파일을 지어내지 않고 확정 로고(`NavLogo`)를 그 자리에 놓았다.
 *
 * ── ★홈은 다른 띠다★ (2026-09-07 · ④단계)
 *   시안의 홈 머리띠는 ★56px★ 이고 로고도 리그 메뉴도 없다 — 오른쪽 `로그인` 하나뿐이다.
 *   홈 본문 한가운데에 큰 로고가 있어서 위에 또 두면 겹치기 때문이다.
 *   ★다른 화면의 68px 구조는 안 건드린다★ — `variant="home"` 한 갈래만 다르다.
 *
 *   ⚠ 시안 홈 띠 왼쪽에는 학교·학번 한 줄이 있는데 ★넣지 않았다★.
 *     이 저장소는 공개(public)이고 학번은 개인정보다 (`CLAUDE.md` 2장 6번의 뜻).
 *     넣으실 거면 사장님이 직접 넣으시는 게 맞다. 자리는 비워 뒀다.
 */

export type SiteHeaderVariant = 'default' | 'home'

export interface SiteHeaderV2Props {
  /** `home` 이면 56px · 로고와 리그 메뉴 없음 (시안 홈) */
  variant?: SiteHeaderVariant
  featuredLeagues?: readonly NavLink[]
  primaryNav?: readonly NavLink[]
  navGroups?: readonly NavGroup[]
  /** 로그인한 사용자. null 이면 `로그인` */
  user?: { nickname: string } | null
  onLogout?: () => void
}

/**
 * ★상단바 표장★ — 홈 리그 단추와 ★같은 파일★ 이다 (2026-09-12 사장님).
 * 표장이 없는 슬러그는 글자만 나온다 — 지어내지 않는다.
 */
const GNB_MARK: Readonly<Record<string, { src: string; w: number; h: number }>> = {
  /**
   * ★본디 크기를 같이 적는다★ (2026-09-12).
   *
   * ⚠ 폰에서 로고가 ★자리만 잡고 안 그려지는★ 일이 있었다 (사장님 사진 3:38).
   *   `<img>` 에 `width`·`height` 가 없고 CSS 로 `height` 만 준 채 flex 안에 놓으면
   *   일부 폰 브라우저가 가로를 0 으로 잡는다. 본디 크기를 적어 두면 비율을 알아서
   *   그런 일이 안 생긴다. 화면에 실제로 쓰는 크기는 CSS(`.v2-gnb__mark`) 가 정한다.
   */
  sanply: { src: '/assets/league-10.png', w: 227, h: 160 },
  nolink: { src: '/assets/league-ipl.png', w: 254, h: 160 },
  supply: { src: '/assets/league-spl.png', w: 300, h: 160 },
}

/**
 * 리그 옆 넷째 자리 (2026-09-12 사장님).
 *
 * ⚠ ★글자가 아니라 이모티콘★ 이다 (사장님: «상단에 게시판 메뉴를 글씨로 만들지 말고
 *   게시판 이모티콘을 넣어줘»). 폰에서 «게시판» 석 자가 ★세로로 쪼개져★ 있었다 —
 *   리그 표장 셋이 자리를 먹어서 글자 칸이 한 글자 폭까지 눌린 탓이다.
 *   옛 값: `label: '게시판'`. 읽어 주는 이름(`aria-label`)은 그대로 «게시판» 이다.
 */
const GNB_BOARD = { label: '게시판', icon: '📋', href: '/board/hot' }

/** `/league/nolink` → `nolink`. 주소가 리그가 아니면 빈 글자다 */
function leagueSlugOfHref(href: string): string {
  return href.split('/')[2] ?? ''
}

export function SiteHeaderV2({
  variant = 'default',
  /* 상단바 순서는 홈과 다르다 (IPL 먼저 · 지시 #14). 목록은 한 곳(`FEATURED_LEAGUES`) */
  featuredLeagues = GNB_LEAGUES,
  primaryNav = PRIMARY_NAV,
  navGroups = MOBILE_NAV_GROUPS,
  user = null,
  onLogout,
}: SiteHeaderV2Props) {
  const pathname = usePathname() ?? '/'
  const loginHref = `/auth/login?returnUrl=${encodeURIComponent(pathname)}`
  const [open, setOpen] = useState(false)

  /* 화면을 옮기면 서랍을 닫는다. 열어 둔 채 넘어가면 새 화면을 가린다 */
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  /* ── 홈: 56px · 오른쪽 `로그인` 하나 (시안) ── */
  if (variant === 'home') {
    return (
      <header className={`${v2Class(null, 'v2-topbar')} fixed top-0 z-50 w-full`}>
        <div className="v2-container v2-topbar__inner v2-topbar__inner--home">
          {/*
            ★홈 상단바에도 로고★ (2026-09-12 사장님: «메인홈에 상단에 로고 넣어줘»).

            옛 판은 이 자리가 ★통째로 비어★ 있었다 (시안의 학교·학번 줄 자리인데
            공개 저장소라 안 넣었다). 본문 가운데에 큰 로고가 있으니 됐다고 봤는데,
            아래로 내려가면 띠만 남아 ★어느 사이트인지 사라졌다.★
            띠가 56px 이라 본문 큰 로고보다 훨씬 작게 둔다 — 두 개가 안 싸운다.
          */}
          <Link href="/" aria-label="홈" className="v2-brand flex items-center">
            <NavLogo className="h-[24px] w-auto max-md:h-[20px]" />
          </Link>
          <div className="flex-1" />
          {user ? (
            <div className="flex items-center gap-5">
              <Link href="/me" className="v2-login">
                {user.nickname}
              </Link>
              <button type="button" onClick={onLogout} className="v2-login">
                로그아웃
              </button>
            </div>
          ) : (
            <Link href={loginHref} className="v2-login">
              로그인
            </Link>
          )}
        </div>
      </header>
    )
  }

  return (
    <header
      /* 강조색은 ★지금 보고 있는 리그★ 를 따른다 — 주소에서 읽는다 */
      className={`${v2Class(leagueSlugOf(pathname), 'v2-topbar')} fixed top-0 z-50 w-full`}
    >
      <div className="v2-container v2-topbar__inner max-md:gap-0">
        {/* --- 모바일: 햄버거 --- */}
        <button
          type="button"
          aria-label="메뉴"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center pr-3 text-[var(--v2-text-dim)] md:hidden"
        >
          <MenuIcon />
        </button>

        {/* `v2-brand` — 로고의 `.my` 만 언제나 빨강으로 되돌린다 (리그색을 안 따라간다) */}
        <Link href="/" aria-label="홈" className="v2-brand flex items-center">
          <NavLogo className="h-[34px] w-auto max-md:h-[26px]" />
        </Link>

        {/*
          ★상단바 바로가기 넷★ (2026-09-12 사장님: «상단바에 로고10/로고IPL/로고SPL/게시판
          이렇게 네개 바로가기 만들어» · «모바일버전에는 왼쪽의 상단에 로고버튼들이 안보여»).

          ── 바뀐 것 두 가지
          ① 리그 이름 앞에 ★표장★ 을 붙인다 — 홈 리그 단추와 ★같은 그림 파일★ 이다
          ② 이 줄이 ★폰에서도 보인다★. 옛 판은 `max-md:hidden` 이라 햄버거 서랍뿐이었다.
             폰에서는 자리가 없으니 ★글자를 빼고 표장만★ 남긴다 (게시판은 글자).

          서랍은 ★그대로★ 다 — 없앤 길은 하나도 없다.
        */}
        <nav className="v2-gnb">
          {featuredLeagues.map((item) => {
            const mark = GNB_MARK[leagueSlugOfHref(item.href)]
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={`v2-gnb__item ${isActive(pathname, item.href) ? 'is-on' : ''}`}
              >
                <span className="v2-gnb__cell">
                  {/*
                    ★새 로고 (2026-09-12 사장님)★ — 가로가 더 길어서 네모 상자에 넣으면
                    세로가 눌린다. `<img>` 로 놓고 ★세로만★ 정한다 (가로는 그림이 정한다).
                    옛 판은 19×19 네모에 `background-size: contain` 이었다.
                  */}
                  {mark ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mark.src} width={mark.w} height={mark.h} alt="" aria-hidden className="v2-gnb__mark" />
                  ) : null}
                  {/*
                    ★이름은 표장이 없는 리그만 적는다★ (2026-09-12 사장님: «이것들로 로고 바꿔줘 전부»).

                    새 로고 안에 이미 «10» · «IPL» · «SPL» 이 들어 있다. 옆이나 밑에 또 적으면
                    같은 말이 두 번 나온다. 표장이 없는 리그는 글자가 유일한 표시라 그대로 적는다.

                    ⚠ 옛 판 — 폰에서는 표장 밑에 9.5px 로 이름을 적었다
                      (사장님: «빨간색 줄친곳에 작게 10 IPL SPL 써줘»). 로고가 바뀌기 전 이야기다.
                  */}
                  {mark ? null : (
                    <span className="v2-gnb__name">
                      {/* `10mountain` 에만 산 표시가 붙는다 — 이름이 아니라 화면 장식이다 */}
                      <LeagueLabel name={item.label} />
                    </span>
                  )}
                </span>
              </Link>
            )
          })}
          {/* ★넷째 자리 — 게시판★. 리그 안 게시판을 없애고 여기로 모았다 (2026-09-12 사장님) */}
          <Link
            href={GNB_BOARD.href}
            aria-label={GNB_BOARD.label}
            title={GNB_BOARD.label}
            className={`v2-gnb__item v2-gnb__board ${pathname.startsWith('/board') ? 'is-on' : ''}`}
          >
            <span aria-hidden>{GNB_BOARD.icon}</span>
          </Link>
          {/* `PRIMARY_NAV` 는 지금 비어 있다. 되살리면 리그 뒤에 그대로 붙는다 */}
          {primaryNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`v2-gnb__item max-md:hidden ${isActive(pathname, item.href) ? 'is-on' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex-1" />

        <div className="flex items-center gap-5">
          {user ? (
            <>
              <Link href="/me" className="v2-login">
                <span className="max-md:hidden">{user.nickname}</span>
                <span className="md:hidden">
                  <AccountIcon />
                </span>
              </Link>
              <button type="button" onClick={onLogout} className="v2-login max-md:hidden">
                로그아웃
              </button>
            </>
          ) : (
            <Link href={loginHref} aria-label="로그인" className="v2-login">
              <span className="max-md:hidden">로그인</span>
              <span className="md:hidden">
                <LoginIcon />
              </span>
            </Link>
          )}
        </div>
      </div>

      {/* --- 모바일 서랍 — 옛 판과 같은 구성이다 --- */}
      {open ? (
        <div className="border-b border-[var(--v2-bar-border)] bg-[var(--v2-panel)] pb-2 md:hidden">
          {navGroups.map((group) => (
            <div key={group.label} className="border-b border-[var(--v2-row-divider)]">
              <div className="px-6 pb-1 pt-4 text-[11px] tracking-widest text-[var(--v2-text-ghost)]">
                {group.label}
              </div>
              {group.items.map((item) => (
                <Link
                  key={`${group.label}:${item.href}`}
                  href={item.href}
                  className={`block px-6 py-3 text-[14px] ${
                    isActive(pathname, item.href)
                      ? 'font-bold text-[var(--v2-text-strong)]'
                      : 'text-[var(--v2-text-dim)]'
                  }`}
                >
                  <LeagueLabel name={item.label} />
                </Link>
              ))}
            </div>
          ))}
          {user ? (
            <button
              type="button"
              onClick={onLogout}
              className="block w-full px-6 py-3 text-left text-[14px] text-[var(--v2-text-dim)]"
            >
              로그아웃
            </button>
          ) : null}
        </div>
      ) : null}
    </header>
  )
}

/* 아이콘은 원본 자산을 가져오지 않고 새로 그렸다 (`CLAUDE.md` 2장 4번) */

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
 * 주소에서 리그 slug 를 읽는다. `/league/<slug>/...` 뿐이다.
 * ★없으면 없는 것이다★ — 아무 리그나 골라 색을 칠하지 않는다.
 */
export function leagueSlugOf(pathname: string): string | null {
  const m = /^\/league\/([^/]+)/.exec(pathname)
  return m?.[1] ?? null
}
