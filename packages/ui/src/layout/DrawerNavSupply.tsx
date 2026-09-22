'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FEATURED_LEAGUES, type NavLink } from '../site-config'

/**
 * ★★서랍(햄버거) — 서플라이 폰 판★★ (2026-09-22 · 사장님이 직접 적어 주심)
 *
 * > 「지금 햄버거 메뉴 cloud로 진열된거 ★전부 삭제하고 서플라이처럼★
 * >  리그 / supply2.0 / supply1.0 / IPL / 열산 / 게시판 / Hot게시판 / 자유게시판 / 로그인
 * >  이렇게 만들어」
 *
 * ── ★옛 서랍을 지우지 않았다★ (`CLAUDE.md` 1-4)
 *   `SiteMapNav.tsx` 는 한 글자도 안 건드렸다. `SiteHeaderV2` 의 import 한 줄만
 *   되돌리면 여섯 칸짜리 사이트맵 서랍이 그대로 돌아온다.
 *
 * ── ★값의 출처★ — `3rd.supply` 를 아이폰 UA · 393px 로 열어 잰 숫자다
 *   (`scratchpad/measure.mjs` · 2026-09-22).
 *   ```
 *   패널        흰 바탕 · 폭 210px · 화면 높이 전체
 *   맨 윗줄     56px · 닫기(X) 하나
 *   칸 여백     10.5px 14px · 칸 사이 1px 선
 *   칸 제목     12.25px · #374151 · 아래 여백 7px
 *   항목        28px · padding 3.5px 0 3.5px 21px · radius 5.25px · 위아래 4px
 *   지금 자리   바탕 #374151 · 글자 흰색
 *   ```
 *
 * ── ★주소는 하나도 지어내지 않았다★ — 리그 목록은 `FEATURED_LEAGUES` 한 곳에서 온다.
 *   사장님이 적어 주신 차례(supply2.0 · supply1.0 · IPL · 열산)는 상단바 차례와
 *   ★다르다★ — 적어 주신 그대로 둔다.
 */

/** 사장님이 적어 주신 서랍 차례 — 상단바(`GNB_LEAGUE_ORDER`)와 다르다 */
const DRAWER_LEAGUE_ORDER: readonly string[] = [
  '/league/cpl', // Supply2.0
  '/league/supply', // Supply1.0
  '/league/nolink', // IPL
  '/league/sanply', // 열산
]

const drawerLeagues = (): readonly NavLink[] =>
  DRAWER_LEAGUE_ORDER.flatMap((href) => {
    const found = FEATURED_LEAGUES.find((l) => l.href === href)
    return found ? [found] : []
  })

const BOARD_LINKS: readonly NavLink[] = [
  { label: 'Hot게시판', href: '/board/hot' },
  { label: '자유게시판', href: '/board/free' },
]

function isOn(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function Row({ link, pathname }: { link: NavLink; pathname: string }) {
  const on = isOn(pathname, link.href)
  return (
    <div className="my-1 flex shrink-0">
      <Link
        href={link.href}
        className={`flex flex-grow items-center rounded-[5.25px] py-[3.5px] pl-[21px] pr-0 text-[14px] ${
          on ? 'bg-[#374151] text-white' : 'text-[#4a4a4a]'
        }`}
      >
        {link.label}
      </Link>
    </div>
  )
}

function Section({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-stretch px-[14px] py-[10.5px]">
      <div className="flex shrink-0 items-center pb-[7px] text-[12.25px] text-[#374151]">
        <span className="mr-[7px] inline-flex w-[21px] justify-center">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  )
}

export interface DrawerNavSupplyProps {
  /** 로그인한 사용자. `null` 이면 맨 아래가 `로그인` 이다 */
  user?: { nickname: string } | null
  onLogout?: () => void
  /** 닫기(X) — 없으면 그 줄을 안 그린다 */
  onClose?: () => void
  /** 로그인으로 보낼 주소 (되돌아올 곳을 담아 호출한 쪽이 만든다) */
  loginHref?: string
}

export function DrawerNavSupply({ user = null, onLogout, onClose, loginHref = '/auth/login' }: DrawerNavSupplyProps) {
  const pathname = usePathname() ?? '/'
  const leagues = drawerLeagues()

  return (
    <nav aria-label="메뉴" className="flex h-full flex-col divide-y divide-[#e5e7eb] bg-white text-[#4a4a4a]">
      {onClose ? (
        <div className="flex h-[56px] shrink-0 grow-0 items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="메뉴 닫기"
            className="flex h-[56px] w-[56px] items-center justify-center text-[#4b5563]"
          >
            <CloseIcon />
          </button>
        </div>
      ) : null}

      <Section title="리그" icon={<BoltIcon />}>
        {leagues.map((l) => (
          <Row key={l.href} link={l} pathname={pathname} />
        ))}
      </Section>

      <Section title="게시판" icon={<ChatIcon />}>
        {BOARD_LINKS.map((l) => (
          <Row key={l.href} link={l} pathname={pathname} />
        ))}
      </Section>

      <Section title={user ? user.nickname : '로그인'} icon={<UserIcon />}>
        {user ? (
          <>
            <Row link={{ label: '내 정보', href: '/me' }} pathname={pathname} />
            <div className="my-1 flex shrink-0">
              <button
                type="button"
                onClick={onLogout}
                className="flex flex-grow items-center rounded-[5.25px] py-[3.5px] pl-[21px] text-left text-[14px] text-[#4a4a4a]"
              >
                로그아웃
              </button>
            </div>
          </>
        ) : (
          <Row link={{ label: '로그인', href: loginHref }} pathname={pathname} />
        )}
      </Section>
    </nav>
  )
}

/* 아이콘은 원본 자산을 가져오지 않고 새로 그렸다 (`CLAUDE.md` 2장 4번) */
function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[28px] w-[28px]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M5 5l14 14M19 5L5 19" strokeLinecap="round" />
    </svg>
  )
}
function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[13px] w-[13px]" fill="currentColor" aria-hidden>
      <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
    </svg>
  )
}
function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[13px] w-[13px]" fill="currentColor" aria-hidden>
      <path d="M4 4h16v11H9l-5 4z" />
    </svg>
  )
}
function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[13px] w-[13px]" fill="currentColor" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20.5c0-3.6 3.6-5.5 8-5.5s8 1.9 8 5.5z" />
    </svg>
  )
}
