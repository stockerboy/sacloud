/**
 * 숫자·날짜 표기.
 *
 * 원본 관측값
 * - 승/패/킬/데스: 천 단위 콤마 (`1,302승` `17,855킬`)
 * - 승률·킬뎃: 소수점 1자리 + `%` (`60.5%` `50.6%`). 정수면 소수점을 붙이지 않는다 (`59%` `100%`)
 * - 평균킬: 소수점 1자리 + `킬` (`8.3킬`)
 * - 래더: 천 단위 콤마 + `점` (`3,432점`)
 * - 인원: `5,578명중 1위`
 * - 날짜: `2021년 10월 14일` / `2016년 8월 2일` (0 패딩 없음)
 */

const NF = new Intl.NumberFormat('ko-KR')

/** `1302` → `1,302` */
export function formatCount(value: number): string {
  return NF.format(value)
}

/**
 * `60.5` → `60.5` / `59` → `59` / `100` → `100`
 *
 * 원본은 소수점이 0이면 표기하지 않는다 (`59%`, `100%` 관측).
 * `%` 기호는 호출하는 쪽이 별도 요소로 붙인다 (원본이 `<span class="ml-0.5">%</span>`로 분리).
 */
export function formatRate(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/** `8.3` → `8.3` (평균킬. 항상 소수점 1자리 — 원본 관측) */
export function formatAverage(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1)
}

/** `3432` → `3,432점` */
export function formatRating(value: number): string {
  return `${NF.format(value)}점`
}

/**
 * ISO 8601 → `2021년 10월 14일`
 * 원본은 0 패딩을 하지 않는다. 표시 기준 시간대는 `Asia/Seoul`.
 */
export function formatDate(value: string): string {
  const time = Date.parse(value)
  if (Number.isNaN(time)) return ''
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date(time))
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}년 ${get('month')}월 ${get('day')}일`
}
