import { TRAIT_PENDING_TEXT, type PlayerTraitAxis, type TraitPending } from '@sacloud/contract'

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
 * 아래 한 줄에 적을 요약 — **무엇이 없어서 못 재는지**를 중복 없이 모은다.
 *
 * ```
 * 측정중 5항목 — 라운드 복원 필요 · 배틀로그 필요 · 포지션 판정 필요
 * ```
 *
 * 다 쟀으면 빈 문자열이다.
 */
export function pendingSummary(axes: readonly PlayerTraitAxis[]): string {
  const pending = axes.filter((axis) => axis.pending !== null)
  if (pending.length === 0) return ''

  const reasons: string[] = []
  for (const axis of pending) {
    const text = pendingText(axis.pending)
    if (text && !reasons.includes(text)) reasons.push(text)
  }
  return `측정중 ${pending.length}항목 — ${reasons.join(' · ')}`
}
