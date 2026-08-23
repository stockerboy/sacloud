/**
 * 공개 데이터 범위 회귀 테스트 (D-116).
 *
 * 여기서 고정하는 것은 **안전한 쪽으로 실패하는가**다.
 * 설정을 빠뜨리거나 오타를 내면 시드가 공개되는 게 아니라 감춰져야 한다.
 */
import { describe, expect, it } from 'vitest'
import {
  hidesSeedData,
  isPublicRow,
  publicOriginWhere,
  publicScope,
  SEED_ORIGIN,
} from '../lib/server/queries/publicScope'

const REAL = { origin: 'sacloud' }
const NEXON = { origin: 'nexon' }
const LEGACY = { origin: '3rd.supply' }
const SEED = { origin: SEED_ORIGIN }

describe('기본값은 감춘다', () => {
  it('설정이 없으면 시드를 감춘다', () => {
    expect(publicScope({})).toBe('real')
    expect(hidesSeedData({})).toBe(true)
  })

  it('오타·빈 값·다른 값은 전부 감추는 쪽으로 떨어진다', () => {
    for (const value of ['', 'ALL', 'All', 'true', 'real', 'mock', 'everything']) {
      expect(publicScope({ SACLOUD_PUBLIC_SCOPE: value })).toBe('real')
    }
  })

  it('`all`이라고 정확히 적었을 때만 열린다', () => {
    const env = { SACLOUD_PUBLIC_SCOPE: 'all' }
    expect(publicScope(env)).toBe('all')
    expect(hidesSeedData(env)).toBe(false)
  })
})

describe('where 조각', () => {
  it('감출 때는 시드 origin을 제외한다', () => {
    expect(publicOriginWhere({})).toEqual({ origin: { not: SEED_ORIGIN } })
  })

  it('열었을 때는 빈 객체라 질의를 바꾸지 않는다', () => {
    const where = publicOriginWhere({ SACLOUD_PUBLIC_SCOPE: 'all' })
    expect(where).toEqual({})
    // 스프레드해도 다른 조건을 건드리지 않아야 한다
    expect({ slug: 'supply', ...where }).toEqual({ slug: 'supply' })
  })

  it('다른 조건과 함께 스프레드된다', () => {
    expect({ slug: 'supply', ...publicOriginWhere({}) }).toEqual({
      slug: 'supply',
      origin: { not: SEED_ORIGIN },
    })
  })
})

describe('단건 판정', () => {
  it('실제 데이터는 출처와 무관하게 공개한다', () => {
    for (const row of [REAL, NEXON, LEGACY]) {
      expect(isPublicRow(row, {})).toBe(true)
    }
  })

  it('시드는 공개하지 않는다', () => {
    expect(isPublicRow(SEED, {})).toBe(false)
  })

  it('없는 행은 공개 대상이 아니다 (숨김이 아니라 없음)', () => {
    expect(isPublicRow(null, {})).toBe(false)
    expect(isPublicRow(undefined, {})).toBe(false)
  })

  it('열어 두면 시드도 통과한다 (compare 도구용)', () => {
    expect(isPublicRow(SEED, { SACLOUD_PUBLIC_SCOPE: 'all' })).toBe(true)
  })
})

describe('시드 표식', () => {
  it('`Match.origin`이 쓰던 값과 같은 문자열이다', () => {
    // 스키마 주석과 어긋나면 백필·필터가 조용히 빗나간다
    expect(SEED_ORIGIN).toBe('mock')
  })
})
