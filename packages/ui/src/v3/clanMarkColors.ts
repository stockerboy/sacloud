/**
 * 마크에서 뽑은 색을 ★어두운 카드 위에서 읽히게★ 다듬는다 (2026-09-17 사장님).
 *
 * > 「클랜마크에 들어간 3가지색 혹은 2가지 색을 이용해서 조화롭게 카드를 꾸며줘」
 *
 * ── 왜 그냥 쓰면 안 되나
 *   카드 바탕이 어둡다. 디럭스의 검정(`#05070a`)을 그대로 띠에 칠하면 바탕과 붙어
 *   ★띠가 있는지조차 안 보인다.★ 반대로 흰색은 그대로 잘 보인다.
 *   그래서 **너무 어두운 색만** 흰쪽으로 끌어올린다 — 색상(hue)은 건드리지 않는다.
 *
 * ── 지어내지 않는다
 *   마크에 없는 색을 만들지 않는다. 밝기만 옮긴다. 마크가 한 색뿐이면 한 색으로 칠한다.
 */
import { CLAN_MARK_PALETTES } from './clanMarkPalette'

/** `#rrggbb` → `[r,g,b]`. 모양이 아니면 `null` */
export function rgbOf(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (m === null) return null
  const n = Number.parseInt(m[1] ?? '0', 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** 눈이 느끼는 밝기 0~1 (sRGB 가중평균). 흰색 1 · 검정 0 */
export function brightnessOf(hex: string): number {
  const rgb = rgbOf(hex)
  if (rgb === null) return 0.5
  return (rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722) / 255
}

/** `hex` 를 흰쪽으로 `amount`(0~1) 만큼 끌어올린다 */
export function lighten(hex: string, amount: number): string {
  const rgb = rgbOf(hex)
  if (rgb === null) return hex
  const up = rgb.map((c) => Math.round(c + (255 - c) * amount))
  return `#${up.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

/**
 * 어두운 카드 위에서 쓸 수 있게 다듬은 색.
 *
 * 0.14 아래는 바탕과 구분이 안 된다 — 딱 그만큼만 올린다.
 * 그보다 밝으면 **손대지 않는다** (마크 색 그대로가 제일 정직하다).
 */
export function onDark(hex: string): string {
  const b = brightnessOf(hex)
  if (b >= 0.14) return hex
  return lighten(hex, 0.34 + (0.14 - b))
}

/** 그 클랜 마크의 색 — 없으면 빈 배열. 길이는 1~3 */
export function markColorsOf(slug: string | null | undefined): string[] {
  if (!slug) return []
  const got = CLAN_MARK_PALETTES[slug]
  return got === undefined ? [] : got.map(onDark)
}

/**
 * ★카드 위 띠★ 에 칠할 그라데이션.
 *
 * 색이 하나면 그 색 한 줄, 둘이면 좌→우, 셋이면 좌·가운데·우다.
 * 색이 아예 없으면 `null` — 부르는 쪽이 원래 테두리를 그대로 쓴다.
 */
export function markRailOf(slug: string | null | undefined): string | null {
  const cols = markColorsOf(slug)
  if (cols.length === 0) return null
  const first = cols[0]
  if (first === undefined) return null
  if (cols.length === 1) return first
  const stops = cols.map((c, i) => `${c} ${Math.round((i / (cols.length - 1)) * 100)}%`)
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

/**
 * 글자·테두리에 쓸 ★한 색★ — 가장 알아보기 쉬운 색 하나.
 *
 * 무채색(검·흰·회)보다 ★유채색★ 을 앞세운다. 베리타스는 파랑이 셋째로 나와도
 * 「파란 클랜」이지 「흰 클랜」이 아니다. 유채색이 없으면(디럭스) 가장 밝은 색이다.
 */
export function markAccentOf(slug: string | null | undefined): string | null {
  const cols = markColorsOf(slug)
  const head = cols[0]
  if (head === undefined) return null
  const chroma = (hex: string): number => {
    const rgb = rgbOf(hex)
    if (rgb === null) return 0
    return (Math.max(...rgb) - Math.min(...rgb)) / 255
  }
  const colored = cols.filter((c) => chroma(c) >= 0.12)
  const lead = colored[0]
  if (lead !== undefined) return lead
  return cols.reduce((best, c) => (brightnessOf(c) > brightnessOf(best) ? c : best), cols[0] as string)
}
