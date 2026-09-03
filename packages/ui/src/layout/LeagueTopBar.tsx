'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { leagueBoardCategory, leagueBoardPath, leagueLandingPath, leagueScreen } from '@sacloud/contract'
import { leagueMatchListPath } from '../common/paths'
import { LeagueLabel } from './LeagueLabel'

/**
 * 즐겨찾기가 실제로 동작하는가 (2026-09-02).
 *
 * 지금은 **동작하지 않는다.** 누를 수는 있는데 저장되는 곳도, 다시 꺼내 보는 화면도 없다.
 * 그래서 버튼 자체를 감춘다 — 아래 사용처의 주석 참조.
 *
 * 타입을 `boolean` 으로 넓혀 둔다. `false` 리터럴로 좁혀지면 되살릴 때 쓸 가지가
 * «닿을 수 없는 코드» 가 되어 tsc/lint 가 문다 (알 스위치와 같은 이유).
 */
/** 즐겨찾기가 동작하는가. **두 화면이 같은 값을 본다** (O-038 ⑤) — 여기 한 줄이 둘을 함께 여닫는다 */
export const FAVORITE_ENABLED: boolean = false

/**
 * 리그 화면 상단 — **검정 띠 + 탭 줄**, 그리고 그 아래 **버건디 히어로 띠** (D-251).
 *
 * ── 왜 `LeagueSubNav` 를 고치지 않고 새로 만들었나
 *   `packages/ui/src/league/LeagueSubNav.tsx` 는 지금 그대로 남아 있다. 지우지 않았다
 *   (`CLAUDE.md` 10-4 — 방식을 바꿔도 옛 버전을 남긴다). 그쪽은 **탭 3개**(리그홈 포함)에
 *   회색 띠 하나짜리 옛 판이고, 이쪽이 새 판이다. 되돌리려면 리그 레이아웃의 import 를
 *   `LeagueSubNav` 로 되돌리면 된다 — 다른 파일은 하나도 안 건드려도 된다.
 *
 * ── 무엇을 바꿨나
 *   ```
 *   탭          [리그홈][클랜랭킹][개인랭킹]  →  [클랜랭킹][개인랭킹]
 *              사용자 지시: *"리그홈은 다 없애고 클랜랭킹이랑 개인랭킹만 해"*
 *   띠 색       카드색 한 겹                →  셸색(`bg-ink`) — 가장 어두운 층
 *   히어로      없었다                      →  `bg-hero` 버건디 띠 (리그 정체성)
 *   ```
 *
 * ── 층 (「투톤」의 실체)
 *   ```
 *   GNB          --color-ink   #050303   가장 어둡다
 *   리그 띠·탭    --color-ink   #050303   셸의 연장이다. GNB 와 한 덩어리로 읽힌다
 *   히어로       --color-hero  #2a0d10   버건디. 이 한 줄이 리그 화면의 얼굴이다
 *   본문         --color-page  #100b0b   셸보다 한 층 밝다
 *   ```
 *   **히어로 색은 `--color-hero` 토큰 하나뿐이다.** 이 파일에는 색값을 적지 않았다 —
 *   `packages/ui/src/styles.css` 의 그 한 줄만 고치면 전부 따라온다.
 *
 * ── 높이를 바꾸지 마라
 *   띠는 PC 에서 `h-12`(3rem), 모바일에서 두 줄 `h-24`(6rem)다. 리그 레이아웃이
 *   `pt-24 md:pt-12` 로 본문을 정확히 그만큼 내린다. 여기 높이를 바꾸면 저기도 바꿔야 한다.
 *
 * ── 진홍은 밑줄 2px 하나뿐이다
 *   면을 진홍으로 칠하지 않는다 (D-204). 현재 위치 표시는 밑줄이 한다.
 */

/*
 * ⚠ `border-b-transparent` 를 활성 클래스와 **같은 자리**에 두면 활성 밑줄이 안 그려진다
 * (D-232). 빌드된 CSS 에서 `.border-b-transparent` 가 `.border-b-accent` 보다 뒤에 와서
 * 붙이는 순서와 무관하게 이긴다. 그래서 **비활성일 때만** transparent 를 준다.
 */
const TAB =
  'flex items-center justify-center gap-2 border-b-2 text-[15px] tracking-wide transition-colors duration-100'
