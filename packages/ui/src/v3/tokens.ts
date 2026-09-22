/**
 * ★v3 토큰★ — 사장님이 2026-09-10 에 건넨 선수·클랜 상세 v3 시안의 색·라운딩·글꼴.
 *
 * 시안(`handoff_in/sacloud_handoff/*V3.tsx`)의 `C` 객체를 그대로 옮겼다. 값을 새로 짓지 않았다.
 * 이 팔레트가 사이트 전체의 기준이다 (사장님: "선수상세 클랜상세에 있는 ui들의 분위기를
 * 사이트 전체로 통일시켜"). 전역 CSS 토큰(`styles.css`)도 같은 값으로 맞췄다.
 *
 * 옛 v2 토큰(`v2/tokens.css`)은 지우지 않았다 (`CLAUDE.md` 1-4).
 */
import type { CSSProperties } from 'react'

/**
 * ⚠ ★2026-09-22 — 서플라이 투톤으로★ (사장님, `v2/tokens.css` 와 같은 지시).
 *
 * 선수·클랜 상세는 이 `V3` 객체를 CSS 변수가 아니라 ★JS 값★ 으로 직접 쓴다 —
 * `v2/tokens.css` 의 `--v2-*` 변수를 아무리 바꿔도 여기는 안 따라온다. 그래서
 * 이 파일도 ★따로★ 흰 바탕용으로 뒤집는다. 값은 `v2/tokens.css` 의 새 팔레트와
 * 맞췄다 — 두 층이 다른 흰색·다른 회색을 쓰면 화면마다 톤이 미묘하게 갈라진다.
 *
 * ⚠ ★옛 다크 남색 판은 지우지 않고 여기 남긴다★ (`CLAUDE.md` 1-4) —
 *   pageBg 'radial-gradient(1200px 700px at 50% -8%,#142238 0%,#0c1526 42%,#070d1c 100%)'
 *   bar 'linear-gradient(160deg,#0d1524,#080d18)' · barBorder #16202e
 *   card 'radial-gradient(120% 90% at 0% 0%,rgba(122,162,255,.10),transparent 58%),
 *         radial-gradient(95% 75% at 100% 0%,rgba(196,132,252,.075),transparent 52%),
 *         linear-gradient(160deg,rgba(46,65,107,.58) 0%,rgba(32,48,82,.58) 58%)'
 *   cardFlat 'radial-gradient(120% 90% at 0% 0%,rgba(122,162,255,.08),transparent 58%),
 *             linear-gradient(160deg,rgba(40,57,95,.58),rgba(36,52,88,.58))'
 *   cardBorder #3a4870 · divider #1b2537 · rowDivider #18233a · rowDivider2 #141d2c
 *   plot #0a1220 · chip #0e1728 · chipBorder #24314c
 *   text #e8eaf2 · textStrong #fff · textMuted #a4b0c8 · textDim #7c88a4
 *   textFaint #6b7690 · textGhost #5c6a84 · textGhost2 #4e5b74
 */
