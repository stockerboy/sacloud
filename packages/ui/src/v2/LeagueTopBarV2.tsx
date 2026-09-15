'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LeagueLabel } from '../layout/LeagueLabel'
import { leagueTabs } from '../layout/LeagueTopBar'
import { leagueLandingPath } from '@sacloud/contract'
import { v2Class } from './leagueAccent'

/**
 * ★★v2 리그 탭바★★ — 54px (2026-09-07 · Part 10 ③ · 사장님 승인)
 *
 * ── 시안 실측
 *   ```
 *   ┌────────────────────────────────────────────── 54px ──┐
 *   │  클랜랭킹   ★개인랭킹★   LIVE   게시판                │
 *   └──────────────────────────────────────────────────────┘
 *      14px textDim        흰 700 + 밑줄 2px(리그색)
 *   배경 #000 — 머리띠(#0a0b0f)보다 ★더 검다★
 *   ```
 *
 * ── ★탭을 시안에 맞춘다고 지우지 않았다★
 *   탭 목록은 `leagueTabs()` 가 정한다 — ★옛 판과 같은 함수를 그대로 부른다.★
 *   리그마다 다르다 (10mountain 은 클랜랭킹이 없다). 시안에 `LIVE`·`게시판` 이
 *   있다고 없는 리그에 만들지 않고, 시안에 없다고 있는 탭을 빼지도 않는다.
 *   ★href 는 한 글자도 안 바뀌었다.★
 *
 * ── ★리그 이름은 남긴다★
 *   시안 탭바에는 리그명이 없다. 우리 화면에는 있었다 — 지우면 «지금 어느 리그인가» 를
 *   말해 주는 것이 GNB 의 밝은 글자 하나뿐이 된다. 그래서 왼쪽에 그대로 둔다
 *   (`CLAUDE.md` 1-4 · «기능을 디자인에 맞춘다고 삭제하지 않는다»).
 *
 * ── ★옛 판을 지우지 않았다★
 *   `packages/ui/src/layout/LeagueTopBar.tsx` 가 그대로 있다. 되돌리려면 리그
 *   레이아웃의 import 한 줄만 되돌린다.
 *
 * ── 높이를 바꾸지 마라
 *   PC 54px(`--spacing-leaguebar`) · 모바일 두 줄 102px(`--spacing-leaguebar-m`).
 *   리그 레이아웃이 ★정확히 그만큼★ 본문을 내린다. 여기를 바꾸면 저기도 바꿔야 한다.
 */

/**
 * ★폰 리그바에 「리그 이름 줄」 을 둘 것인가★ (2026-09-15 밤 사장님이 내리심).
 * `true` 로 두면 옛 두 줄(102px)로 돌아간다 — `--spacing-leaguebar-m` 도 함께 되돌린다.
 * 타입을 `boolean` 으로 넓혀 둔다 — 리터럴로 좁히면 옛 가지가 «닿을 수 없는 코드» 가 된다.
 */
const LEAGUE_NAME_ROW: boolean = false

export interface LeagueTopBarV2Props {
  /** 라우트 slug (`supply` · `nolink` · `sanply`). 화면에 쓰지 않는다 */
  leagueSlug: string
  /** 화면에 쓰는 리그 이름 (`SPL` · `IPL` · `10mountain`) */
  leagueName: string
}

export function LeagueTopBarV2({ leagueSlug, leagueName }: LeagueTopBarV2Props) {
  const pathname = usePathname() ?? ''
  const items = leagueTabs(leagueSlug)
  /* 리그 이름을 누르면 그 리그의 첫 화면으로 간다 — 옛 판과 같다 */
  const homeHref = leagueLandingPath(leagueSlug)

  return (
    <div
      className={`${v2Class(leagueSlug, 'v2-tabbar')} fixed top-nav z-30 w-full`}
    >
      {/* --- PC: 한 줄. 리그명 + 탭 --- */}
      {/* ⚠ 2026-09-10 정정 — `max-md:hidden` 은 `.sac-v2 .v2-tabbar__inner{display:flex}` (무계층) 에
          져서 폰에서 PC 줄까지 보였다. 가리는 일은 tokens.css 의 `v2-tabbar__pc` 미디어 규칙이 한다 */}
      <div className="v2-container v2-tabbar__inner v2-tabbar__pc">
        <Link href={homeHref} className="v2-tabbar__league">
          <LeagueLabel name={leagueName} />
        </Link>
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`v2-tab ${pathname.startsWith(item.href) ? 'is-on' : ''}`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {/*
        --- 모바일: ★한 줄★ (54 = `--spacing-leaguebar-m`) ---

        ⚠ ★2026-09-15 밤 — 두 줄에서 한 줄로★ (사장님: «상단에 바가 두개나 있는게 별로야»).
          옛 판은 ★리그 이름 줄(48px)★ 이 위에 있어 102px 이었다. 그 이름은 바로 위
          GNB 가 이미 밝은 글자로 말해 준다 — 같은 말을 두 줄로 두 번 하느라 본문이
          48px 밀려 있었다.
          ★지우지 않고 감춘다★ (`CLAUDE.md` 1-4) — 아래 `LEAGUE_NAME_ROW` 를 `true` 로
          두면 그대로 돌아온다. 그때는 `--spacing-leaguebar-m` 도 102px 로 되돌린다.
      */}
      <div className="v2-tabbar__m">
        {LEAGUE_NAME_ROW ? (
          <div className="flex h-12 items-center border-b border-[var(--v2-row-divider)] px-6">
            <span className="truncate text-[15px] font-bold text-[var(--v2-text-strong)]">
              <LeagueLabel name={leagueName} />
            </span>
          </div>
        ) : null}
        <div className="v2-tabbar__inner">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`v2-tab flex-1 justify-center px-0 ${
                pathname.startsWith(item.href) ? 'is-on' : ''
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
