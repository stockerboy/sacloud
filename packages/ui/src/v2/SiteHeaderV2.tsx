'use client'

import Link from 'next/link'
import { LEAGUE_LOGO } from '../layout/leagueLogo'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { GNB_LEAGUES, MOBILE_NAV_GROUPS, PRIMARY_NAV, type NavGroup, type NavLink } from '../site-config'
import { NavLogo } from '../layout/BrandLogo'
import { SiteMapNav } from '../layout/SiteMapNav'
import { DrawerNavSupply } from '../layout/DrawerNavSupply'
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
/* ⚠ ★2026-09-14 — 로고가 한 곳으로 모였다★ (사장님이 새 로고 셋을 주셨다).
   옛 판은 상단바(v1·v2)와 홈 타일 세 곳에 주소가 따로 박혀 있었다 — 바뀔 때마다
   하나를 빠뜨렸다. 이제 `leagueLogo.ts` 한 곳이 그림도 크기도 정한다.
   옛 로고는 `LEAGUE_LOGO_V1` 로 그대로 살아 있다 (`CLAUDE.md` 1-4). */
/**
 * ★상단바에 리그 표장(그림)을 그릴 것인가★ (2026-09-16 사장님이 내리심:
 * «위에 앰블럼들 다 없애고 그냥 글씨만 깔끔하게»).
 * `true` 로 두면 옛 모습이 그대로 돌아온다. 그림 파일은 하나도 안 지웠다.
 */
const GNB_MARK_ON: boolean = false

/**
 * ★상단바에 리그·메뉴 줄을 둘 것인가★
 *
 * ⚠ ★2026-09-22 — 다시 켠다★ (사장님: 「상단 바 배치나 이런것도 전부 서플라이에서
 *   영감받아서 디자인해 (…) 서플라이 유저들이 사용하기에 익숙하게끔」).
 *   2026-09-16 에는 «모든 카테고리를 지워» 라고 하셔서 껐었다 — 이번에 뒤집으셨다.
 *   `false` 로 두면 그날의 판(로고 가운데 + 서랍만)이 그대로 돌아온다.
 */
const GNB_ROW_ON: boolean = true

/**
 * ★PC 상단바에 로고를 그릴 것인가★
 *
 * ⚠ ★2026-09-22 — 끈다★ (사장님: 「그거외에는 ★서플라이랑 전부 똑같이★ 만들어」).
 *   서플라이 PC 상단바를 실측했더니 ★로고가 없다★ (`nav img` 의 폭이 0px 이고
 *   메뉴가 1120px 칸의 ★왼쪽 끝에서 바로★ 시작한다). 히어로 한가운데에 큰 로고가
 *   있어서 위에 또 두지 않는 것이다.
 *
 *   ⚠ 이것은 2026-09-12 지시(「메인홈에 상단에 로고 넣어줘」)와 ★어긋난다.★
 *     오늘 지시가 더 뒤이고 「전부 똑같이」 라고 못박으셔서 오늘 것을 따랐다.
 *     ★로고를 도로 세우시려면 이 값을 `true` 로 두면 된다 — 한 글자다.★
 *   ★폰에서는 그대로 보인다★ (서플라이도 폰에는 로고가 있다).
 */
const GNB_BRAND_ON: boolean = false

const GNB_MARK: Readonly<Record<string, { src: string; w: number; h: number }>> = {
  /**
   * ★본디 크기를 같이 적는다★ (2026-09-12).
   *
   * ⚠ 폰에서 로고가 ★자리만 잡고 안 그려지는★ 일이 있었다 (사장님 사진 3:38).
   *   `<img>` 에 `width`·`height` 가 없고 CSS 로 `height` 만 준 채 flex 안에 놓으면
   *   일부 폰 브라우저가 가로를 0 으로 잡는다. 본디 크기를 적어 두면 비율을 알아서
   *   그런 일이 안 생긴다. 화면에 실제로 쓰는 크기는 CSS(`.v2-gnb__mark`) 가 정한다.
   */
  /* 2026-09-12 글자를 잘라 냈다. 옛 값: IPL 254 · SPL 300 · 10 227 */
  ...LEAGUE_LOGO,
}

