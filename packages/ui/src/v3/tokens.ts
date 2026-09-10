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

export const V3 = {
  pageBg: 'radial-gradient(1200px 700px at 50% -8%, #142238 0%, #0c1526 42%, #070d1c 100%)',
  bar: 'linear-gradient(160deg,#0d1524,#080d18)',
  barBorder: '#16202e',
  card: 'linear-gradient(160deg,#152036 0%,#101a2c 58%)',
  cardFlat: '#111a2c',
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
  textDim: '#7c88a4',
  textFaint: '#6b7690',
  textGhost: '#5c6a84',
  textGhost2: '#4e5b74',
  blue: '#5b8dff',
  blueSoft: '#7fa9ff',
  red: '#e01b24',
  redSoft: '#ff5a63',
  gold: '#ffd83d',
  cyan: '#8ff0ff',
  green: '#22c55e',
  radiusCard: 10,
  radiusBlock: 8,
  radiusCtl: 7,
  radiusChip: 5,
  font: "var(--font-chakra, 'Chakra Petch'), var(--font-body, 'Noto Sans KR'), system-ui, sans-serif",
} as const

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

/** 카드 · 카드 머리 · 리본 — 시안 `s.card` 등 */
export const cardStyle: CSSProperties = {
  background: V3.card,
  border: `1px solid ${V3.cardBorder}`,
  borderRadius: V3.radiusCard,
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

/** 필 탭 (리그 탭 · 선수 탭 · 클랜 탭 공용) */
export function pillStyle(on: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    padding: '9px 20px',
    borderRadius: 9,
    fontSize: 13.5,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    color: on ? '#fff' : '#7c8092',
    fontWeight: on ? 700 : 400,
    background: on ? 'rgba(91,141,255,.14)' : 'transparent',
    boxShadow: on ? 'inset 0 0 0 1px rgba(91,141,255,.42)' : 'none',
    textDecoration: 'none',
  }
}

/** 작은 선택 칩 (구간 선택 · DAY/누적) */
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
    color: on ? '#fff' : '#7c8092',
    background: on ? '#1a1c24' : '#111218',
    border: `1px solid ${on ? '#3a3d4a' : '#24262f'}`,
    opacity: on ? 1 : 0.7,
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
