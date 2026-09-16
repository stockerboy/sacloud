import Link from 'next/link'
import { FEATURED_LEAGUES } from '@sacloud/ui'

/**
 * ★왼쪽 메뉴 목록★ — 시안의 `> PLAYERS / > DATA / …`.
 *
 * ★가는 곳이 실제로 있는 것만 적는다★ (`CLAUDE.md` 2-1). 라우트는 전부
 * `apps/web/app/league/[leagueSlug]/…` 에 있는 것들이다.
 * `AND MORE ...` 만 주소가 없다(`null`) — ★없는 곳으로 보내지 않는다.★
 *
 * ★리그 slug 를 여기 적지 않는다★ — `FEATURED_LEAGUES` 가 정한다.
 *
 * ⚠ 이 표는 ★배경 코드(`homeCodeSnippets.ts`)와 같은 파일에 두지 않는다.★
 *   이 화면은 `HomeSearch`(클라이언트) 밑에 붙어서 클라이언트 번들로 떨어지는데,
 *   배경 코드 쪽은 `@sacloud/nexon` 과 계약 레지스트리를 통째로 끌고 온다.
 *   같이 두면 그게 폰으로 내려간다.
 */
const LEAGUE_SLUGS: readonly string[] = FEATURED_LEAGUES.map(
  (league) => league.href.split('/')[2] ?? '',
).filter((slug) => slug.length > 0)

const MAIN = LEAGUE_SLUGS[0] ?? 'supply'
const SECOND = LEAGUE_SLUGS[1] ?? MAIN

const HERO_MENU: readonly { label: string; href: string | null }[] = [
  { label: 'PLAYERS', href: `/league/${MAIN}/rank/player` },
  { label: 'DATA', href: `/league/${MAIN}/match` },
  { label: 'COMMUNITY', href: '/board/hot' },
  { label: 'MATCH', href: `/league/${SECOND}/match` },
  { label: 'RECORD', href: `/league/${MAIN}/rank/clan` },
  { label: 'AND MORE ...', href: null },
]

/**
 * ★★홈 히어로 윗머리 — 시안의 `Log_ / in SA CLOUD_`★★ (2026-09-17 · 사장님 시안)
 *
 * ```
 *   // menus          >  Log_
 *   > PLAYERS            in SA CLOUD_
 *   > DATA               PLAYERS × DATA × COMMUNITY
 *   > COMMUNITY
 *   > MATCH
 *   > RECORD
 *   > AND MORE ...
 * ```
 *
 * ── ★큰 로고 그림 대신이다★
 *   여태 이 자리에는 `MainLogo` 가 110px(폰 56px)로 서 있었다. 시안은 그 자리를
 *   ★글자★ 로 바꿨다. ★지우지 않았다★ — `HomeSearch.tsx` 의 `HERO_V2` 를 `false`
 *   로 두면 옛 로고가 그대로 돌아온다 (`CLAUDE.md` 1-4).
 *
 * ── ★메뉴는 진짜로 가는 곳만 건다★
 *   목록은 이 파일 위의 `HERO_MENU` 다. 리그 slug 는 `FEATURED_LEAGUES` 에서 온다.
 *   `AND MORE ...` 만 주소가 없다(`null`). ★없는 곳으로 보내지 않는다.★
 *
 * ── 폰에서도 두 칸이다
 *   시안 자체가 폰 화면(375px)이고 거기서도 왼쪽 메뉴 · 오른쪽 제목 두 칸이다.
 *   세로로 쌓으면 히어로가 두 배로 길어져 검색창이 접힌다.
 */
export function HomeHeroHead() {
  return (
    <div className="flex w-full items-start gap-[18px] max-md:gap-[12px]">
      {/* ── 왼쪽 메뉴 ─────────────────────────────────────── */}
      <nav
        aria-label="주요 화면 바로가기"
        className="shrink-0 pt-[6px] font-[var(--font-num)] text-[11px] leading-[1.9] max-md:pt-[3px] max-md:text-[9.5px]"
      >
        <div className="text-[var(--v2-text-ghost)]">{'// menus'}</div>
        {HERO_MENU.map((item) => (
          <div key={item.label} className="flex items-baseline gap-[5px]">
            <span aria-hidden className="text-[var(--v2-text-ghost2)]">
              {'>'}
            </span>
            {item.href === null ? (
              <span className="text-[var(--v2-text-ghost)]">{item.label}</span>
            ) : (
              <Link
                href={item.href}
                className="whitespace-nowrap text-[var(--v2-text-dim)] transition-colors duration-100 hover:text-[var(--v2-blue)]"
              >
                {item.label}
              </Link>
            )}
          </div>
        ))}
        {/* 시안의 짧은 밑줄 하나 — 메뉴가 여기서 끝난다는 표시다 */}
        <span aria-hidden className="mt-[8px] block h-[2px] w-[18px] bg-[var(--v2-text-ghost2)]" />
      </nav>

      {/* ── 오른쪽 제목 ───────────────────────────────────── */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-[10px] max-md:gap-[7px]">
          <span
            aria-hidden
            className="pt-[10px] font-[var(--font-num)] text-[15px] text-[var(--v2-text-ghost2)] max-md:pt-[5px] max-md:text-[12px]"
          >
            {'>'}
          </span>
          <h1 className="min-w-0 text-[46px] font-extrabold leading-[1.06] tracking-[-0.02em] max-md:text-[30px]">
            <span className="block text-[var(--v2-text-strong)]">
              Log
              <span className="home-code-caret">_</span>
            </span>
            <span className="block text-[var(--v2-blue)]">
              in SA CLOUD
              <span className="home-code-caret">_</span>
            </span>
          </h1>
        </div>

        {/* 시안의 한 줄 — `PLAYERS × DATA × COMMUNITY` */}
        <p className="mt-[10px] pl-[25px] text-[13px] tracking-[.18em] text-[var(--v2-text-dim)] max-md:mt-[7px] max-md:pl-[19px] max-md:text-[10px] max-md:tracking-[.12em]">
          PLAYERS <span className="text-[var(--v2-text-ghost2)]">×</span> DATA{' '}
          <span className="text-[var(--v2-text-ghost2)]">×</span> COMMUNITY
        </p>
      </div>
    </div>
  )
}
