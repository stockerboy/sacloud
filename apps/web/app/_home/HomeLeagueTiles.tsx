import Link from 'next/link'
import { FEATURED_LEAGUES, isLeaguePreparing } from '@sacloud/ui'

/**
 * ★★홈 리그 표장 셋★★ (2026-09-12 사장님)
 *
 * > «저 박스 세개 다 치워버리고 이 로고 써서 검색창 밑에 일열로 세련되게 배열해줘
 * >  왼쪽이 열산 가운데가 Ipl 오른쪽이 SPL»
 *
 * ```
 *      ◇          ◇          ◇        세 개가 ★한 줄★ · 가운데 정렬
 *      10        IPL        SPL       왼쪽 10 · 가운데 IPL · 오른쪽 SPL
 * ```
 *
 * ── 그림은 사장님이 주셨다
 *   한 장에 셋이 붙어 온 것을 셋으로 잘라 `public/assets/league-*.png` 로 두었다.
 *   ★CSS 로 흉내 내지 않는다★ — 옛 판은 산 능선을 `clip-path` 로 그렸었다 (2026-09-07 시안).
 *
 * ── ★가는 곳은 안 바뀌었다★
 *   `/league/{slug}/rank/player`. 준비중 리그(`daerule`)는 여기 안 나온다.
 *
 * ── 옛 판
 *   150×42 상자 셋에 글자만 넣고 열산에만 산 능선을 그렸다. 사장님이 «다 치워버리고» 라고 하셔서
 *   지웠다. 되살리려면 이 파일의 2026-09-07 판을 git 에서 꺼내면 된다 (`CLAUDE.md` 1-4).
 */

/** 리그 slug → 표장 그림. ★없는 리그는 안 그린다★ (지어내지 않는다) */
const MARK: Readonly<Record<string, string>> = {
  sanply: '/assets/league-10.png',
  nolink: '/assets/league-ipl.png',
  supply: '/assets/league-spl.png',
}

/** 표장 아래 글자에 얹는 빛 — 리그색 그대로 */
const GLOW: Readonly<Record<string, string>> = {
  sanply: 'rgba(159,196,255,.45)',
  nolink: 'rgba(91,141,255,.50)',
  supply: 'rgba(255,90,99,.45)',
}

/** ★왼쪽 10 · 가운데 IPL · 오른쪽 SPL★ (2026-09-12 사장님) */
const ORDER = ['sanply', 'nolink', 'supply'] as const

const TILES = ORDER.flatMap((slug) => {
  const found = FEATURED_LEAGUES.find((league) => league.href === `/league/${slug}`)
  if (!found || isLeaguePreparing(slug)) return []
  return [{ slug, label: found.label, href: `${found.href}/rank/player` }]
})

export function HomeLeagueTiles() {
  return (
    <nav aria-label="리그 랭킹 바로가기" className="mt-6">
      <ul className="mx-auto flex max-w-full items-start justify-center gap-[22px] max-md:gap-[12px]">
        {TILES.map((tile) => (
          <li key={tile.href}>
            <Link
              href={tile.href}
              className="group flex w-[88px] flex-col items-center gap-[5px] max-md:w-[72px]"
            >
              <span
                aria-hidden
                /* ⚠ 2026-09-12 두 번째 손질 — 사장님: «홈페이지 검색창 밑에있는 로고도 너무 크고 더 줄여서».
                   옛 값: PC 62px · 폰 52px (그 앞은 PC 92px). 지금: PC 46px · 폰 40px */
                className="block h-[46px] w-[46px] bg-contain bg-center bg-no-repeat opacity-[.95] transition-all duration-150 group-hover:scale-[1.06] group-hover:opacity-100 max-md:h-[40px] max-md:w-[40px]"
                style={{ backgroundImage: `url(${MARK[tile.slug]})` }}
              />
              {/* `<a>` 안쪽 span 에 색을 준다 — `a { color: inherit }` 함정 (D-231) */}
              <span
                className="text-[13px] font-bold tracking-[.14em] text-[var(--v2-text-muted)] transition-colors duration-150 group-hover:text-[var(--v2-text)] max-md:text-[12px]"
                style={{ textShadow: `0 0 14px ${GLOW[tile.slug] ?? 'transparent'}` }}
              >
                {tile.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