export const V3 = {
  pageBg: 'radial-gradient(1200px 700px at 50% -8%, #f7f8f9 0%, #e9ebef 42%, #e0e2e7 100%)',
  bar: 'linear-gradient(160deg,#0d1524,#080d18)',
  barBorder: '#16202e',
  /**
   * ★2026-09-22 — 흰 카드로 뒤집으며 빛무리·반투명 유리도 걷었다★.
   *   다크 카드에서는 «반투명 네온 유리» 가 컨셉이었지만, 서플라이의 흰 카드는
   *   납작한 단색이다. 흰 바탕 위에 파랑·보라 빛무리를 그대로 두면 얼룩으로
   *   보이고, `backdrop-filter` 도 뒤가 이미 불투명 흰색이라 할 일이 없다
   *   (`v2/tokens.css` 의 `.v2-panel` 과 같은 결정 — 2026-09-21 성능 이유로 걷었다).
   */
  card: '#121c2f',
  cardFlat: '#152036',
  /*
   * ⚠ ★2026-09-22 — 한 단 진하게★ (사장님: 「전체적으로 보드의 경계가 너무 잘 안보여」).
   *   옛 값 `#e3e6ee` 는 페이지 바탕(#f2f2f2)과 대비가 ★1.06:1★ 이었다 — 사실상 선이 없다.
   *   흰 면 위에서도, 회색 바탕 위에서도 보이는 값으로 올린다.
   */
  /* ⚠ ★2026-09-22 밤 — 서플라이 테두리 값으로★. 옛 값 '#d9dee9' */
  cardBorder: '#1e2a42',
  divider: '#1b2537',
  rowDivider: '#18233a',
  rowDivider2: '#141d2c',
  plot: '#0a1220',
  chip: '#0e1728',
  chipBorder: '#24314c',
  text: '#e8eaf2',
  textStrong: '#ffffff',
  textMuted: '#a4b0c8',
  textDim: '#8f95af',
  textFaint: '#7c88a4',
  textGhost: '#6b7ba0',
  textGhost2: '#5a6a8f',
  blue: '#5b8dff',
  blueSoft: '#7fa9ff',
  red: '#e01b24',
  redSoft: '#ff5a63',
  gold: '#ffd83d',
  cyan: '#8ff0ff',
  green: '#22c55e',
  /*
   * ⚠ ★2026-09-22 밤 — 둥글기를 전부 0 으로★ (사장님: 「모든 카드 디자인, 색
   *   전부 서플라이랑 똑같이 한다는거 꼭 명심하고」).
   *
   *   서플라이를 재 보니 카드가 ★전부 각졌다★ — 표 상자 · 경기 카드 · 상세정보
   *   카드 전부 `border-radius: 0` 이다 (`docs/SUPPLY_MEASURED.md`).
   *   둥근 모서리는 우리가 올린 것이고, 그것만으로도 「다른 사이트」로 보였다.
   *
   *   ★옛 값은 RADIUS_V1 에 남긴다★ (`CLAUDE.md` 1-4) — 되돌리려면 그 값을 쓴다.
   */
  /*
   * ★경기 카드의 면★ — 서플라이 실측 (`docs/SUPPLY_MEASURED.md` §4).
   *   이긴 판 #e0f2fe / 테두리 #bae6fd · 진 판 #fee2e2 / 테두리 #fecaca
   *   우리 옛 값은 rgba(91,141,255,.13) / rgba(255,90,99,.13) 이었다 — 아래 V1 에 남긴다.
   */
  winFace: 'rgba(91,141,255,.13)',
  winFaceLine: 'rgba(91,141,255,.30)',
  loseFace: 'rgba(255,90,99,.13)',
  loseFaceLine: 'rgba(224,27,36,.26)',
  radiusCard: 0,
  radiusBlock: 0,
  radiusCtl: 0,
  radiusChip: 0,
  font: "var(--font-chakra, 'Chakra Petch'), var(--font-body, 'Noto Sans KR'), system-ui, sans-serif",
} as const

/**
 * ★★옛 다크 남색 판 — 되살렸다★★ (2026-09-22 · 「오늘의 상대전적」)
 *
 * 사장님: 「현재 사이트가 흰색 UI로 변경되기 전 사용했던 ★기존 상대전적 그래프 카드의
 *   디자인/컴포넌트를 최대한 그대로 재사용해. 새로운 디자인을 임의로 만들지 마」
 *
 * 값은 ★위 주석에 남겨 둔 그 값 그대로★ 다 (`CLAUDE.md` 1-4 가 살려 둔 것을 쓴다).
 * 새로 지어낸 색이 하나도 없다.
 *
 * ⚠ ★`V3` 는 안 건드린다.★ 이 객체를 쓰는 화면은 ★오늘의 상대전적 카드 하나뿐★ 이다.
 *   선수·클랜 상세는 지금처럼 흰 카드로 남는다.
 */
/**
 * ★★2026-09-22 밤 — 색을 우리 톤으로 되돌렸다★★ (사장님)
 *
 * > 「톤 맞춰줘 맨위는 검정 하얀부분은 전부 우리가 원래 쓰던 톤과 색으로」
 * > 「그냥 서플라이에서 하얀색인 부분은 우리가 원래 쓰던 색으로 전부 칠해줘 보드도 맘에 들어」
 *
 * ★모양은 서플라이, 색은 우리 것★ 이다 —
 *   유지  검정 상단바 · 회색 리그 띠(#292929) · 각진 보드 · 줄 49px · 글자 15.75px
 *         칸 자리(순위140 / 클랜140 / 승리476 …) · 마크 28px
 *   되돌림 흰 면 → ★다크 남색★ (`styles.css` 의 ⚠ 주석에 「옛값」 으로 적혀 있던 그 값)
 *
 * ★새로 지어낸 색이 하나도 없다.★ 전부 9/22 낮에 흰색으로 덮기 전의 값이다.
 * 흰 판이 필요하면 아래 `V3_LIGHT_20260922` 를 쓰면 된다 (`CLAUDE.md` 1-4).
 */
