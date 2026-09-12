import Link from 'next/link'
import { leagueLandingPath } from '@sacloud/contract'
import { FEATURED_LEAGUES, isLeaguePreparing } from '@sacloud/ui'

/**
 * ★★홈 사이트맵 다섯 칸★★ (2026-09-12 사장님이 내용을 다시 정하셨다)
 *
 * ```
 *   Community   Leagues   Operation   Users   Data
 *   ↑ 첫 글자만 파랑 — 세로로 읽으면 C-L-O-U-D
 * ```
 *
 * ── 2026-09-12 사장님 지시
 *   > «커넥티드를 커뮤니티로 바꾸고 게시판도 그냥 IPL SPL 구분없애고 핫게 자게 두개만 만들어»
 *   > «Users 10 개인랭킹 / IPL개인랭킹 클랜랭킹 / SPL개인랭킹 클랜랭킹»
 *   > «Data SPL 경기데이터 IPL 경기데이터 10경기데이터»
 *   > «모바일버전에서는 이거 전부 왼쪽에 cloud 약자 일열로 몰아넣고 옆에다가 세부카테고리»
 *
 *   ★폰에서는 약자가 왼쪽 한 줄★ 이고 그 오른쪽에 잔 항목이 줄줄이 눕는다.
 *   PC 는 옛 모양(다섯 칸) 그대로다.
 *
 * ── ★없는 곳으로 보내지 않는다★
 *   게시판은 이미 있는 ★리그 밖 게시판★(`/board/{category}`) 로 보낸다.
 *   `hot` · `free` · `notice` 는 계약의 `BOARD_CATEGORIES` 에 있는 값이다 — 지어내지 않았다.
 *   ⚠ 옛 판은 리그 안 게시판(`/league/{slug}/board`) 둘을 걸었다. 사장님이 그 구분을 없애라고 하셔서 바꿨다.
 *
 * ── 10 은 클랜랭킹이 없다
 *   `leagueScreen('sanply')` 가 `NO_LADDER` 라 클랜 화면이 없다. 그래서 개인랭킹만 건다.
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

/** 왼쪽부터 10 · IPL · SPL (2026-09-12 사장님이 홈 표장과 같은 차례로 맞추라고 하셨다) */
const ORDER = ['sanply', 'nolink', 'supply'] as const
const ordered = ORDER.flatMap((slug) => LIVE_LEAGUES.filter((l) => l.slug === slug))

/** 리그의 ★원래 이름★ — `sanply` 는 안 붙인다 (이름이 이미 `10` 이다) */
const LEAGUE_SUB: Readonly<Record<string, string>> = {
  supply: '서플라이',
  nolink: '무소속',
}

/** 클랜랭킹이 있는 리그인가 — 10 은 없다 */
const HAS_CLAN: Readonly<Record<string, boolean>> = { supply: true, nolink: true, sanply: false }

const COLUMNS: readonly { title: string; links: readonly SiteLink[] }[] = [
  {
    title: 'Community',
    links: [
      { label: 'HOT게시판', href: '/board/hot' },
      { label: '자유게시판', href: '/board/free' },
      { label: '공지사항', href: '/board/notice' },
    ],
  },
  {
    title: 'Leagues',
    links: ordered.map((league) => ({
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
    links: ordered.flatMap((league) => [
      { label: `${league.label} 개인랭킹`, href: `/league/${league.slug}/rank/player` },
      ...(HAS_CLAN[league.slug]
        ? [{ label: `${league.label} 클랜랭킹`, href: `/league/${league.slug}/rank/clan` }]
        : []),
    ]),
  },
  {
    title: 'Data',
    links: ordered.map((league) => ({
      label: `${league.label} 경기데이터`,
      href: `/league/${league.slug}/match`,
    })),
  },
  /* ★링크가 하나도 없는 칸은 그리지 않는다★ — 제목만 남은 칸은 빈 자리표시다 */
].filter((column) => column.links.length > 0)

export function HomeSitemap() {
  return (
    <nav
      aria-label="사이트맵"
      className="mx-auto mt-[66px] w-full max-w-[940px] border-t border-[var(--v2-head-divider)] pt-[28px]"
    >
      {/* PC — 다섯 칸. 폰 — 약자가 왼쪽 한 줄, 잔 항목은 오른쪽에 눕는다 (2026-09-12 사장님) */}
      <div className="grid grid-cols-5 gap-[26px] max-md:flex max-md:flex-col max-md:gap-[16px]">
        {COLUMNS.map((column) => (
          <div
            key={column.title}
            className="flex flex-col gap-[14px] max-md:grid max-md:grid-cols-[84px_minmax(0,1fr)] max-md:items-baseline max-md:gap-x-[10px] max-md:gap-y-0"
          >
            {/* 첫 글자만 파랑 — 세로로 읽으면 C-L-O-U-D */}
            <div className="text-[14.5px] font-bold text-[var(--v2-text-strong)] max-md:text-[13px]">
              <span className="text-[var(--v2-blue)]">{column.title.charAt(0)}</span>
              {column.title.slice(1)}
            </div>
            <div className="flex flex-col gap-[9px] text-[12.5px] max-md:flex-row max-md:flex-wrap max-md:gap-x-[12px] max-md:gap-y-[6px] max-md:text-[12px]">
              {column.links.map((link) => (
                <Link key={link.href} href={link.href} className="flex items-baseline gap-[6px]">
                  <span className="whitespace-nowrap text-[var(--v2-text-dim)] transition-colors duration-100 hover:text-[var(--v2-text-strong)]">
                    {link.label}
                  </span>
                  {link.sub ? (
                    <span className="text-[10.5px] text-[var(--v2-text-ghost)] max-md:hidden">{link.sub}</span>
                  ) : null}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </nav>
  )
}
