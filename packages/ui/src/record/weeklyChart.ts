import type { WeeklyPoint } from '@sacloud/contract'

/**
 * **주간 추이 그래프**의 좌표 계산 (2026-09-02 사용자 지시).
 *
 * 그리는 쪽(`WeeklyTrendCard.tsx`)과 나눠 둔 이유는 `formChart.ts` 와 같다 —
 * **여기만 따로 시험할 수 있어서**다. 좌표계는 `0~100` 정규 좌표이고
 * 실제 픽셀은 SVG `viewBox` 와 CSS 가 정한다.
 *
 * ── 한 칸에 **성질이 다른 두 축**이 들어간다
 * ```
 *   퍼센트 축   스나 킬뎃 · 라플 킬뎃 · 승률      0~100 %, 클수록 위
 *   순위 축     개인랭킹 순위                     1위가 제일 위 (뒤집힌다)
 * ```
 *   사용자가 «순위 변동그래프도 그래프 표안에 넣어» 라고 했다.
 *   **눈금 숫자는 퍼센트 축에만 붙인다** — «10 20 30 40 50 이렇게 구간 나눠야지».
 *   순위는 그 눈금과 뜻이 다르므로 **점선**으로 그려 성질이 다름을 보이고,
 *   값은 점 옆에 `12위` 처럼 직접 적는다. 왼쪽 눈금을 순위로 읽지 않게 하려는 것이다.
 *
 * ── 가로축에는 **날짜를 안 쓴다** (사용자 지시). 왼→오른쪽이 오래된→최근이다.
 *
 * ── 안 뛴 주는 **점을 빼지 않는다**
 *   값이 누적이라 그대로 수평선이 된다. 그게 사실이다 — 그 주에 아무 일도 없었다.
 *   빼면 두 점이 멀리 이어져 「그 사이에 뭔가 있었다」로 읽힌다 (`weekly.ts` 머리말).
 *
 * ── 아직 값이 없는 앞 구간은 **선을 잇지 않는다**
 *   시즌 시작 직후 `null` 구간까지 0% 로 이으면 **거짓 상승선**이 생긴다.
 *   `null` 을 만나면 선을 끊고, 값이 다시 나오면 거기서 새로 시작한다.
 */

/** 점이 칸 가장자리에서 잘리지 않도록 두는 여백 (%) */
const PAD_X = 7
const PAD_TOP = 12
const PAD_BOTTOM = 10

/**
 * 세로축 **눈금 간격** (%p) — 2026-09-02 사장님 지시.
 *
 * > "구간을 나눠서 10 20 30 40 50 이렇게 구간 나눠야지 저게 몇퍼대인지 보이지"
 *
 * ── 그전에는 축을 **값에 맞춰 늘렸다**. 그게 잘못이었다.
 *   최소·최대에 여백만 주는 방식이라 눈금이 `47.3 ~ 63.8` 같은 어중간한 수가 됐고,
 *   눈금 글자도 없어서 **점이 몇 %대인지 알 수가 없었다.**
 *   지금은 축을 **10 의 배수에 붙인다.** 눈금마다 숫자를 적는다.
 */
const TICK = 10

/**
 * 축이 최소한 담는 폭 (%p).
 *
 * 값이 `50.1 · 50.3` 처럼 붙어 있을 때 한 칸(10%p)만 잡으면 0.2%p 가 칸을 꽉 채워
 * 급등락처럼 보인다. **세 칸**을 최소로 둔다 — 눈금이 넷은 보여야 「구간」으로 읽힌다.
 */
const MIN_TICKS = 3

/** 순위 축 위아래 여유 비율 — 순위는 10 단위로 자를 수 없어 옛 방식 그대로다 */
const HEADROOM = 0.18

export interface ChartDomain {
  lo: number
  hi: number
}

/** 한 선 */
export interface ChartSeries {
  key: 'sniper_kd' | 'rifle_kd' | 'win_rate' | 'rank'
  label: string
  /** CSS 색 — 컴포넌트가 토큰에서 꺼내 넘긴다 */
  color: string
  /** 순위 선은 점선이다 (성질이 다른 축이라는 표시) */
  dashed: boolean
  /** 값이 없는 자리는 `null`. 선을 끊는다 */
  values: (number | null)[]
  /** 점 옆에 적는 글자 — `52%` · `14위` */
  suffix: string
}

/**
 * 퍼센트 축 범위. **10 의 배수에 붙인다.**
 *
 * 값이 하나도 없으면 `null` — 그때는 그래프를 그리지 않는다.
 * **0 으로 채운 축을 만들지 않는다** (D-106).
 */
export function weeklyPercentDomain(values: readonly (number | null)[]): ChartDomain | null {
  const known = values.filter((v): v is number => v !== null)
  if (known.length === 0) return null

  let lo = Math.floor(Math.min(...known) / TICK) * TICK
  let hi = Math.ceil(Math.max(...known) / TICK) * TICK

  /* 값이 딱 눈금 위에 있으면 폭이 0 이 된다 (예: 50 하나뿐). 한 칸 벌린다 */
  if (hi === lo) hi = lo + TICK

  /* 최소 칸 수를 채운다. 위아래로 번갈아 넓혀 값이 가운데에 오게 한다 */
  while ((hi - lo) / TICK < MIN_TICKS) {
    if (hi < 100) hi += TICK
    else if (lo > 0) lo -= TICK
    else break
  }

  /* 킬뎃·승률은 0~100 밖으로 나갈 수 없다 */
  lo = Math.max(0, lo)
  hi = Math.min(100, hi)
  return { lo, hi }
}

