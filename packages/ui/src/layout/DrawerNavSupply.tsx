'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FEATURED_LEAGUES, type NavLink } from '../site-config'
import { toggleThemeMode, useThemeMode } from '../v3/themeMode'

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

/** 2026-09-25 사장님 — 서랍은 「경쟁전 / 일반전」 두 묶음. 옛 한 묶음은 `false` */
export const DRAWER_GROUPED = true
const DRAWER_GROUPS: readonly { title: string; hrefs: readonly string[]; icon?: React.ReactNode }[] = [
  /*
   * 2026-09-25 사장님 — 서랍을 열어 놓고 「경쟁전」 옆 아이콘을 동그라미 쳐서 「이거 바꾸라는거였는데
   * 경쟁전 마크」. 그 아이콘은 `CloudIcon`(로고를 흉내 낸 손그림 두 쪽 구름)이었다 — 사장님이 준 진짜
   * 그림(날개 문양)을 두고 CSS 로 흉내 낸 것을 계속 쓰고 있었다 (memory user-brings-art-i-build 위반).
   * ★경쟁전만★ 사장님이 준 그림으로 바꾼다 — 일반전은 그대로 `CloudIcon`(달리 요청 없음).
   */
  { title: '경쟁전', hrefs: ['/league/cpl', '/league/supply'], icon: <SupplyWingIcon /> },
  { title: '일반전', hrefs: ['/league/nolink', '/league/sanply'] },
]

const drawerLeagues = (): readonly NavLink[] =>
  DRAWER_LEAGUE_ORDER.flatMap((href) => {
    const found = FEATURED_LEAGUES.find((l) => l.href === href)
    return found ? [found] : []
  })

/*
 * ★검정 서랍★ (사장님 2026-09-24 「햄버거 메뉴 열면 하얀색 말고 검정색 · 글씨는 잘 보이게」)
 *   + 왼쪽 위 로고(누르면 홈) · 「리그」→「Leagues」 · 번개/말풍선/사람 아이콘을 우리 것으로.
 *   옛 흰 판은 DRAWER_DARK=false (CLAUDE.md 1-4)
 */
export const DRAWER_DARK = true
const C = DRAWER_DARK
  ? { bg: 'bg-[#0b0f18]', divide: 'divide-[#1e2a42]', text: 'text-[#e8eaf2]', dim: 'text-[#a4b0c8]', on: 'bg-[#1e2a42] text-white', close: 'text-[#e8eaf2]' }
  : { bg: 'bg-white', divide: 'divide-[#e5e7eb]', text: 'text-[#4a4a4a]', dim: 'text-[#374151]', on: 'bg-[#374151] text-white', close: 'text-[#4b5563]' }

const BOARD_LINKS: readonly NavLink[] = [
  { label: 'HOT게시판', href: '/board/hot' },
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
          on ? C.on : C.text
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
      <div className={`flex shrink-0 items-center pb-[7px] text-[12.25px] ${C.dim}`}>
        <span className="mr-[7px] inline-flex w-[21px] justify-center">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  )
}

/** 서버 `ADMIN_ROLE`(`apps/web/lib/server/session.ts`)과 같은 값 — 여기선 DB 를 못 봐서 그대로 박아 둔다 */
const ADMIN_ROLE = 2

export interface DrawerNavSupplyProps {
  /** 로그인한 사용자. `null` 이면 맨 아래가 `로그인` 이다. `role` 이 있으면(관리자=2) 「관리자」 줄이 붙는다 */
  user?: { nickname: string; role?: number } | null
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
    <nav aria-label="메뉴" className={`flex h-full flex-col divide-y ${C.divide} ${C.bg} ${C.text}`}>
      {onClose ? (
        <div className="flex h-[56px] shrink-0 grow-0 items-center justify-between pl-[16px]">
          {/* ★왼쪽 위 로고 — 누르면 홈★ (사장님 2026-09-24 「첫째 사진 왼쪽 상단에 이 로고 넣어서 누르면 홈으로」) */}
          <Link href="/" aria-label="홈" onClick={onClose} className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {/* 2026-09-24 사장님 「로고 이걸로 바꿔줘」 — 같은 그림을 `BrandLogo.tsx` 의 `NavLogo` 도 쓴다 */}
            <img src="/brand/sacloud-wordmark.webp" alt="SACLOUD" width={130} height={13.4} style={{ width: 130, height: 'auto', display: 'block' }} />
          </Link>
          <div className="flex shrink-0 items-center">
            {/*
             * ★밝은/어두운 판 토글 — 폰은 서랍으로★ (2026-09-26 사장님 「라이트 모드 안돼
             * 모바일에서 로고에 가려져서」). 위 상단바 토글에 z-index 를 줘 봤지만 근본 원인은
             * ★자리 자체가 좁았다★ — 폰(390px대)에서 가운데 로고(195px)와 오른쪽 아이콘 칸이
             * 물리적으로 겹치는 폭이었다. z-index 로는 「가려짐」만 없앨 뿐 「겹쳐 보임」은
             * 못 없앤다. 서랍은 훨씬 넓어서 겹칠 일이 없다 — 폰의 토글은 여기로 옮긴다.
             * (상단바 쪽 토글은 PC 에서만 보이게 `max-md:hidden` 을 달았다 — `SiteHeaderV2.tsx`)
             */}
            <ThemeToggleDrawerButton className={C.close} />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="메뉴 닫기"
            className={`flex h-[56px] w-[56px] items-center justify-center ${C.close}`}
          >
            <CloseIcon />
          </button>
        </div>
      ) : null}

