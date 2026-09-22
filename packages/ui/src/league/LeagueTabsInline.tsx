'use client'

import type { CSSProperties } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { leagueTabs } from '../layout/LeagueTopBar'

/**
 * ★리그 탭을 본문 맨 위로★ (2026-09-16 사장님).
 *
 * > «위 두번째 바 없애버리고 저 파란색 원 세개에 각각 나눠서 최근경기 클랜랭킹 개인랭킹
 * >  넣어 (★상단고정 드래그내리면 고정돼있어서 안보임★)»
 *
 * ── 무엇이 문제였나
 *   상단에 고정된 띠가 ★둘★ 이었다 — 사이트 메뉴(로고·리그)와 리그 탭.
 *   폰에서 둘이 합쳐 150px 을 늘 차지하고, 스크롤을 내려도 따라와 화면을 먹었다.
 *
 * ── 지금
 *   리그 탭은 ★본문 맨 위★ 에 있고 ★제목 자리를 겸한다.★ 스크롤을 내리면 같이
 *   올라가 화면이 온전히 목록 몫이 된다. 고정된 띠는 하나뿐이다.
 *
 * ── 왜 인라인 스타일인가
 *   `.sac-v2` 안에서만 사는 CSS(`v2/tokens.css`)를 쓰면 ★그 껍데기를 두르지 않은
 *   화면에서 규칙이 통째로 안 먹는다.★ 실제로 첫 판이 그래서 «최근경기클랜랭킹개인랭킹»
 *   으로 붙어 나왔다. 이 조각은 어느 화면에 놓이든 같아야 하므로 제 스타일을 들고 다닌다.
 *
 * ── 강조는 ★색과 밑줄★
 *   지금 보고 있는 탭이 리그 색으로 굵게 서고 밑줄이 붙는다 — 상단바와 같은 결이다.
 */

const wrapStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  borderBottom: '1px solid #1a2438',
  marginBottom: 18,
}

const tabStyle: CSSProperties = {
  flex: '1 1 0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '13px 6px',
  fontSize: 15,
  fontWeight: 700,
  color: '#7b86a0',
  whiteSpace: 'nowrap',
  minWidth: 0,
}

/** 지금 보는 탭 — 리그 색은 `--v2-accent` 가 준다. 없으면 파랑으로 떨어진다 */
const onStyle: CSSProperties = {
  color: 'var(--v2-accent, #5b8dff)',
  /* 밑줄은 `inset` 그림자다 — `border-bottom` 싸움(D-232)을 피한다 */
  boxShadow: 'inset 0 -2px 0 0 var(--v2-accent, #5b8dff)',
}

export function LeagueTabsInline({ leagueSlug }: { leagueSlug: string }) {
  const pathname = usePathname() ?? ''
  const items = leagueTabs(leagueSlug)
  if (items.length === 0) return null
  return (
    /*
     * ★`sac-league-tabs-inline`★ — 이름만 달아 둔다 (2026-09-22 밤).
     *   서플라이 PC 화면에는 본문 탭이 없고 ★고정 띄★ 만 있다. 그래서
     *   `supply-skin.css` 가 이 이름으로 ★감춘다.★ ★지우지 않았다★ (`CLAUDE.md` 1-4) —
     *   그 껅데기를 벗기면(`globals.css` 의 @import 한 줄) 이 탭이 그대로 돌아온다.
     */
    <nav className="sac-league-tabs-inline" style={wrapStyle} aria-label="리그 메뉴">
      {items.map((item) => {
        const on = pathname.startsWith(item.href)
        return (
          <Link prefetch={false}
            key={item.href}
            href={item.href}
            aria-current={on ? 'page' : undefined}
            style={on ? { ...tabStyle, ...onStyle } : tabStyle}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