const TAB_IDLE = 'border-b-transparent text-meta hover:text-text'
const TAB_ACTIVE = 'border-b-accent font-bold text-text-strong'

export interface LeagueTopBarProps {
  /** 라우트 slug (`supply` · `nolink` · `sanply`). 화면에 쓰지 않는다 */
  leagueSlug: string
  /** 화면에 쓰는 리그 이름 (`SPL` · `IPL` · `10mountain`) */
  leagueName: string
}

/**
 * 리그 탭. **리그홈은 없다.**
 * 경로(href)는 예전과 하나도 안 바뀌었다 — 없앤 것은 「리그홈」 항목 하나뿐이다.
 *
 * ── 2026-09-02 (D-260) — **이름이 둘 다 바뀌었다.** 가는 곳은 그대로다
 *   ```
 *   클랜랭킹  →  고용가능 클랜    사용자: *"클랜순위는 없애고 고용가능 클랜 이라는 항목으로"*
 *   개인랭킹  →  개인순위        사용자: *"두번째가 개인순위"*
 *   ```
 *   `/rank/clan` · `/rank/player` 라우트는 **한 글자도 바뀌지 않았다** (D-246 —
 *   slug 와 라우트는 건드리지 않는다). 바뀐 것은 사람에게 보이는 글자뿐이다.
 *
 * ⚠ 클랜 화면 유무는 **여기서 판단하지 않는다.** `leagueScreen(slug).clanRank` 가 정한다
 *   (`packages/contract/src/leagueScreen.ts`). 화면마다 `slug === 'sanply'` 를 뿌리지
 *   않는다는 규칙(D-204)을 지키려고 표를 그 한 곳에 모아 뒀다.
 *   `10mountain`(`sanply`)은 클랜 화면이 없어서 탭이 **개인순위 하나**다.
 */
export function leagueTabs(leagueSlug: string) {
  const base = `/league/${leagueSlug}`
  const tabs = [{ label: '개인순위', href: `${base}/rank/player` }]
  if (leagueScreen(leagueSlug).clanRank) {
    tabs.unshift({ label: '고용가능 클랜', href: `${base}/rank/clan` })
  }
  /*
   * ★경기 (2026-09-03 · O-015)★
   *
   * **닉네임도 클랜명도 모르는 사람이 사이트에서 처음으로 볼 것**이다.
   * 리그마다 다 있으므로 분기를 걸지 않는다 — 경기가 없는 리그는 화면이
   * 「아직 경기가 없습니다」로 말한다. 탭을 감춰서 없는 것처럼 만들지 않는다.
   */
  tabs.push({ label: '경기', href: leagueMatchListPath(leagueSlug) })
  /* 리그 안 게시판 (2026-09-02 지시 #14-2 — "게시판은 SPL메뉴 안에 있는거다").
     카테고리가 있는 리그에만 셋째 탭이 붙는다. 10mountain 은 없다 (`leagueScreen` 표가 정한다) */
  if (leagueBoardCategory(leagueSlug) !== null) {
    tabs.push({ label: '게시판', href: leagueBoardPath(leagueSlug) })
  }
  return tabs
}

