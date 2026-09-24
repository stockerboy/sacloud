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
 * ★지금 쓰는 로고★ (2026-09-18 IPL·PL 만 새 그림으로 바꿨다).
 *
 * > «IPL PL로고 저걸로 바꿔» — 사장님, 2026-09-18
 *
 * 사장님이 주신 그림 한 장을 둘로 갈라 `public/brand/` 에 넣었다
 * (파란 IPL 673×200 · 빨간 PL 630×200).
 *
 * ── ★`sanply`(열산리그)는 건드리지 않았다★
 *   사장님이 IPL·PL 둘만 바꾸라 하셨다. 그래서 2026-09-14 판 값 그대로다.
 *
 * ── ⚠ 높이가 섞였다
 *   새 둘은 h=200, `sanply` 는 h=320 이다. 화면은 높이를 CSS 로 고정해 쓰므로
 *   ★가로만 비율대로 달라진다★ — 새 둘이 옛 판보다 가로로 길다 (673/200 vs 435/320).
 *   상단바가 들쭉날쭉해 보이면 여기 수치가 아니라 화면 쪽 높이를 조정해라.
 *
 * ── ⚠ ★크기를 반드시 실제 그림 크기로 적어라★
 *   `next/image` 가 이 수치로 자리를 잡는다. 어긋나면 폰에서 가로가 0 이 되어
 *   ★로고가 통째로 사라진다.★
 *
 * ── ⚠ 새 그림에는 «IPL» · «PL» ★글자가 들어 있다★
 *   위 `LEAGUE_LOGO_FULL` 주석에 적힌 «상단바는 문양만 쓴다» 는 이유가 여기서는 깨진다.
 *   상단바에서 글자가 두 번 적혀 보이면 그건 이 그림 탓이다 — 사장님 지시대로 둔 것이다.
 *
 * 열쇠는 ★슬러그★ 다 — 리그 이름이 바뀌어도(SPL→LLM→PL · 10🏔→YSL) 슬러그는 안 바뀐다.
 */
export const LEAGUE_LOGO: Readonly<Record<string, LeagueLogo>> = {
  /*
   * ★★C1 로고 — 사장님이 주신 그림★★ (2026-09-20 밤 「이걸로 바꿔줘」)
   *
   *   금색 C + 은색 1. IPL·PL 과 ★같은 기울기·같은 금속 느낌★ 이라 네 단추가
   *   한 줄에 섰을 때 하나만 겉돌지 않는다.
   *
   *   ⚠ ★받은 파일은 투명이 아니었다★ — 체크무늬가 ★픽셀로 박힌 RGB★ 였다.
   *     색만 보고 지우면 ★은색 「1」 까지 같이 날아간다.★ 그래서 테두리에서
   *     번져 들어가는 방식으로 ★바깥만★ 걷어 냈다 (검은 윤곽이 번짐을 막는다).
   *     1944×809 → 잘라서 1737×672 → 높이 200 webp ★20KB★.
   *     지운 방법은 커밋 메시지에 적어 뒀다. 다시 해야 하면 그걸 본다.
   *
   *   ⚠ ★내가 그렸던 판은 `/brand/league-c1.svg` 에 그대로 있다★ (`CLAUDE.md` 1-4).
   *     되돌리려면 아래 한 줄의 src·w 를 `'/brand/league-c1.svg'` · `320` 으로 바꾼다.
   */
  c1: { src: '/brand/league-c1.webp', w: 517, h: 200 },
  /*
   * ★★CPL 로고 — 사장님이 주신 그림★★ (2026-09-21 「Cpl로고」)
   *
   *   금색 C + 은색 PL. C1·IPL·PL 과 ★같은 기울기·같은 금속 느낌★ 이다.
   *   받은 그림은 ★검은 배경이 픽셀로 박혀 있었다★ — 아주 어두운 점(26 미만)만
   *   투명으로 돌리고 잘라 냈다. 로고가 금·은이라 ★글자는 한 점도 안 지워진다.★
   *   2172×724 → 잘라서 2030×410 → 너비 640 webp ★34KB★.
   */
  /* 2026-09-24 사장님이 새 로고를 주셔서 Supply 2.0 으로 교체 (검정 배경은 투명 처리). 옛 CPL 글자 로고는 파일만 남김 */
  cpl: { src: '/brand/league-supply2.webp', w: 640, h: 203 },
  nolink: { src: '/brand/league-ipl.webp', w: 673, h: 200 },
  /*
   * ★★Supply1.0 로고 — 사장님이 주신 그림★★ (2026-09-25 새벽 「경쟁전 로고 이걸로 바꿔줘」)
   *
   *   흰·파랑 날개 문양. 받은 그림은 검정 배경이 픽셀로 박힌 1536×1024 — Supply2.0 때와 같은 방법
   *   (밝기 6~46 알파 램프)으로 배경만 걷어 내고 잘라(792×560) 높이 200 webp ★16KB★.
   *   문양이 흰·파랑이라 글자·선은 한 점도 안 지워진다.
   *
   *   ⚠ 옛 「PL」 글자 로고는 파일(`/brand/league-pl.webp`)로 그대로 있다 (`CLAUDE.md` 1-4).
   *     되돌리려면 아래 한 줄을 `'/brand/league-pl.webp'` · 630 으로.
   *   이 그림에는 글자가 없다 — 홈 타일이 다시 supply 를 그린다 (`HomeLeagueTiles` 2026-09-24 제외를 풀었다).
   */
  supply: { src: '/brand/league-supply1.webp', w: 277, h: 200 },
  /*
   * ⚠ ★2026-09-19 — PNG 186KB → webp 23KB★ (성능 검수에서 잡았다).
   *   431×320 PNG 를 ★높이 30px★(폰 22px)로 줄여 쓰고 있었다. 그림은 그대로고
   *   담는 그릇만 바꿨다. 옛 파일은 `/assets/league-ysl.png` 에 그대로 있다.
   */
  sanply: { src: '/brand/league-ysl.webp', w: 269, h: 200 },
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
 * ⚠ ★한 판 전 로고★ (2026-09-14 ~ 2026-09-18). 지우지 않는다 (`CLAUDE.md` 1-4) — 되돌릴 때 쓴다.
 *
 * 2026-09-18 에 사장님이 «IPL PL로고 저걸로 바꿔» 하셔서 `nolink`·`supply` 만
 * `public/brand/` 의 새 그림으로 넘어갔다. ★그림 파일은 그대로 `public/assets/` 에 남아 있다★ —
 * 되돌리려면 `LEAGUE_LOGO` 대신 이것을 쓰면 된다.
 */
export const LEAGUE_LOGO_V2: Readonly<Record<string, LeagueLogo>> = {
  nolink: { src: '/assets/league-ipl.png', w: 435, h: 320 },
  supply: { src: '/assets/league-llm.png', w: 434, h: 320 },
  sanply: { src: '/assets/league-ysl.png', w: 431, h: 320 },
}

/**
 * ⚠ ★맨 처음 로고★ (2026-09-14 이전). 지우지 않는다 — 되돌릴 때 쓴다.
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
