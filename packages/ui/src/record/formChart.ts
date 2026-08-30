import type { PlayerFormMonth } from '@sacloud/contract'

/**
 * `최근 폼` 꺾은선의 좌표 계산 (D-167).
 *
 * 그리는 쪽(`PlayerFormPanel.tsx`)과 나눠 둔 이유는 **여기만 테스트할 수 있어서**다.
 * 좌표계는 `0~100` 정규 좌표다 — 실제 픽셀은 CSS 가 정한다.
 */

/** 점이 칸 가장자리에서 잘리지 않도록 두는 여백 (%) */
const PAD_X = 5
const PAD_TOP = 10
const PAD_BOTTOM = 10

/**
 * 세로축이 최소한 이만큼(%p)은 담는다.
 *
 * 여섯 달이 `50.1 · 50.3 · 50.2 …` 처럼 붙어 있을 때 축을 값에 딱 맞추면
 * 0.2%p 차이가 화면 절반을 오르내린다. 거의 변화가 없는데 급등락처럼 읽힌다.
 * 최소 폭을 둬서 작은 차이는 작게 보이게 한다.
 */
const MIN_SPAN = 10

/** 축 위아래 여유 비율 (값 폭이 `MIN_SPAN` 보다 넓을 때) */
const HEADROOM = 0.15

export interface FormChartDomain {
  lo: number
  hi: number
}

/**
 * 값 목록에서 세로축 범위를 정한다. 값이 하나도 없으면 `null` —
 * 그때는 그래프를 그리지 않는다. **0 으로 채운 축을 만들지 않는다** (D-106).
 */
export function formChartDomain(values: readonly number[]): FormChartDomain | null {
  if (values.length === 0) return null
  let lo = Math.min(...values)
  let hi = Math.max(...values)

  const span = hi - lo
  const pad = span < MIN_SPAN ? (MIN_SPAN - span) / 2 : span * HEADROOM
  lo -= pad
  hi += pad

  /* 킬뎃은 0~100 밖으로 나갈 수 없다. 한쪽이 잘리면 반대쪽으로 넓혀 폭을 지킨다 */
  if (lo < 0) {
    hi = Math.min(100, hi - lo)
    lo = 0
  }
  if (hi > 100) {
    lo = Math.max(0, lo - (hi - 100))
    hi = 100
  }
  return { lo, hi }
}

/** 달 인덱스 → 가로 위치 (%) */
export function formChartX(index: number, count: number): number {
  if (count <= 1) return 50
  return PAD_X + (index / (count - 1)) * (100 - PAD_X * 2)
}

/** 킬뎃 값 → 세로 위치 (%). 위가 0 이다 (SVG·CSS 좌표) */
export function formChartY(value: number, domain: FormChartDomain): number {
  const span = domain.hi - domain.lo
  const norm = span === 0 ? 0.5 : (domain.hi - value) / span
  return PAD_TOP + norm * (100 - PAD_TOP - PAD_BOTTOM)
}

export interface FormChartSegment {
  key: string
  /** `<polyline points>` 문자열 */
  points: string
}

/**
 * 값이 **이어지는 구간마다** 선을 따로 만든다.
 *
 * 빈 달을 건너뛰어 이으면 "쉬는 동안에도 꾸준했다" 는 없는 사실이 그려진다.
 * 혼자 떨어진 점 하나는 선이 없다 — 점만 찍힌다.
 */
export function formChartSegments(
  months: readonly PlayerFormMonth[],
  domain: FormChartDomain,
): FormChartSegment[] {
  const runs: { index: number; value: number }[][] = []
  let current: { index: number; value: number }[] = []
  months.forEach((month, index) => {
    if (month.kd_rate === null) {
      if (current.length > 0) runs.push(current)
      current = []
      return
    }
    current.push({ index, value: month.kd_rate })
  })
  if (current.length > 0) runs.push(current)

  return runs
    .filter((run) => run.length >= 2)
    .map((run) => ({
      key: String(run[0]!.index),
      points: run
        .map(
          (point) => `${formChartX(point.index, months.length)},${formChartY(point.value, domain)}`,
        )
        .join(' '),
    }))
}