export function LeagueTopBar({ leagueSlug, leagueName }: LeagueTopBarProps) {
  const pathname = usePathname() ?? ''
  const items = leagueTabs(leagueSlug)
  /* 리그 이름을 누르면 그 리그의 첫 화면으로 간다. 리그홈으로 보내지 않는다 */
  const homeHref = leagueLandingPath(leagueSlug)

  return (
    <div className="fixed top-nav z-30 w-full">
      {/* --- PC: 한 줄. 왼쪽 리그명 + 탭 둘 --- */}
      <div className="hidden h-12 border-b border-line bg-ink md:block">
        <div className="pc-container flex h-full items-stretch">
          <Link
            href={homeHref}
            className="mr-12 flex shrink-0 items-center font-display text-lg tracking-wide"
          >
            {/* `<a>` 안쪽 `<span>` 에 색을 준다 — `<a>` 에 직접 주면 눌린다 (D-231 함정) */}
            <span className="text-text-strong">
              <LeagueLabel name={leagueName} />
            </span>
          </Link>
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${TAB} px-6 ${
                pathname.startsWith(item.href) ? TAB_ACTIVE : TAB_IDLE
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      {/* --- 모바일: 두 줄. 리그명 줄 + 탭 줄 (합쳐서 h-24 = pt-24 와 같다) --- */}
      <div className="md:hidden">
        <div className="flex h-12 items-center border-b border-line-soft bg-ink px-3">
          <span className="truncate font-display text-base tracking-wide text-text-strong">
            <LeagueLabel name={leagueName} />
          </span>
        </div>
        <div className="flex h-12 items-stretch border-b border-line bg-ink">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${TAB} flex-1 ${
                pathname.startsWith(item.href) ? TAB_ACTIVE : TAB_IDLE
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

export interface LeagueHeroBandProps {
  /** 화면에 쓰는 리그 이름 */
  leagueName: string
  /** 공식 리그인가 */
  official?: boolean
  /** 참여 클랜 수. 아직 안 왔으면 `undefined` — **0 으로 지어내지 않는다** */
  clanCount?: number
}

/**
 * 버건디 히어로 띠.
 *
 * 리그 이름 · 공식/비공식 배지 · 참여 클랜 수 · 즐겨찾기. 원본의 히어로가 담던 것과
 * 같은 정보다 — 색과 여백만 우리 것으로 올렸다.
 *
 * ⚠ 즐겨찾기는 **아직 동작하지 않는다.** 옛 `LeagueHeader` 도 그랬다 (표시만 한다).
 *   없던 기능을 새로 만들지 않았고, 있던 표시를 지우지도 않았다.
 */
export function LeagueHeroBand({ leagueName, official, clanCount }: LeagueHeroBandProps) {
  return (
    <div className="border-b border-hero-line bg-hero">
      <div className="pc-container flex flex-wrap items-center gap-x-5 gap-y-3 py-11 max-md:py-8">
        <h1 className="font-display text-[2.75rem] leading-none tracking-wide text-hero-fg max-md:text-[2rem]">
          <LeagueLabel name={leagueName} />
        </h1>

        {/* 공식/비공식 — 면을 칠하지 않고 1px 테두리로 만든다 */}
        <span className="flex items-center gap-1.5 rounded-[var(--radius)] border border-hero-line px-2.5 py-1 text-xs tracking-wide text-hero-fg">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              official ? 'bg-hero-fg' : 'bg-hero-meta'
            }`}
            aria-hidden
          />
          {official ? '공식' : '비공식'}
        </span>

        {/* 아직 안 온 값은 숫자 자리를 비워 둔다. 0 을 찍지 않는다.
            ⚠ 띠 위에서는 `text-meta` 를 쓰지 않는다 — 파란 면 위에서 **1.69:1** 이 된다
               (2026-09-02 운영 실측). 띠 전용 색은 `--color-hero-meta` (4.77:1) */}
        <span className="text-sm text-hero-meta">
          {clanCount === undefined ? (
            '클랜 참여중'
          ) : (
            <>
              <span className="num text-hero-fg">{clanCount.toLocaleString('ko-KR')}</span>
              개의 클랜 참여중
            </>
          )}
        </span>

        {/*
          ⚠ 2026-09-02 — **즐겨찾기 버튼을 감췄다.**

          누를 수 있고 눌리는데 **아무 일도 일어나지 않는** 버튼이었다.
          「준비중」은 `title`(툴팁)에만 있어서 마우스를 올리기 전에는 보이지 않고,
          모바일에서는 툴팁이 아예 안 뜬다. 그래서 없는 기능이 있는 것처럼 보였다.

          ```
          false  버튼을 그리지 않는다        ← 지금
          true   옛 버튼이 그대로 돌아온다    ← 즐겨찾기가 붙으면 이 한 줄
          ```
          `StarIcon` 과 마크업은 **지우지 않았다** (`CLAUDE.md` 10-4).
        */}
        {FAVORITE_ENABLED ? (
          <button
            type="button"
            className="btn-line ml-auto px-3 py-1.5 text-xs max-md:ml-0"
            title="즐겨찾기는 아직 준비중입니다"
          >
            <StarIcon />
            즐겨찾기
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** 별 — 자산을 가져오지 않고 직접 그렸다 */
function StarIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
      <path d="M8 .8 10.2 5.4 15.2 6.1 11.6 9.6l.9 5-4.5-2.4-4.5 2.4.9-5L.8 6.1l5-.7z" />
    </svg>
  )
}
