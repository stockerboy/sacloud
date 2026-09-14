/**
 * ★리그 로고★ — 어느 화면이든 여기서 가져간다 (2026-09-14 사장님이 새 로고를 주셨다).
 *
 * > «이걸로 바꿔 전부 다 배경제거해놨어»
 *
 * ── 왜 한 곳으로 모았나
 *   옛 판은 상단바(v1·v2)와 홈 타일 ★세 곳에 각각★ 주소가 박혀 있었다.
 *   로고가 바뀔 때마다 셋을 다 고쳐야 하고 ★반드시 하나를 빠뜨린다.★
 *   이제 그림도 크기도 여기 한 곳이 정한다.
 *
 * ── ⚠ 옛 로고를 지우지 않았다 (`CLAUDE.md` 1-4)
 *   `public/assets/legacy/` 에 그대로 옮겨 두었고, 아래 `LEAGUE_LOGO_V1` 이 그것을 가리킨다.
 *   되돌리려면 `LEAGUE_LOGO` 대신 `LEAGUE_LOGO_V1` 을 쓰면 된다.
 *
 * ── 크기
 *   원본은 724×707 에 600KB 였다. 화면에서는 높이 40px 안팎이라 ★레티나 2배(320px)★ 로
 *   줄여 두었다 — 원본째 올리면 폰에서 로고 셋에 1.8MB 를 내려받는다.
 *   셋의 가로가 331·330·328 로 ★거의 같아서★ 상단바에서 들쭉날쭉하지 않는다.
 */

export interface LeagueLogo {
  src: string
  /** 원본 크기 — `next/image` 가 자리를 미리 잡는 데 쓴다 */
  w: number
  h: number
}

/**
 * ★지금 쓰는 로고★ (2026-09-14).
 *
 * 열쇠는 ★슬러그★ 다 — 리그 이름이 바뀌어도(SPL→LLM · 10🏔→YSL) 슬러그는 안 바뀐다.
 */
export const LEAGUE_LOGO: Readonly<Record<string, LeagueLogo>> = {
  nolink: { src: '/assets/league-ipl.png', w: 435, h: 320 },
  supply: { src: '/assets/league-llm.png', w: 434, h: 320 },
  sanply: { src: '/assets/league-ysl.png', w: 431, h: 320 },
}

/**
 * ★글자까지 든 로고★ — 큰 자리에서 쓴다.
 *
 * 상단바는 위 `LEAGUE_LOGO`(문양만)를 쓴다. 거기에는 «IPL» 글자가 ★따로★ 있어서
 * 로고 안 글자까지 나오면 두 번 적히기 때문이다 (옛 로고도 같은 이유로 잘라 냈다 — 2026-09-12).
 */
export const LEAGUE_LOGO_FULL: Readonly<Record<string, LeagueLogo>> = {
  nolink: { src: '/assets/league-ipl-withtext.png', w: 331, h: 320 },
  supply: { src: '/assets/league-llm-withtext.png', w: 330, h: 320 },
  sanply: { src: '/assets/league-ysl-withtext.png', w: 328, h: 320 },
}

/**
 * ⚠ ★옛 로고★ (2026-09-14 이전). 지우지 않는다 — 되돌릴 때 쓴다.
 * 파일은 `public/assets/legacy/` 에 있다.
 */
export const LEAGUE_LOGO_V1: Readonly<Record<string, LeagueLogo>> = {
  nolink: { src: '/assets/legacy/league-ipl.png', w: 177, h: 160 },
  supply: { src: '/assets/legacy/league-spl.png', w: 210, h: 160 },
  sanply: { src: '/assets/legacy/league-10.png', w: 227, h: 160 },
}

/** 그 리그의 로고. 모르는 슬러그면 `null` — 화면은 글자만 그린다 */
export function leagueLogoOf(slug: string): LeagueLogo | null {
  return LEAGUE_LOGO[slug] ?? null
}
