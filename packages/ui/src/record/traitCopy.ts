import {
  TRAIT_PENDING_TEXT,
  isMeasurablePending,
  type PlayerTraitAxis,
  type TraitPending,
} from '@sacloud/contract'

/**
 * 전투력 육각형의 **좌표와 문구** (`docs/PLAYER_TRAITS_SPEC.md` 4절 · D-185).
 *
 * 그리기(SVG)와 떼어 둔다 — 각도 계산과 문구는 테스트가 값으로 확인할 수 있어야 한다.
 */

/** 육각형 중심과 반지름 (SVG 좌표계) */
export const HEX_CENTER = { x: 130, y: 104 } as const
export const HEX_RADIUS = 62
/** 축 이름을 놓는 반지름 — 테두리 바깥이다 */
export const HEX_LABEL_RADIUS = 80

/**
 * 눈금 고리를 몇 겹 그릴까 (사용자 지시 — "더 촘촘하게").
 *
 * 세 겹이면 한 칸이 33%p 라 "얼마나 잘하는 건지" 가 눈으로 안 잡혔다.
 * 다섯 겹이면 한 칸이 20%p 다. 바깥에서 두 번째 고리가 상위 20% 선이 된다.
 *
 * ── 앞 버전을 남겨 둔다 (사용자 지시)
 *   `HEX_RING_SCALES_WIDE` 가 예전 세 겹이다. `TraitHexagon` 의 `variant`
 *   로 되돌릴 수 있다.
 */
export const HEX_RING_SCALES = [1, 0.8, 0.6, 0.4, 0.2] as const
/** 예전(2026-08-30 이전) 눈금 — 세 겹 */
export const HEX_RING_SCALES_WIDE = [1, 2 / 3, 1 / 3] as const

/**
 * 잰 축을 찍는 점의 크기 (사용자 지시 — "점을 조금더 작게").
 * 예전 값은 `3.5` 였다. 점이 커서 도형 꼭지점을 덮어 모서리가 뭉개졌다.
 */
export const HEX_DOT_RADIUS = 2.1
/** 예전 점 크기 */
export const HEX_DOT_RADIUS_WIDE = 3.5

/**
 * `index` 번째 꼭지점의 좌표.
 *
 * 0번이 **맨 위**이고 시계방향으로 60°씩 돈다. 계약의 `TRAIT_AXIS_KEYS` 순서가
 * 그대로 화면 순서가 된다 — 축을 더하거나 순서를 바꾸면 그림도 같이 따라온다.
 */
export function hexPoint(index: number, radius: number, count = 6): { x: number; y: number } {
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2
  return {
    x: HEX_CENTER.x + radius * Math.cos(angle),
    y: HEX_CENTER.y + radius * Math.sin(angle),
  }
}

/** `points` 속성에 넣을 문자열 */
export function hexPolygon(radii: readonly number[]): string {
  return radii
    .map((radius, index) => {
      const point = hexPoint(index, radius, radii.length)
      return `${round(point.x)},${round(point.y)}`
    })
    .join(' ')
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/** 정육각형 한 겹 (눈금·측정중 도형에 쓴다) */
export function hexRing(radius: number): string {
  return hexPolygon(Array.from({ length: 6 }, () => radius))
}

/**
 * 축 이름을 놓을 자리와 **글자 정렬**.
 *
 * 왼쪽 꼭지점은 오른쪽 정렬, 오른쪽 꼭지점은 왼쪽 정렬이라야 이름이 그림을 덮지 않는다.
 */
export function axisLabelAnchor(index: number): {
  x: number
  y: number
  anchor: 'start' | 'middle' | 'end'
} {
  const point = hexPoint(index, HEX_LABEL_RADIUS)
  const dx = point.x - HEX_CENTER.x
  const anchor = Math.abs(dx) < 1 ? 'middle' : dx > 0 ? 'start' : 'end'
  return { x: round(point.x), y: round(point.y), anchor }
}

/**
 * 백분위를 **`상위 N%`** 로 바꾼다.
 *
 * 백분위 97.5 는 "밑에서 97.5%" 라는 뜻이므로 화면에는 `상위 2.5%` 로 적는다.
 * 못 잰 축은 `null` 이고 화면이 대신 `측정중` 을 적는다 — 여기서 `-` 로 채우지 않는다.
 */
export function topPercentText(percentile: number | null): string | null {
  if (percentile === null) return null
  const top = Math.round((100 - percentile) * 10) / 10
  return `상위 ${top}%`
}

/** 못 재는 이유 — 계약이 가진 문구를 그대로 쓴다 */
export function pendingText(pending: TraitPending | null): string {
  return pending === null ? '' : TRAIT_PENDING_TEXT[pending]
}

/**
 * 꼭지점 밑에 적을 한마디 — `상위 N%` · `측정중` · `미정`.
 *
 * **`측정중` 과 `미정` 은 다른 말이다** (D-206).
 * `측정중` 은 재료가 들어오면 채워진다는 뜻이고, `미정` 은 **무엇을 잴지 사람이
 * 정해야 한다**는 뜻이다. 기다린다고 채워지지 않는다.
 */
export function axisValueText(axis: PlayerTraitAxis): string {
  const top = topPercentText(axis.percentile)
  if (top !== null) return top
  return axis.pending !== null && !isMeasurablePending(axis.pending)
    ? TRAIT_PENDING_TEXT[axis.pending]
    : '측정중'
}

/**
 * 아래 한 줄에 적을 요약 — **무엇이 없어서 못 재는지**를 중복 없이 모은다.
 *
 * ```
 * 측정중 5항목 — 라운드 복원 필요 · 배틀로그 필요 · 포지션 판정 필요
 * ```
 *
 * **빈 자리(`미정`)는 세지 않는다** (D-206). 그 축은 재료를 기다리는 중이 아니라
 * 아직 정해지지 않은 것이라, `측정중 N항목` 에 넣으면 "곧 채워진다" 로 읽힌다.
 * 그 사실은 꼭지점의 `미정` 이 이미 말하고 있다.
 *
 * 잴 수 있는 축을 다 쟀으면 빈 문자열이다.
 */
export function pendingSummary(axes: readonly PlayerTraitAxis[]): string {
  const pending = axes.filter(
    (axis) => axis.pending !== null && isMeasurablePending(axis.pending),
  )
  if (pending.length === 0) return ''

  const reasons: string[] = []
  for (const axis of pending) {
    const text = pendingText(axis.pending)
    if (text && !reasons.includes(text)) reasons.push(text)
  }
  return `측정중 ${pending.length}항목 — ${reasons.join(' · ')}`
}
