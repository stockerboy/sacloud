import { describe, expect, it } from 'vitest'
import { formatAverage, formatCount, formatDate, formatRate, formatRating } from '../common/format'
import { rateTone, rateClass } from '../common/rate'

/**
 * 원본에서 실제로 관측된 표기를 고정한다.
 * 관측 출처: 서플라이공식리그 클랜랭킹 / 개인랭킹 / 리그정보 (2026-08-20).
 */

describe('formatCount — 천 단위 콤마', () => {
  it('원본 관측값', () => {
    expect(formatCount(1302)).toBe('1,302')
    expect(formatCount(851)).toBe('851')
    expect(formatCount(17855)).toBe('17,855')
    expect(formatCount(0)).toBe('0')
  })
})

describe('formatRate — 소수점 1자리, 정수면 생략', () => {
  it('원본 관측값', () => {
    // 60.5% / 50.6% / 57.2% / 52.4%
    expect(formatRate(60.5)).toBe('60.5')
    expect(formatRate(50.6)).toBe('50.6')
    expect(formatRate(57.2)).toBe('57.2')
    // 59% / 100% — 원본은 정수면 소수점을 붙이지 않는다
    expect(formatRate(59)).toBe('59')
    expect(formatRate(100)).toBe('100')
    expect(formatRate(0)).toBe('0')
  })

  it('반올림은 소수점 1자리', () => {
    expect(formatRate(48.34)).toBe('48.3')
    expect(formatRate(48.35)).toBe('48.4')
  })
})

describe('formatAverage — 평균킬은 항상 소수점 1자리', () => {
  it('원본 관측값', () => {
    expect(formatAverage(8.3)).toBe('8.3')
    expect(formatAverage(11.1)).toBe('11.1')
    // 정수여도 .0을 붙인다 (원본 `8.0킬` 형태 — 표기 폭을 맞추기 위함)
    expect(formatAverage(9)).toBe('9.0')
  })
})

describe('formatRating — 천 단위 콤마 + 점', () => {
  it('원본 관측값', () => {
    expect(formatRating(3432)).toBe('3,432점')
    expect(formatRating(1718)).toBe('1,718점')
    expect(formatRating(947)).toBe('947점')
  })
})

describe('formatDate — 0 패딩 없는 한국어 날짜', () => {
  it('원본 관측값', () => {
    // 2016년 8월 2일 / 2021년 10월 14일
    expect(formatDate('2016-08-02T00:00:00+09:00')).toBe('2016년 8월 2일')
    expect(formatDate('2021-10-14T00:00:00+09:00')).toBe('2021년 10월 14일')
  })

  it('Asia/Seoul 기준으로 표시한다', () => {
    // UTC 2021-10-13T16:00Z = KST 2021-10-14 01:00
    expect(formatDate('2021-10-13T16:00:00Z')).toBe('2021년 10월 14일')
  })

  it('파싱할 수 없는 값은 빈 문자열', () => {
    expect(formatDate('없는 날짜')).toBe('')
  })
})

describe('rateTone — 승률·킬뎃 색 등급 (원본 실측 표본으로 고정)', () => {
  it('50 미만은 기본색', () => {
    expect(rateTone(41.7)).toBe('base')
    expect(rateTone(49.7)).toBe('base')
    expect(rateClass(49.9)).toBe('')
  })

  it('50~55 / 55~60 / 60~65 / 65 이상', () => {
    expect(rateTone(50)).toBe('r1')
    expect(rateTone(54.4)).toBe('r1')
    expect(rateTone(55)).toBe('r2')
    expect(rateTone(59.8)).toBe('r2')
    expect(rateTone(60.1)).toBe('r3')
    expect(rateTone(64.8)).toBe('r3')
    expect(rateTone(65.1)).toBe('r4')
    expect(rateTone(100)).toBe('r4')
  })

  it('값이 없으면 기본색', () => {
    expect(rateTone(null)).toBe('base')
    expect(rateTone(undefined)).toBe('base')
    expect(rateTone(Number.NaN)).toBe('base')
  })
})
