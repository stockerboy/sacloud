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

/**
 * 로고 본디 크기 — `<img>` 에 적어 둬야 폰에서 가로를 0 으로 잡는 일이 없다 (2026-09-12).
 * 화면에 쓰는 크기는 className 이 정한다.
 */
const SIZE: Readonly<Record<string, { w: number; h: number }>> = {
  sanply: { w: 227, h: 160 },
  /* 2026-09-12 글자를 잘라 냈다. 옛 값: IPL 254 · SPL 300 */
  nolink: { w: 177, h: 160 },
  supply: { w: 210, h: 160 },
}

/**
 * ⚠ ★2026-09-12 — `NUDGE` 를 없앴다★ (사장님: «IPL SPL로고 바로 오른쪽에 있는
 *   IPL SPL 글씨 지우고 로고만 남긴다음에 그 로고의 중심 축(I모양)을 첨탑의 중심선에
 *   맞춰서 배치해줘»).
 *
 *   그림에서 글자를 잘라 냈으니 이제 ★그림 가운데 = 마크 가운데★ 다 (실측 오차 1% 안).
 *   옮길 값이 없다. 옛 값은 IPL −15.7% · SPL −15.3% 였다.
 *   글자가 붙은 옛 그림은 `league-ipl-withtext.png` · `league-spl-withtext.png` 로 남겼다.
 */

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
      {/* ⚠ 2026-09-12 — 사장님: «세개가 너무 붙어있어서 이상해». 옛 값: PC 22px · 폰 12px */}
      <ul className="mx-auto flex max-w-full items-start justify-center gap-[46px] max-md:gap-[30px]">
        {TILES.map((tile) => (
          <li key={tile.href}>
            {/*
              ★칸 폭을 셋 다 같게★ (2026-09-12 사장님: «그 로고의 중심 축(I모양)을
              첨탑의 중심선에 맞춰서»).

              로고마다 폭이 다르다 (10 227 · IPL 177 · SPL 210). 폭이 다른 채로 가운데
              정렬하면 ★가운데 칸의 한가운데가 줄의 한가운데가 아니다★ — IPL 로고가
              첨탑에서 몇 px 밀린다. 칸을 같은 폭으로 잡으면 저절로 맞는다.
            */}
            <Link
              href={tile.href}
              aria-label={tile.label}
              className="group flex w-[92px] flex-col items-center gap-[5px] max-md:w-[76px]"
            >
              {/*
                ★새 로고 (2026-09-12 사장님: «이것들로 로고 바꿔줘 전부»)★

                ⚠ 새 그림은 ★가로가 더 길다★ (10 은 1.42:1 · IPL 1.59:1 · SPL 1.88:1).
                  옛 판처럼 46×46 네모 상자에 `bg-contain` 으로 넣으면 세로가 24~32px 로
                  눌려 안 보인다. 그래서 ★세로만 맞추고 가로는 그림이 정하게★ `<img>` 로 놓는다.
                  `width`·`height` 를 적어 두는 것도 그 때문이다 — 없으면 폰에서 가로가 0 이 된다.

                ⚠ ★크기가 세 번 바뀌었다★ (같은 날) —
                  92px → 62px → 46px → 52px → 34px → ★40px★ (폰 40 → 34 → 28 → ★33px★)
              */}
              <img
                src={MARK[tile.slug]}
                width={SIZE[tile.slug]?.w}
                height={SIZE[tile.slug]?.h}
                alt=""
                aria-hidden
                className="block h-[40px] w-auto max-w-none opacity-[.95] transition-all duration-150 group-hover:scale-[1.06] group-hover:opacity-100 max-md:h-[33px]"
                style={{ filter: `drop-shadow(0 0 14px ${GLOW[tile.slug] ?? 'transparent'})` }}
              />
              {/*
                ★로고 밑 이름 줄★ — 되살렸다 (2026-09-12 사장님: «로고밑에 IPL SPL 글씨를 써줘»).

                한 번 뺐던 줄이다. 이름이 로고 안에 이미 있어서 두 번 나온다고 봤는데,
                사장님이 ★밑에 글자가 있어야★ 한다고 하셨다. 로고 안 글자는 그림의 일부고
                이 줄은 ★누르는 곳의 이름★ 이라 뜻이 다르다.
                `<a>` 안쪽 span 에 색을 준다 — `a { color: inherit }` 함정 (D-231)
              */}
              <span
                className="block w-full text-center text-[13px] font-bold tracking-[.14em] text-[var(--v2-text-muted)] transition-colors duration-150 group-hover:text-[var(--v2-text)] max-md:text-[12px]"
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
