/**
 * ★시즌 그래프 공용 자★ — 선수 추이(`TrendChartV3`)와 상대전적(`H2HChartV3`)이 같은 판을 쓴다.
 *
 * 2026-09-11 사장님: «개인랭킹에도 같은 크기와 같은 시스템의 그래프를 똑같은 걸 사용한다.
 * 지금 클랜과 개인 그래프판 디자인이 다르다.»
 * → 판 크기 · 여백 · 글자 크기 · 선 두께 · 마커 크기를 ★여기 한 곳★ 에서 정한다.
 *
 * 시간축은 시즌 창이다: 9/3 06:00(KST) → 10/1 06:00, 28일. 눈금은 셋뿐 (9/3 · 9/17 · 10/1).
 */

/** 9/3 06:00 KST */
export const ORIGIN_MS = Date.parse('2026-09-02T21:00:00.000Z')
export const DAY_MS = 86_400_000
export const SPAN_DAYS = 28
/** X축 눈금 — [날짜 t, 글자] */
export const TICK_LABELS: readonly (readonly [number, string])[] = [[0, '9/3'], [14, '9/17'], [28, '10/1']]

/** 밀리초 → 시즌 날짜(0~28, 소수 포함) */
export const dayOf = (ms: number): number => (ms - ORIGIN_MS) / DAY_MS

/** 선 두께 · 마커 · 글자 — 두 그래프가 똑같이 쓴다 (2026-09-11 사장님: 두께와 원 마크를 키워라) */
export const PLOT = {
  glowW: 14,
  midW: 8,
  coreW: 4,
  markerR: 14,
  axisFont: 12,
  tickFont: 13,
  valueFont: 18,
} as const

/** 흔들림 폭(% · 모양만 · 값은 안 바뀐다) */
export const WIGGLE = 1.2
/** 한 구간의 앞 30% 는 값을 유지한다 — 꼭짓점이 짧은 수평선이 된다 (사장님: 꼭 유지) */
export const HOLD = 0.3

/**
 * 판 크기 — 폭에 따라 정한다.
 * 2026-09-11 사장님: «판 길이를 더 늘리고 세로길이도 조금 늘려라» → 가로 여백을 줄이고 세로를 키웠다.
 */
export function plotBox(width: number): {
  H: number
  X0: number
  X1: number
  Y_TOP: number
  Y_BOTTOM: number
  phone: boolean
} {
  const phone = width < 700
  const H = phone ? Math.round(width * 0.78) : 560
  const X0 = phone ? 36 : 46
  const right = phone ? 34 : 46
  return { H, X0, X1: width - right, Y_TOP: 30, Y_BOTTOM: H - (phone ? 52 : 66), phone }
}

/** 정해진 흔들림 — 같은 자리면 언제나 같은 값 (-1 ~ 1). 새로고침해도 안 바뀐다 */
export function noise(seed: number, k: number): number {
  let h = (seed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return (((h ^ (h >>> 16)) >>> 0) / 4294967295) * 2 - 1
}

export function seedOf(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0
  return h
}

/**
 * 점들을 ★각진 선★ 으로 그린다 — 구간마다 «앞부분은 수평 유지 → 나머지에서 이동» 하고,
 * 이동 구간에 잔잔한 흔들림을 얹는다. ★값은 안 바뀐다. 보이는 모양만이다.★
 */
export function shapePath<T extends { t: number }>(
  pts: readonly T[],
  pick: (p: T) => number,
  xOf: (t: number) => number,
  yOf: (v: number) => number,
  salt: number,
  rand: (seed: number, k: number) => number,
): string {
  if (pts.length === 0) return ''
  const out: string[] = []
  let k = 0
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i] as T
    const b = pts[i + 1] as T
    const xa = xOf(a.t)
    const xb = xOf(b.t)
    const va = pick(a)
    const vb = pick(b)
    const steps = Math.max(1, Math.round((xb - xa) / 5))
    for (let s = 0; s < steps; s += 1) {
      const f = s / steps
      const base = f < HOLD ? va : va + ((vb - va) * (f - HOLD)) / (1 - HOLD)
      const w = s === 0 && i === 0 ? 0 : rand(salt, k) * WIGGLE
      k += 1
      out.push(`${(xa + (xb - xa) * f).toFixed(1)},${yOf(base + w).toFixed(1)}`)
    }
  }
  const end = pts[pts.length - 1] as T
  out.push(`${xOf(end.t).toFixed(1)},${yOf(pick(end)).toFixed(1)}`)
  return out.join(' ')
}