/**
 * 리그 뒤 두 자리 — ★이용방법 · 게시판★ (2026-09-12 사장님).
 *
 * > «상단바 IPL SPL 열산 이용방법 게시판 순서로 바꿔»
 * > «게시판 이모티콘은 삭제하고 그냥 게시판 이라고 써»
 *
 * ⚠ 같은 날 낮에 «게시판» 을 📋 이모티콘으로 바꿨다가 되돌린다.
 *   그때 이모티콘으로 간 까닭은 폰에서 석 자가 세로로 쪼개져서였다 —
 *   지금은 로고에서 글자를 잘라 내 표장이 좁아졌고, 아래 CSS 로 줄바꿈을 막았다.
 */
const GNB_LINKS: readonly { icon: string; label: string; aria: string; href: string; match: string }[] = [
  /*
   * ★소개를 맨 앞에 둔다★ (2026-09-14 저녁 사장님: «2번 앞으로 빼»).
   *   처음 오는 사람이 가장 먼저 눌러야 할 자리다 — 여기가 무엇을 하는 곳인지
   *   설명하고, 마지막에 참가 신청으로 이어진다.
   */
  /*
   * ⚠ ★2026-09-16 — 글자가 바뀌고 이모티콘이 빠졌다★ (사장님:
   *   «위에 앰블럼들 다 없애고 그냥 글씨만 깔끔하게 (…) ABOUT은 참가신청 으로 한글로
   *    바꿔 그리고 notice를 ABOUT으로 바꿔 그리고 BOARD는 게시판 으로 바꿔»).
   *
   *   ★주소는 한 글자도 안 바뀐다★ — `/about` · `/guide` · `/board` 그대로다.
   *   바뀐 것은 ★그 자리에 적는 말★ 뿐이다.
   *   옛 글자: ✨about · 📌notice · 📋board
   */
  /*
   * ⚠ ★★2026-09-22 — 사장님이 상단 메뉴를 직접 정하셨다★★
   *
   * > 「상단 메뉴는 내가 지금정할게 ★Supply2.0(옛cpl)/IPL/Supply1.0(옛pl)/열산/게시판★
   * >  이렇게 만들어」
   *
   *   다섯 자리 중 앞 넷은 리그(`GNB_LEAGUES`)이고, 여기 남는 것은 ★게시판 하나★ 다.
   *   ★`참가신청`(/about) 과 `ABOUT`(/guide) 을 상단바에서 내렸다.★
   *
   *   ⚠ ★두 화면을 지우지 않았다★ (`CLAUDE.md` 1-4) — 주소도 화면도 그대로 살아 있고
   *     ★햄버거 서랍(사이트맵)에도 그대로 있다.★ 아래 `GNB_LINKS_20260921` 로
   *     되돌리면 상단바에 그대로 돌아온다.
   */
  { icon: '', label: '게시판', aria: '게시판', href: '/board/hot', match: '/board' },
]

/** ⚠ ★2026-09-22 이전 판★ — 참가신청·ABOUT 이 상단바에 있던 시절. 지우지 않는다 */
const GNB_LINKS_20260921: readonly { icon: string; label: string; aria: string; href: string; match: string }[] = [
  { icon: '', label: '참가신청', aria: '참가신청', href: '/about', match: '/about' },
  { icon: '', label: 'ABOUT', aria: '이용방법', href: '/guide', match: '/guide' },
  { icon: '', label: '게시판', aria: '게시판', href: '/board/hot', match: '/board' },
]
void GNB_LINKS_20260921

/** `/league/nolink` → `nolink`. 주소가 리그가 아니면 빈 글자다 */
function leagueSlugOfHref(href: string): string {
  return href.split('/')[2] ?? ''
}

void MenuIcon
/* 옛 서랍 — 지우지 않는다 (`CLAUDE.md` 1-4). 되돌릴 때 이 이름을 쓴다 */
void SiteMapNav