export const V3_LIGHT_20260922 = {
  card: '#ffffff',
  cardFlat: '#ffffff',
  cardBorder: '#d1d5db',
  divider: '#edeff4',
  rowDivider: '#edeff4',
  rowDivider2: '#f5f6f9',
  plot: '#e5e7ec',
  chip: '#e5e7ec',
  chipBorder: '#dde1eb',
  text: '#1c2233',
  textStrong: '#05070d',
  textMuted: '#5c6479',
  textDim: '#767f96',
  textFaint: '#96a0b5',
  textGhost: '#b6bece',
  textGhost2: '#ccd2e0',
  winFace: '#e0f2fe',
  winFaceLine: '#bae6fd',
  loseFace: '#fee2e2',
  loseFaceLine: '#fecaca',
} as const

export const V3_DARK = {
  ...V3,
  pageBg: 'radial-gradient(1200px 700px at 50% -8%,#142238 0%,#0c1526 42%,#070d1c 100%)',
  /*
   * ⚠ ★반투명을 불투명으로 바꿨다★ (2026-09-22 실측).
   *
   *   옛 값은 `rgba(46,65,107,.58)` 이었다. ★그때는 페이지 바탕이 어두웠으니까★
   *   뒤에 `#0c1526` 이 비쳐 남색이 됐다. 지금 바탕은 ★흰색★ 이라 그대로 두면
   *   흰빛이 비쳐 ★희뿌연 회색 카드★ 가 된다 (화면을 찍어서 봤다).
   *
   *   그래서 ★옛 판에서 눈에 보이던 그 색★ 을 불투명 값으로 적는다 —
   *   `rgba(46,65,107,.58)` 를 `#0c1526` 위에 얹은 결과가 `#202f4e`,
   *   `rgba(32,48,82,.58)` 는 `#182540` 이다. ★새 색을 고른 게 아니라 옛 색을 계산한 것★ 이다.
   */
  card:
    'radial-gradient(120% 90% at 0% 0%,rgba(122,162,255,.10),transparent 58%),' +
    'radial-gradient(95% 75% at 100% 0%,rgba(196,132,252,.075),transparent 52%),' +
    'linear-gradient(160deg,#202f4e 0%,#182540 58%)',
  cardFlat:
    'radial-gradient(120% 90% at 0% 0%,rgba(122,162,255,.08),transparent 58%),' +
    'linear-gradient(160deg,#1d2a47,#1b2743)',
  cardBorder: '#3a4870',
  divider: '#1b2537',
  rowDivider: '#18233a',
  rowDivider2: '#141d2c',
  plot: '#0a1220',
  chip: '#0e1728',
  chipBorder: '#24314c',
  text: '#e8eaf2',
  textStrong: '#ffffff',
  textMuted: '#a4b0c8',
  textDim: '#7c88a4',
  textFaint: '#6b7690',
  textGhost: '#5c6a84',
  textGhost2: '#4e5b74',
} as const

/**
 * 그래프·카드가 받는 색판 — `V3`(흰) 또는 `V3_DARK`(남색).
 *
 * ⚠ `typeof V3` 를 그대로 쓰면 안 된다 — `as const` 라 값이 ★글자 그대로의 타입★ 이라서
 *   `V3_DARK` 처럼 ★다른 색★ 을 넣으면 「'#3a4870' 은 '#e3e6ee' 가 아니다」로 막힌다.
 *   그래서 글자는 `string`, 숫자는 `number` 로 ★넓혀서★ 받는다.
 */
type Widen<T> = T extends string ? string : T extends number ? number : T
export type V3Tone = { readonly [K in keyof typeof V3]: Widen<(typeof V3)[K]> }

