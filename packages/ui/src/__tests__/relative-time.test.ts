import { describe, expect, it } from 'vitest'
import { formatRelativeTime, JUST_NOW } from '../common/relative-time'

/**
 * 경계값 고정 테스트.
 *
 * 관측된 표기(`6시간 전` `1일 전` `2일 전`)는 원본과 일치한다.
 * `분` `달` `년` 단위와 1분 미만 표기의 경계는 원본에서 확인하지 못한 자체 규칙이므로
 * (docs/DECISIONS.md D-010) 여기서 값을 고정해 두고, 실측되면 함께 고친다.
 */

const NOW = Date.parse('2026-08-20T12:00:00+09:00')
const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const ago = (ms: number) => new Date(NOW - ms).toISOString()

describe('formatRelativeTime', () => {
  it('1분 미만은 방금 전', () => {
    expect(formatRelativeTime(ago(0), NOW)).toBe(JUST_NOW)
    expect(formatRelativeTime(ago(59 * SECOND), NOW)).toBe(JUST_NOW)
  })

  it('분 단위', () => {
    expect(formatRelativeTime(ago(MINUTE), NOW)).toBe('1분 전')
    expect(formatRelativeTime(ago(59 * MINUTE), NOW)).toBe('59분 전')
  })

  it('시간 단위', () => {
    expect(formatRelativeTime(ago(HOUR), NOW)).toBe('1시간 전')
    // 원본 홈에서 실제로 관측된 표기
    expect(formatRelativeTime(ago(6 * HOUR), NOW)).toBe('6시간 전')
    expect(formatRelativeTime(ago(15 * HOUR), NOW)).toBe('15시간 전')
    expect(formatRelativeTime(ago(23 * HOUR + 59 * MINUTE), NOW)).toBe('23시간 전')
  })

  it('일 단위', () => {
    expect(formatRelativeTime(ago(DAY), NOW)).toBe('1일 전')
    expect(formatRelativeTime(ago(2 * DAY), NOW)).toBe('2일 전')
    expect(formatRelativeTime(ago(29 * DAY), NOW)).toBe('29일 전')
  })

  it('달 단위 (30일 환산)', () => {
    expect(formatRelativeTime(ago(30 * DAY), NOW)).toBe('1달 전')
    expect(formatRelativeTime(ago(60 * DAY), NOW)).toBe('2달 전')
    expect(formatRelativeTime(ago(364 * DAY), NOW)).toBe('12달 전')
  })

  it('년 단위 (365일 환산)', () => {
    expect(formatRelativeTime(ago(365 * DAY), NOW)).toBe('1년 전')
    expect(formatRelativeTime(ago(3 * 365 * DAY), NOW)).toBe('3년 전')
  })

  it('시간대가 달라도 같은 시각이면 같은 결과', () => {
    expect(formatRelativeTime('2026-08-20T09:00:00+09:00', NOW)).toBe('3시간 전')
    expect(formatRelativeTime('2026-08-20T00:00:00+00:00', NOW)).toBe('3시간 전')
  })

  it('미래 시각은 방금 전으로 처리한다', () => {
    expect(formatRelativeTime(ago(-HOUR), NOW)).toBe(JUST_NOW)
  })

  it('파싱할 수 없는 값은 빈 문자열', () => {
    expect(formatRelativeTime('올바르지 않은 값', NOW)).toBe('')
  })
})