export function SiteHeaderV2({
  variant = 'default',
  /* 상단바 순서는 홈과 다르다 (IPL 먼저 · 지시 #14). 목록은 한 곳(`FEATURED_LEAGUES`) */
  featuredLeagues = GNB_LEAGUES,
  primaryNav = PRIMARY_NAV,
  /* ⚠ ★옛 서랍 목록★ — 2026-09-19 에 서랍이 사이트맵으로 바뀌어 지금은 안 쓴다.
     지우지 않는다 (`CLAUDE.md` 1-4) — 되돌릴 때 이 값을 그대로 쓴다 */
  navGroups: _navGroups = MOBILE_NAV_GROUPS,
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
      <div
        className={`v2-container v2-topbar__inner ${
          GNB_ROW_ON ? 'v2-topbar__inner--gnb' : 'v2-topbar__inner--menu'
        }`}
      >
        {/*
          ★햄버거★ — ★2026-09-22 — PC 에서는 숨는다★ (카테고리가 이미 보이니
            필요 없다 — 서플라이도 PC 에 햄버거가 없다). ★폰에서는 그대로 있다★ —
            2줄로 넘치는 것까지는 안 보여 주고 서랍(사이트맵)으로 마저 보여 준다.
            (CSS 가 나눈다 — `.v2-topbar__inner--gnb .v2-burger`)

          ⚠ ★2026-09-16 옛 사연 — 지우지 않는다★ 「최상단바에 써클로고를 가운데에
            배치하고 모든 카테고리를 지워 그리고 왼쪽에 햄버거메뉴」로 만들었던 판.
            `GNB_ROW_ON=false` 로 되돌리면 이 버튼이 PC 에서도 다시 보인다.
        */}
        <button
          type="button"
          className="v2-burger"
          aria-label={open ? '메뉴 닫기' : '메뉴 열기'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span aria-hidden className="v2-burger__bar" />
          <span aria-hidden className="v2-burger__bar" />
          <span aria-hidden className="v2-burger__bar" />
        </button>

        {/*
          `v2-brand` — 로고의 `.my` 만 언제나 빨강으로 되돌린다 (리그색을 안 따라간다).
          ★2026-09-22 — 서플라이처럼 왼쪽 정렬★ (`GNB_ROW_ON` 일 때만).
          가운데 정렬(`v2-brand--center`)은 옛 판(햄버거만 있던 시절)의 몫이다.
        */}
        <Link
          href="/"
          aria-label="홈"
          className={`v2-brand flex items-center ${GNB_ROW_ON ? '' : 'v2-brand--center'} ${
            GNB_BRAND_ON ? '' : 'v2-brand--pc-off'
          }`}
        >
          <NavLogo className="h-[34px] w-auto max-md:h-[28px]" />
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
        {/*
          ⚠ ★2026-09-16 — 이 줄을 통째로 내렸다가 2026-09-22 — 다시 세웠다★
            (사장님: 처음엔 «모든 카테고리를 지워», 이번엔 «상단 바 배치나
             이런것도 전부 서플라이에서 영감받아서»).
            ★폰에서는 이 줄이 숨는다★(`max-md:hidden`) — 서플라이도 폰에서는
            카테고리를 안 보여 주고 햄버거 서랍으로만 연다. 길은 서랍에도 그대로 있다.
            ★지우지 않는다★ — `GNB_ROW_ON` 을 `false` 로 두면 그대로 내려간다.
        */}
        {GNB_ROW_ON ? (
        <nav className="v2-gnb max-md:hidden">
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
                  {/*
                    ⚠ ★2026-09-16 — 표장을 안 그린다★ (사장님: «위에 앰블럼들 다 없애고
                      그냥 글씨만 깔끔하게»). 그림 파일과 주소표(`GNB_MARK`)는
                      ★그대로 둔다★ — 홈 타일이 같은 파일을 쓴다 (`CLAUDE.md` 1-4).
                      되살리려면 `GNB_MARK_ON` 을 `true` 로.
                  */}
                  {GNB_MARK_ON && mark ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mark.src} width={mark.w} height={mark.h} alt="" aria-hidden className="v2-gnb__mark" />
                  ) : null}
                  {/*
                    ★이름을 다시 적는다★ (2026-09-12 사장님이 로고에서 «IPL» · «SPL» 글자를
                    잘라 내라고 하셔서, 이제 로고만 보고는 리그를 알 수 없다).

                    ⚠ 하루에 세 번 바뀐 자리다 —
                      ① 폰에서 글자 없음 (표장만)
                      ② 폰에서 표장 밑에 9.5px 로 이름
                      ③ 로고가 이름을 품게 되어 글자를 뺌
                      ④ ★지금★ — 로고에서 글자를 잘라 내서 다시 적는다
                    PC 는 옆에, 폰은 밑에 (자리는 CSS `.v2-gnb__cell` 이 정한다).
                  */}
                  <span className="v2-gnb__name">
                    {/* `10mountain` 에만 산 표시가 붙는다 — 이름이 아니라 화면 장식이다 */}
                    <LeagueLabel name={item.label} />
                  </span>
                </span>
              </Link>
            )
          })}
          {/* ★리그 뒤 두 자리 — 이용방법 · 게시판★ (2026-09-12 사장님) */}
          {GNB_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.aria}
              className={`v2-gnb__item v2-gnb__board ${pathname.startsWith(item.match) ? 'is-on' : ''}`}
            >
              <span className="v2-gnb__cell">
                {/* ⚠ 2026-09-16 — 이모티콘을 뺐다 (사장님: «그냥 글씨만 깔끔하게»).
                    `icon` 칸은 남긴다 — 다시 붙일 때 표만 채우면 된다 */}
                {item.icon === '' ? null : <span aria-hidden className="v2-gnb__emoji">{item.icon}</span>}
                <span>{item.label}</span>
              </span>
            </Link>
          ))}
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
        ) : null}

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
        /*
         * ⚠ 2026-09-16 — `md:hidden` 을 뗐다. 이제 서랍이 사이트의 유일한 메뉴다.
         *   배경은 ★불투명★ 이어야 한다 — `--v2-panel` 은 반투명(0.58)이라
         *   서랍 글자와 본문 글자가 겹쳐 읽혔다 (폰 실측).
         */
        /*
         * ⚠ ★2026-09-19 — 서랍 내용을 ★사이트맵★ 으로 갈았다★ (사장님:
         *   「햄버거 메뉴 기존거 없애고 밑에걸로 바꿔주고 기존의 밑애 것들은 없애버려」).
         *
         *   옛 서랍은 «경쟁전 / 일반전 / 게시판 / 참가신청» 네 묶음이었다.
         *   ★지우지 않았다★ (`CLAUDE.md` 1-4) — `navGroups` 가 그대로 살아 있고,
         *   아래 한 줄을 옛 코드로 되돌리면 그대로 돌아온다
         *   (`git show 031ec539 -- packages/ui/src/v2/SiteHeaderV2.tsx`).
         */
        /*
         * ⚠ ★2026-09-22 — 서랍을 서플라이 판으로 갈았다★ (사장님:
         *   「지금 햄버거 메뉴 cloud로 진열된거 ★전부 삭제하고 서플라이처럼★
         *    리그 / supply2.0 / supply1.0 / IPL / 열산 /
         *    게시판 / Hot게시판 / 자유게시판 / 로그인 이렇게 만들어」).
         *
         *   ★`SiteMapNav` 를 지우지 않았다★ (`CLAUDE.md` 1-4) — 파일도 export 도
         *   그대로다. 아래를 `<SiteMapNav inDrawer />` 로 되돌리면 여섯 칸짜리
         *   사이트맵 서랍이 그대로 돌아온다.
         */
        <div className="v2-drawer-supply">
          <DrawerNavSupply
            user={user}
            onLogout={onLogout}
            onClose={() => setOpen(false)}
            loginHref={loginHref}
          />
        </div>
      ) : null}
    </header>
  )
}

/* 아이콘은 원본 자산을 가져오지 않고 새로 그렸다 (`CLAUDE.md` 2장 4번) */

/* 햄버거 그림 — 2026-09-12 부터 안 쓴다. 서랍을 되살릴 때 필요해 남긴다 (CLAUDE.md 1-4) */
void 0
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
