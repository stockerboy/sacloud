/**
 * 상대시간 포맷터.
 *
 * 원본 홈 화면에서 관측된 표기: `6시간 전` `15시간 전` `1일 전` `2일 전` `3일 전`.
 * `분` `달` `년` 단위와 1분 미만 표기는 관측 시점에 해당하는 글이 없어 확인하지 못했다 [미확인].
 * 아래 경계값은 우리가 정한 규칙이며 **원본과 동일함이 검증되지 않았다.**
 *
 * 단위 경계는 초 단위 델타로만 계산하므로 표시 시간대의 영향을 받지 않는다.
 */

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
/** 달 = 30일로 고정 환산 [미확인] */
const MONTH = 30 * DAY
/** 년 = 365일로 고정 환산 [미확인] */
const YEAR = 365 * DAY

/** 1분 미만 표기 [미확인] */
export const JUST_NOW = '방금 전'

export function formatRelativeTime(value: string | Date, now: Date | number = Date.now()): string {
  const target = value instanceof Date ? value.getTime() : Date.parse(value)
  if (Number.isNaN(target)) return ''

  const base = typeof now === 'number' ? now : now.getTime()
  // 미래 시각은 원본에서 관측되지 않았다. 0초로 취급해 `방금 전`으로 표기한다 [미확인]
  const seconds = Math.max(0, Math.floor((base - target) / 1000))

  if (seconds < MINUTE) return JUST_NOW
  if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)}분 전`
  if (seconds < DAY) return `${Math.floor(seconds / HOUR)}시간 전`
  if (seconds < MONTH) return `${Math.floor(seconds / DAY)}일 전`
  if (seconds < YEAR) return `${Math.floor(seconds / MONTH)}달 전`
  return `${Math.floor(seconds / YEAR)}년 전`
}