/** 축에 적을 눈금 값들 — `10 · 20 · 30 …` (아래에서 위로) */
export function weeklyTicks(domain: ChartDomain): number[] {
  const out: number[] = []
  for (let v = domain.lo; v <= domain.hi + 0.001; v += TICK) out.push(Math.round(v))
  return out
}

/**
 * 순위 축 범위. **뒤집혀 있다** — 1위가 화면 위다.
 *
 * 값이 하나뿐이면 폭이 0 이 되어 선이 가운데 한 줄로 붙는다. 그때는 최소 폭을 준다.
 */
export function weeklyRankDomain(values: readonly (number | null)[]): ChartDomain | null {
  const known = values.filter((v): v is number => v !== null)
  if (known.length === 0) return null

  const best = Math.min(...known)
  const worst = Math.max(...known)
  if (best === worst) {
    /* 한 주도 안 움직였다. 위아래로 조금 벌려 선이 가운데 오게 한다 */
    return { lo: Math.max(1, best - 1), hi: worst + 1 }
  }
  const pad = Math.max(1, (worst - best) * HEADROOM)
  return { lo: Math.max(1, best - pad), hi: worst + pad }
}

/** 주 인덱스 → 가로 위치 (%) */
export function weeklyX(index: number, count: number): number {
  if (count <= 1) return 50
  return PAD_X + (index / (count - 1)) * (100 - PAD_X * 2)
}

/** 퍼센트 값 → 세로 위치 (%). 위가 0 이다 (SVG 좌표) */
export function weeklyY(value: number, domain: ChartDomain): number {
  const span = domain.hi - domain.lo
  const norm = span === 0 ? 0.5 : (domain.hi - value) / span
  return PAD_TOP + norm * (100 - PAD_TOP - PAD_BOTTOM)
}

/**
 * 순위 값 → 세로 위치 (%). **1위가 위**라서 퍼센트와 반대로 접는다.
 *
 * `domain.lo` 가 가장 좋은 순위(작은 수)이므로 그것이 화면 위(0)에 와야 한다.
 */
export function weeklyRankY(rank: number, domain: ChartDomain): number {
  const span = domain.hi - domain.lo
  const norm = span === 0 ? 0.5 : (rank - domain.lo) / span
  return PAD_TOP + norm * (100 - PAD_TOP - PAD_BOTTOM)
}

/**
 * 선을 **끊어진 조각들**로 만든다.
 *
 * `null` 을 건너뛰고 잇지 않는다 — 그러면 없는 구간에 선이 생긴다.
 * 조각 하나짜리(점 하나)도 돌려준다. 그리는 쪽이 그건 점만 찍는다.
 */
export function weeklySegments(
  values: readonly (number | null)[],
  toY: (value: number) => number,
): Array<Array<{ x: number; y: number; index: number; value: number }>> {
  const out: Array<Array<{ x: number; y: number; index: number; value: number }>> = []
  let current: Array<{ x: number; y: number; index: number; value: number }> = []

  values.forEach((value, index) => {
    if (value === null) {
      if (current.length > 0) out.push(current)
      current = []
      return
    }
    current.push({ x: weeklyX(index, values.length), y: toY(value), index, value })
  })
  if (current.length > 0) out.push(current)
  return out
}

/**
 * 점에 붙일 글자를 **몇 개마다** 적을까.
 *
 * 사용자 지시는 «점에 %를 써줘» 다. 그런데 25주 × 선 4개면 100개가 겹쳐 읽을 수 없다.
 * 그래서 **전부 적되, 주가 많아지면 사이를 띄운다.** 마지막 점은 언제나 적는다 —
 * 지금 값이 제일 궁금한 값이기 때문이다.
 *
 * ```
 *    5주 → 전부      10주 → 전부      15주 → 한 칸 걸러      25주 → 두 칸 걸러
 * ```
 */
export function weeklyLabelEvery(count: number): number {
  if (count <= 10) return 1
  if (count <= 15) return 2
  return 3
}

/** 이 인덱스에 글자를 적나 (마지막 점은 언제나 적는다) */
export function weeklyShowsLabel(index: number, count: number): boolean {
  if (index === count - 1) return true
  const every = weeklyLabelEvery(count)
  /* 마지막에서 거꾸로 세어 간격을 맞춘다 — 앞에서 세면 마지막 두 점이 붙는다 */
  return (count - 1 - index) % every === 0
}

/** 최근 `weeks` 주만 잘라 낸다. 서버는 늘 최대 구간을 준다 */
export function weeklyTail(points: readonly WeeklyPoint[], weeks: number): WeeklyPoint[] {
  return points.slice(Math.max(0, points.length - weeks))
}
