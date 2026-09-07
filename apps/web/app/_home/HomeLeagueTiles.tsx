import Link from 'next/link'
import { FEATURED_LEAGUES, isLeaguePreparing } from '@sacloud/ui'

/**
 * ★★홈 리그 타일 셋★★ (2026-09-07 · Part 10 ④ · 시안)
 *
 * ```
 *   ┌──────────┐ ┌──────────┐     150×42 · 위 2px 리그색
 *   │   SPL    │ │   IPL    │     322px 안에서 두 개가 한 줄
 *   └──────────┘ └──────────┘
 *        ┌──────────┐              셋째는 아래 가운데로 접힌다
 *        │  10 열산 │              열산에만 산 능선
 *        └──────────┘
 * ```
 * 322 = 150 + 10 + 150 + 12(여유). 시안 주석이 그 숫자를 못 박아 뒀다.
 *
 * ── ★가는 곳은 안 바뀌었다★
 *   옛 버튼 셋과 ★같은 주소★ (`/league/{slug}/rank/player`).
 *   준비중 리그(`daerule`)는 여기 안 나온다 — 옛 판과 같은 규칙이다.
 *   ⚠ 목록은 `FEATURED_LEAGUES` 한 곳에서 온다. 여기에 리그 이름을 다시 적지 않는다.
 *
 * ── 산 능선
 *   시안이 `clip-path` 두 겹으로 그렸다. ★그림 파일이 아니다★ —
 *   없는 자산을 지어내지 않고 시안이 준 좌표를 그대로 쓴다.
 */

/** 리그 slug → 위 2px 선 색. ★모르는 리그는 색을 안 준다★ */
const INK: Readonly<Record<string, string>> = {
  supply: 'var(--v2-red)',
  nolink: 'var(--v2-blue)',
  sanply: 'var(--v2-green)',
}

/**
 * 타일에 붙는 작은 글자. ★지금은 하나도 없다★ — 그래서 아무 타일에도 안 그려진다.
 *
 * 시안은 `10` 옆에 `열산` 을 붙였다. ★우리 리그 이름이 이미 `10mountain` 이라★
 * 그대로 두면 「10mountain 열산」이 되어 같은 말을 두 번 한다.
 * 리그 이름은 `FEATURED_LEAGUES` 한 곳이 정한다 (`CLAUDE.md` 4장) — 여기서 안 바꾼다.
 */
const SUB: Readonly<Record<string, string>> = {}

/** 산 능선 두 겹 — 시안 좌표 그대로 */
const RIDGE = [
  {
    height: 26,
    background: 'linear-gradient(180deg,rgba(34,197,94,.34),rgba(34,197,94,.10))',
    clipPath: 'polygon(0% 100%, 17% 42%, 30% 68%, 47% 10%, 63% 52%, 74% 32%, 100% 100%)',
  },
  {
    height: 16,
    background: 'rgba(34,197,94,.16)',
    clipPath: 'polygon(0% 100%, 26% 30%, 44% 74%, 68% 22%, 88% 62%, 100% 100%)',
  },
] as const

const TILES = FEATURED_LEAGUES.map((league) => {
  const slug = league.href.split('/')[2] ?? ''
  return { slug, label: league.label, href: `${league.href}/rank/player` }
}).filter((tile) => !isLeaguePreparing(tile.slug))

export function HomeLeagueTiles() {
  return (
    <nav aria-label="리그 랭킹 바로가기" className="mt-4">
      <ul className="mx-auto flex w-[322px] max-w-full flex-wrap justify-center gap-[10px]">
        {TILES.map((tile) => (
          <li key={tile.href}>
            <Link
              href={tile.href}
              className="relative flex h-[42px] w-[150px] items-center justify-center gap-[7px] overflow-hidden border border-[var(--v2-chip-border)] bg-[var(--v2-panel)] text-[14px] font-bold text-[var(--v2-text)] transition-colors duration-100 hover:border-[var(--v2-chip-border-on)]"
              style={{ borderTop: `2px solid ${INK[tile.slug] ?? 'var(--v2-accent)'}` }}
            >
              {tile.slug === 'sanply'
                ? RIDGE.map((ridge, index) => (
                    <span
                      key={index}
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 bottom-0"
                      style={ridge}
                    />
                  ))
                : null}
              {/* `<a>` 안쪽 span 에 색을 준다 — `a { color: inherit }` 함정 (D-231) */}
              <span className="relative text-[var(--v2-text)]">{tile.label}</span>
              {SUB[tile.slug] ? (
                <span className="relative text-[11px] text-[var(--v2-text-ghost)]">
                  {SUB[tile.slug]}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
