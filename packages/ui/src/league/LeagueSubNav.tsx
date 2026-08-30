'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BETA_NOTICE, BETA_NOTICE_HEADLINE } from './betaNoticeText'

/**
 * 리그 화면 공통 서브내비 — 전역 GNB 바로 아래 고정된다.
 *
 * `적진` 톤 (2026-08-30) — 회색 띠(#292929)와 주황 강조를 걷어냈다.
 * 배경은 카드 검정, 아래는 1px 선, 현재 위치만 **진홍 밑줄 2px**이다.
 * 띠 높이(3rem)와 본문 밀림(`pt-12` / 모바일 `pt-24`)은 그대로다 — 레이아웃이 어긋나면 안 된다.
 *
 * 구조
 * - PC  : 한 줄. 리그명(왼쪽) + 탭 3개
 * - 모바일: 두 줄. 리그명 줄 + 탭 3개가 화면 폭을 균등 분할한 줄
 *
 * **이동 경로(href)는 하나도 바뀌지 않았다.**
 */

const ITEM =
  'flex cursor-pointer items-center justify-center border-b-2 border-b-transparent px-4 text-sm tracking-wide text-meta hover:text-text'
const ITEM_ACTIVE = 'border-b-accent font-bold text-text-strong'

/**
 * 베타 시즌 배지.
 *
 * 베타는 **숨겨진 시즌이 아니라 공개 시즌**이다. 그래서 감추지 않고 표시하되,
 * 사이트 전체를 덮는 경고문으로 만들지 않는다 — 작은 배지 하나 + 설명이면 된다.
 *
 * 내부 번호가 0이라고 `Season 0`이라고 쓰지 않는다. 이름은 서버가 준 `season_label`이다 (D-098).
 */
export function BetaBadge({ label = BETA_NOTICE_HEADLINE }: { label?: string }) {
  return (
    <span
      className="ml-2 rounded-[var(--radius)] border border-line px-1.5 py-0.5 text-[11px] font-bold leading-none text-meta"
      title={BETA_NOTICE}
    >
      {label}
    </span>
  )
}

export function LeagueSubNav({
  leagueSlug,
  leagueName,
}: {
  leagueSlug: string
  leagueName: string
}) {
  const pathname = usePathname() ?? ''
  const base = `/league/${leagueSlug}`

  /* 아이콘은 원본이 클랜랭킹·개인랭킹 **둘 다 정렬 아이콘**을 쓴다 (2026-08-27 실측).
     우리는 막대그래프/사람으로 갈라 놓았었다 (UI_PARITY_AUDIT 2-7). */
  const items = [
    { label: '리그홈', href: `${base}/home`, icon: <HomeIcon /> },
    { label: '클랜랭킹', href: `${base}/rank/clan`, icon: <SortIcon /> },
    { label: '개인랭킹', href: `${base}/rank/player`, icon: <SortIcon /> },
  ]

  return (
    <div className="fixed top-nav z-30 w-full">
      {/* --- PC: 리그명과 탭이 한 줄이다 --- */}
      <div className="hidden h-12 border-b border-line bg-card md:block">
        <div className="pc-container flex h-full items-stretch">
          {/*
            리그명 옆에 붙어 있던 `Beta Season` 배지는 **원본에 없다** — 뺐다
            (UI_PARITY_AUDIT 2-2 · 2-3). 배지에 밀려 리그명이 두 줄로 깨지기도 했다.
            `BetaBadge` 컴포넌트 자체는 관리자 화면 등에서 쓸 수 있어 남겨 둔다.
          */}
          <Link
            href={`${base}/home`}
            className="mr-14 flex w-52 items-center font-display text-lg tracking-wide text-text-strong"
          >
            {leagueName}
          </Link>
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${ITEM} ${pathname.startsWith(item.href) ? ITEM_ACTIVE : ''}`}
            >
              <span className="pr-2">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      {/* --- 모바일: 두 줄이다. 리그명 줄 + 탭 줄 (2026-08-28 원본 관측) --- */}
      <div className="md:hidden">
        {/* 1줄 — 왼쪽 리그명, 오른쪽 `리그홈`(주황) */}
        <div className="flex h-12 items-center justify-between border-b border-line-soft bg-card px-3">
          <span className="truncate font-display text-base tracking-wide text-text-strong">
            {leagueName}
          </span>
          <Link
            href={`${base}/home`}
            className="flex shrink-0 items-center gap-1.5 pl-3 text-sm text-meta"
          >
            <HomeIcon />
            <span className="font-bold">리그홈</span>
          </Link>
        </div>

        {/* 2줄 — 탭 3개가 화면 폭을 균등 분할한다 */}
        <div className="flex h-12 items-stretch border-b border-line bg-card">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 items-center justify-center border-b-2 border-b-transparent text-sm tracking-wide ${
                pathname.startsWith(item.href) ? ITEM_ACTIVE : 'text-meta'
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

/* 아이콘은 자산을 가져오지 않고 직접 그렸다 (18×14) */

function HomeIcon() {
  return (
    <svg viewBox="0 0 18 14" className="h-[14px] w-[18px]" fill="currentColor" aria-hidden>
      <path d="M9 0 0 7h2.5v7h5V9.5h3V14h5V7H18z" />
    </svg>
  )
}

/** 정렬 아이콘 — 클랜랭킹·개인랭킹이 같은 아이콘을 쓴다 */
function SortIcon() {
  return (
    <svg viewBox="0 0 18 14" className="h-[14px] w-[18px]" fill="currentColor" aria-hidden>
      <path d="M4 0h1.6v10.4L8 8l1.1 1.1-4.3 4.3-4.3-4.3L1.6 8l2.4 2.4z" />
      <path d="M11 1h7v1.6h-7zM11 5h5.5v1.6H11zM11 9h4v1.6h-4z" />
    </svg>
  )
}