/** ASTRA 는 무조건 영롱하게 — 홀로그램 그라데이션 + 글로우 + 5.5s 시머 (시안 규칙) */
export const ASTRA_STYLE: CSSProperties = {
  background: 'linear-gradient(92deg,#8ff0ff 0%,#c9b6ff 34%,#ffd6f2 58%,#8ff0ff 100%)',
  backgroundSize: '220% 100%',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  WebkitTextFillColor: 'transparent',
  fontWeight: 700,
  letterSpacing: '.16em',
  filter: 'drop-shadow(0 0 7px rgba(160,220,255,.75)) drop-shadow(0 0 16px rgba(190,150,255,.4))',
  animation: 'sacAstra 5.5s ease-in-out infinite',
}

/** CHALLENGER 는 ASTRA 보다 약하게 — 단색 브론즈 */
export const CHAL_STYLE: CSSProperties = { color: '#a98a64', fontWeight: 500, letterSpacing: '.12em' }
export const CHAL_NUM_COLOR = '#c2a07a'

/**
 * ★카드 · 카드 머리 · 리본★ — 시안 `s.card` 등.
 *
 * ⚠ ★2026-09-22 — 흰 카드로 뒤집으며 흐림·짙은 그림자를 걷었다★. 흰 카드는
 *   뒤가 이미 불투명해 `backdrop-filter` 가 할 일이 없고(성능 낭비), 짙은
 *   그림자는 흰 바탕에서 먹구름으로 보인다. 옛 값은 지우지 않는다 (`CLAUDE.md` 1-4):
 *     backdropFilter/WebkitBackdropFilter: 'blur(12px) saturate(1.2)'
 *     boxShadow: 'inset 0 1px 0 rgba(255,255,255,.07), 0 10px 26px rgba(0,0,0,.35)'
 */
/*
 * ⚠ ★2026-09-22 — 그림자를 또렷하게★ (사장님: 「보드위에 올라와있는것처럼 해줘」).
 *   옛 값은 `0 1px 2px rgba(16,24,40,.06)` — 거의 안 보였다.
 *   `supply-skin.css` 의 `.sac-board` 와 ★같은 값★ 이다. 두 층이 다른 그림자를 쓰면
 *   같은 화면 안에서 카드마다 떠 있는 높이가 달라 보인다.
 */
/**
 * ★옛 둥글기·그림자★ — 지우지 않는다 (`CLAUDE.md` 1-4).
 * 되돌리려면 `V3.radiusCard` 자리에 `RADIUS_V1.card` 를, 그림자에 `SHADOW_V1` 을 쓴다.
 */
export const RADIUS_V1 = { card: 10, block: 8, ctl: 7, chip: 5 } as const
export const SHADOW_V1 = '0 1px 3px rgba(0,0,0,.10), 0 1px 2px rgba(0,0,0,.06)'

/*
 * ⚠ ★2026-09-22 밤 — 그림자를 없앴다★. 서플라이 카드는 ★테두리 1px 만★ 있고
 *   바탕에서 떠 있지 않다. 9/22 낮에 「보드 위에 올라와 있는 것처럼」 을 그림자로
 *   풀었는데, 서플라이는 그 일을 ★면의 색 차이★ 로 한다.
 */
export const cardStyle: CSSProperties = {
  background: V3.card,
  backgroundClip: 'padding-box',
  border: `1px solid ${V3.cardBorder}`,
  borderRadius: V3.radiusCard,
  boxShadow: 'none',
}
export const cardHeadStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '13px 18px',
  borderBottom: `1px solid ${V3.divider}`,
  flexWrap: 'wrap',
}
export const ribbonStyle: CSSProperties = { width: 22, height: 2, background: V3.blue, flex: 'none' }
export const cardTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: V3.textStrong,
  whiteSpace: 'nowrap',
}
export const spacerStyle: CSSProperties = { flex: 1 }

/**
 * ★필 탭★ (리그 탭 · 선수 탭 · 클랜 탭 공용).
 * ⚠ 2026-09-22 흰 바탕용. 옛 값(다크 — 켠 글자 흰색): color '#fff'/'#7c8092' — 1-4
 */
export function pillStyle(on: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    padding: '9px 20px',
    borderRadius: 9,
    fontSize: 13.5,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    color: on ? V3.blue : V3.textDim,
    fontWeight: on ? 700 : 400,
    background: on ? 'rgba(91,141,255,.12)' : 'transparent',
    boxShadow: on ? 'inset 0 0 0 1px rgba(91,141,255,.42)' : 'none',
    textDecoration: 'none',
  }
}

