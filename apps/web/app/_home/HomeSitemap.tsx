import Link from 'next/link'
import { leagueBoardCategory, leagueBoardPath, leagueLandingPath } from '@sacloud/contract'
import { FEATURED_LEAGUES, isLeaguePreparing } from '@sacloud/ui'

/**
 * ★★홈 사이트맵 다섯 칸★★ (2026-09-07 · Part 10 ④ · 시안)
 *
 * ```
 *   Connected   Leagues   Operation   Users   Data
 *   ↑ 첫 글자만 파랑 — 세로로 읽으면 C-L-O-U-D
 * ```
 * 940px · 5칸 · gap 26 · 위 1px 선 · 제목 14.5/700 · 링크 12.5 (시안 실측).
 *
 * ── ★없는 곳으로 보내지 않는다★
 *
 *   시안이 적어 둔 항목 중 ★우리에게 없는 것★ 은 넣지 않았다.
 *   빈 자리를 지어내면 누른 사람이 막다른 길에 선다 (홈에서 인기게시글을 뺐던 이유와 같다).
 *
 *   ```
 *   시안                    우리                  왜
 *   Hot게시판/자유/공지      SPL·IPL 게시판        그 세 카테고리가 없다. 리그 안 게시판만 있다
 *   운영방침                이용약관·개인정보      「운영방침」 문서가 없다. 실제 문서 둘로
 *   TOP5                   —                     그런 화면이 없다
 *   최신경기                리그별 경기            경기 목록은 리그 안에 있다
 *   ```
 *
 *   ⚠ ★`통합 랭킹`(`/rank`)을 여기서 처음 링크한다.★ 화면은 O-043 에서 이미 만들어
 *     운영에 올라가 있는데 «들어가는 길은 나중에 정한다» 로 남아 있었다.
 *     시안의 `Users` 칸이 그 자리라고 판단했다. ★아니면 이 줄만 빼면 된다.★
 *
 * ── 목록은 계약이 정한다
 *   게시판이 있는 리그(`leagueBoardCategory`) · 리그가 눌리면 갈 곳(`leagueLandingPath`) ·
 *   준비중 리그(`isLeaguePreparing`) 전부 ★이미 있는 함수★ 다. 여기서 판단하지 않는다.
 */

interface SiteLink {
  label: string
  href: string
  /** 라벨 옆 작은 글자. 없으면 안 그린다 */
  sub?: string
}

const LIVE_LEAGUES = FEATURED_LEAGUES.map((league) => ({
  ...league,
  slug: league.href.split('/')[2] ?? '',
})).filter((league) => !isLeaguePreparing(league.slug))

/**
 * 리그의 ★원래 이름★ — 시안이 `Leagues` 칸에 작게 붙여 둔 말이다.
 * ⚠ `sanply` 는 안 붙인다. 화면 이름이 이미 `10mountain` 이라 「10mountain 열산」이 된다.
 */
const LEAGUE_SUB: Readonly<Record<string, string>> = {
  supply: '서플라이',
  nolink: '무소속',
}

const COLUMNS: readonly { title: string; links: readonly SiteLink[] }[] = [
  {
    title: 'Connected',
    links: LIVE_LEAGUES.filter((league) => leagueBoardCategory(league.slug) !== null).map(
      (league) => ({
        label: `${league.label} 게시판`,
        href: leagueBoardPath(league.slug),
      }),
    ),
  },
  {
    title: 'Leagues',
    links: LIVE_LEAGUES.map((league) => ({
      label: league.label,
      href: leagueLandingPath(league.slug),
      sub: LEAGUE_SUB[league.slug],
    })),
  },
  {
    title: 'Operation',
    links: [
      { label: '이용약관', href: '/clause/service' },
      { label: '개인정보 취급방침', href: '/clause/policy' },
    ],
  },
  {
    title: 'Users',
    links: [
      { label: '통합 랭킹', href: '/rank' },
      { label: '내 정보', href: '/me' },
    ],
  },
  {
    title: 'Data',
    links: LIVE_LEAGUES.map((league) => ({
      label: `${league.label} 경기`,
      href: `/league/${league.slug}/match`,
    })),
  },
  /* ★링크가 하나도 없는 칸은 그리지 않는다★ — 제목만 남은 칸은 빈 자리표시다 */
].filter((column) => column.links.length > 0)

export function HomeSitemap() {
  return (
    <nav
      aria-label="사이트맵"
      className="mx-auto mt-[66px] grid w-full max-w-[940px] grid-cols-5 gap-[26px] border-t border-[var(--v2-head-divider)] pt-[28px] max-md:grid-cols-2"
    >
      {COLUMNS.map((column) => (
        <div key={column.title} className="flex flex-col gap-[14px]">
          {/* 첫 글자만 파랑 — 세로로 읽으면 C-L-O-U-D (시안이 그렇게 지었다) */}
          <div className="text-[14.5px] font-bold text-[var(--v2-text-strong)]">
            <span className="text-[var(--v2-blue)]">{column.title.charAt(0)}</span>
            {column.title.slice(1)}
          </div>
          <div className="flex flex-col gap-[9px] text-[12.5px]">
            {column.links.map((link) => (
              <Link key={link.href} href={link.href} className="flex items-baseline gap-[6px]">
                <span className="text-[var(--v2-text-dim)] transition-colors duration-100 hover:text-[var(--v2-text-strong)]">
                  {link.label}
                </span>
                {link.sub ? (
                  <span className="text-[10.5px] text-[var(--v2-text-ghost)]">{link.sub}</span>
                ) : null}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}