      {/*
        ★경쟁전 / 일반전 두 묶음★ (2026-09-25 사장님 「Supply1.0 2.0 둘다 햄버거 메뉴에서 경쟁전으로 묶고
        아이피엘 열산은 둘다 일반전으로 묶어」). 옛 한 묶음(「Leagues」)은 DRAWER_GROUPED=false.
        어느 리그가 어느 묶음인지는 아래 표 하나가 정한다 — 목록 자체는 여전히 `FEATURED_LEAGUES` 에서 온다.
      */}
      {DRAWER_GROUPED ? (
        DRAWER_GROUPS.map((g) => {
          const rows = leagues.filter((l) => g.hrefs.includes(l.href))
          if (rows.length === 0) return null
          return (
            <Section key={g.title} title={g.title} icon={g.icon ?? <CloudIcon />}>
              {rows.map((l) => (
                <Row key={l.href} link={l} pathname={pathname} />
              ))}
            </Section>
          )
        })
      ) : (
        <Section title="Leagues" icon={<CloudIcon />}>
          {leagues.map((l) => (
            <Row key={l.href} link={l} pathname={pathname} />
          ))}
        </Section>
      )}

      <Section title="게시판" icon={<BoardIcon />}>
        {BOARD_LINKS.map((l) => (
          <Row key={l.href} link={l} pathname={pathname} />
        ))}
      </Section>

      <Section title={user ? user.nickname : '로그인'} icon={<KeyIcon />}>
        {user ? (
          <>
            <Row link={{ label: '내 정보', href: '/me' }} pathname={pathname} />
            {user.role === ADMIN_ROLE ? (
              <Row link={{ label: '관리자', href: '/admin' }} pathname={pathname} />
            ) : null}
            <div className="my-1 flex shrink-0">
              <button
                type="button"
                onClick={onLogout}
                className={`flex flex-grow items-center rounded-[5.25px] py-[3.5px] pl-[21px] text-left text-[14px] ${C.text}`}
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
/**
 * ★밝은/어두운 판 전환 — 서랍 판★ (2026-09-26). `SiteHeaderV2.tsx` 의 `ThemeToggleButton`
 * 과 같은 뜻(선수·클랜·경기 상세의 v3 카드만 바뀐다) — 여기는 폰에서 자리가 넉넉한
 * 서랍 안에 놓는 판이다.
 */
function ThemeToggleDrawerButton({ className }: { className?: string }) {
  const mode = useThemeMode()
  const light = mode === 'light'
  return (
    <button
      type="button"
      onClick={toggleThemeMode}
      aria-label={light ? '어두운 색 테마로 바꾸기' : '밝은 색 테마로 바꾸기'}
      title={light ? '어두운 색 테마' : '밝은 색 테마'}
      className={`flex h-[56px] w-[44px] items-center justify-center ${className ?? ''}`}
    >
      {light ? <ThemeSunIcon /> : <ThemeMoonIcon />}
    </button>
  )
}
function ThemeSunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="4.2" />
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <line x1="12" y1="1.6" x2="12" y2="4.4" />
        <line x1="12" y1="19.6" x2="12" y2="22.4" />
        <line x1="1.6" y1="12" x2="4.4" y2="12" />
        <line x1="19.6" y1="12" x2="22.4" y2="12" />
        <line x1="4.4" y1="4.4" x2="6.3" y2="6.3" />
        <line x1="17.7" y1="17.7" x2="19.6" y2="19.6" />
        <line x1="4.4" y1="19.6" x2="6.3" y2="17.7" />
        <line x1="17.7" y1="6.3" x2="19.6" y2="4.4" />
      </g>
    </svg>
  )
}
function ThemeMoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M20.2 14.7A8.2 8.2 0 0 1 9.3 3.8a8.6 8.6 0 1 0 10.9 10.9z" />
    </svg>
  )
}
/* ★우리 아이콘★ (사장님 2026-09-24 「번개 말고 다른 걸로 · 게시판·로그인 모양도 바꿔」) — 옛 것(Bolt/Chat/User)은 아래 그대로 남긴다 */
/** ★경쟁전 마크★ — 사장님이 주신 날개 문양(Supply1.0·CPL 로고와 같은 파일). CloudIcon 처럼 손으로 그리지 않는다 */
function SupplyWingIcon() {
  return (
    <img
      src="/brand/league-supply1.webp"
      width={277}
      height={200}
      alt=""
      aria-hidden
      className="h-[15px] w-auto max-w-none"
    />
  )
}
function CloudIcon() {
  /* 두 쪽 구름 — 로고의 심볼과 같은 꼴 (왼쪽 빨강 · 오른쪽 파랑) */
  return (
    <svg viewBox="0 0 24 14" className="h-[11px] w-[19px]" aria-hidden>
      <path d="M0 8 L4 4 H7 V1 H11 V13 H2 L0 11 Z" fill="#e0342f" />
      <path d="M13 1 H17 V4 H20 L24 8 V11 L22 13 H13 Z" fill="#2f8bff" />
    </svg>
  )
}
function BoardIcon() {
  /* 글 목록 — 종이 한 장에 줄 셋 */
  return (
    <svg viewBox="0 0 24 24" className="h-[13px] w-[13px]" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M8 8h8M8 12h8M8 16h5" strokeLinecap="round" />
    </svg>
  )
}
function KeyIcon() {
  /* 열쇠 — 로그인 */
  return (
    <svg viewBox="0 0 24 24" className="h-[13px] w-[13px]" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h9M18 12v3M21 12v3" strokeLinecap="round" />
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
void BoltIcon
function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[13px] w-[13px]" fill="currentColor" aria-hidden>
      <path d="M4 4h16v11H9l-5 4z" />
    </svg>
  )
}
void ChatIcon
function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[13px] w-[13px]" fill="currentColor" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20.5c0-3.6 3.6-5.5 8-5.5s8 1.9 8 5.5z" />
    </svg>
  )
}
void UserIcon