/**
 * ★작은 선택 칩★ (구간 선택 · DAY/누적).
 * ⚠ 2026-09-22 흰 바탕용. 옛 값(다크): color '#fff'/'#7c8092' ·
 *   bg '#1a1c24'/'#111218' · border '#3a3d4a'/'#24262f' — 지우지 않는다 (1-4)
 */
export function chipStyle(on: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: 3,
    padding: '5px 11px',
    borderRadius: V3.radiusCtl,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontSize: 11.5,
    color: on ? V3.textStrong : V3.textDim,
    background: on ? '#e4e8f2' : 'transparent',
    border: `1px solid ${on ? '#c4cbdd' : V3.chipBorder}`,
    opacity: 1,
  }
}

/* ── 육각형 지오메트리 (viewBox 300×262 · 표시 300px 1:1 — 축소 금지, 시안 함정 2번) ── */
export const HEX = { cx: 150, cy: 120, r: 74, w: 300, h: 262 } as const
export function hexPoint(i: number, f: number): [number, number] {
  const a = -Math.PI / 2 + (Math.PI * 2 * i) / 6
  return [
    +(HEX.cx + Math.cos(a) * HEX.r * f).toFixed(1),
    +(HEX.cy + Math.sin(a) * HEX.r * f).toFixed(1),
  ]
}
export const HEX_RINGS = [1, 0.875, 0.75, 0.625, 0.5, 0.375, 0.25, 0.125].map((f) =>
  Array.from({ length: 6 }, (_, i) => hexPoint(i, f).join(',')).join(' '),
)
export const HEX_SPOKES = Array.from({ length: 6 }, (_, i) => hexPoint(i, 1))
/** 축 라벨은 리터럴 좌표 (시안 함정 5번 — SVG text 를 데이터로 계산하면 스케일이 흔들린다) */
export const HEX_LABELS: [number, number, 'start' | 'middle' | 'end'][] = [
  [150, 26, 'middle'],
  [232, 78, 'start'],
  [232, 170, 'start'],
  [150, 222, 'middle'],
  [68, 170, 'end'],
  [68, 78, 'end'],
]

/** 숫자 표기 — 천 단위 쉼표 */
export const fmt = (n: number): string => n.toLocaleString('ko-KR')
export const pct1 = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? '-' : `${v.toFixed(1)}%`


/**
 * ★승패 색★ (2026-09-12 사장님)
 *
 * > «이긴팀 명단 배경을 하늘색(경기분석 그래프랑 똑같은 색으로) 진팀은 빨간색»
 * > «경기카드에서 클랜명은 무조건 이긴팀이 파란색 진팀이 빨간색 — 모든 경기카드»
 *
 * 경기분석 육각형(`MatchHexagonV3`)이 쓰는 값과 ★같은 색★ 이다. 두 곳이 갈라지지 않게 여기 한 곳에 둔다.
 * 클랜마다 다른 색(`clanThemeOf`)은 ★경기카드에서만★ 안 쓴다 — 다른 화면에서는 그대로다.
 */
/**
 * ⚠ 2026-09-22 흰 바탕용으로 뒤집었다 — 옛 값(다크용 파스텔 글자)은 흰 카드 위에서
 *   거의 안 보였다. 지우지 않고 여기 남긴다 (`CLAUDE.md` 1-4):
 *     winInk #9cc0ff · loseInk #ff9aa0 ·
 *     winBg 'linear-gradient(160deg,rgba(91,141,255,.17),rgba(91,141,255,.05))' ·
 *     loseBg 'linear-gradient(160deg,rgba(255,90,99,.16),rgba(255,90,99,.045))' ·
 *     winLine rgba(91,141,255,.34) · loseLine rgba(255,90,99,.30)
 */
export const WIN_LOSS = {
  /** 이긴 팀 — 글자 */
  winInk: '#1d4fd6',
  /** 진 팀 — 글자 */
  loseInk: '#c81e28',
  /** 이긴 팀 — 명단 바탕 */
  winBg: 'rgba(91,141,255,.08)',
  /** 진 팀 — 명단 바탕 */
  loseBg: 'rgba(224,27,36,.06)',
  /** 명단 테두리 */
  winLine: 'rgba(91,141,255,.30)',
  loseLine: 'rgba(224,27,36,.26)',
} as const
