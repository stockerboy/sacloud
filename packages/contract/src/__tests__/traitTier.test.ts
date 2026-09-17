/**
 * ★특성 등급 경계★ — 사장님이 부르신 숫자를 그대로 못 박는다 (2026-09-17).
 *
 * > 「5위 이내는 최상위권 10퍼센트 이내는 상위권 30퍼이내는 중상위권
 * >  30-60 중위권 60-70중하위권 70- 90하위권 90-100 최하위권」
 *
 * 경계는 한 번 흔들리면 화면마다 다른 등급이 나온다. 여기서 고정한다.
 */
import { describe, expect, it } from 'vitest'
import {
  TRAIT_TIER_BEST_RANK,
  TRAIT_TIER_KEYS,
  TRAIT_TIER_LABEL,
  TRAIT_TIER_PCT_MAX,
  traitTierGetsEmblem,
  traitTierOf,
} from '../traitTier'

describe('★사장님이 부르신 숫자 그대로★', () => {
  it('최상위권은 5위 이내다', () => {
    expect(TRAIT_TIER_BEST_RANK).toBe(5)
    expect(traitTierOf(1, 100)).toBe('best')
    expect(traitTierOf(5, 100)).toBe('best')
    /* 6위는 100명 중 6% 라 상위권이다 */
    expect(traitTierOf(6, 100)).toBe('high')
  })

  it('비율 경계가 10 / 30 / 60 / 70 / 90 / 100 이다', () => {
    expect(TRAIT_TIER_PCT_MAX).toEqual({
      high: 10, midHigh: 30, mid: 60, midLow: 70, low: 90, worst: 100,
    })
  })

  it('100명 리그에서 등수마다 등급이 이렇게 나온다', () => {
    const at = (rank: number) => traitTierOf(rank, 100)
    expect(at(5)).toBe('best')      // 5위 이내
    expect(at(10)).toBe('high')     // 10% 이내
    expect(at(11)).toBe('midHigh')
    expect(at(30)).toBe('midHigh')  // 30% 이내
    expect(at(31)).toBe('mid')
    expect(at(60)).toBe('mid')      // 30~60
    expect(at(61)).toBe('midLow')
    expect(at(70)).toBe('midLow')   // 60~70
    expect(at(71)).toBe('low')
    expect(at(90)).toBe('low')      // 70~90
    expect(at(91)).toBe('worst')
    expect(at(100)).toBe('worst')   // 90~100
  })

  it('★경계는 「이하」다★ — 30.0% 는 중상위권이지 중위권이 아니다', () => {
    /* 1000명 중 300등 = 정확히 30.0% */
    expect(traitTierOf(300, 1000)).toBe('midHigh')
    expect(traitTierOf(301, 1000)).toBe('mid')
  })

  it('작은 리그에서는 5위 컷이 먼저 걸린다', () => {
    /* 20명 중 5위 = 25% 라 비율만 보면 중상위권인데, 등수로 최상위권이다 */
    expect(traitTierOf(5, 20)).toBe('best')
    expect(traitTierOf(6, 20)).toBe('midHigh')  // 30%
  })
})

describe('못 재는 것은 안 매긴다 — 지어내지 않는다', () => {
  it('등수나 모집단을 모르면 null 이다', () => {
    expect(traitTierOf(null, 100)).toBeNull()
    expect(traitTierOf(3, null)).toBeNull()
    expect(traitTierOf(undefined, undefined)).toBeNull()
  })

  it('★혼자면 안 준다★ — 견줄 상대가 없는데 등급을 매길 수 없다', () => {
    expect(traitTierOf(1, 1)).toBeNull()
    expect(traitTierOf(1, 2)).toBe('best')
  })

  it('말이 안 되는 값은 null 이다', () => {
    expect(traitTierOf(0, 100)).toBeNull()
    expect(traitTierOf(101, 100)).toBeNull()
    expect(traitTierOf(Number.NaN, 100)).toBeNull()
  })
})

describe('앰블럼은 위 둘만', () => {
  it('최상위권·상위권만 앰블럼을 받는다', () => {
    expect(traitTierGetsEmblem('best')).toBe(true)
    expect(traitTierGetsEmblem('high')).toBe(true)
    for (const k of ['midHigh', 'mid', 'midLow', 'low', 'worst'] as const) {
      expect(traitTierGetsEmblem(k), k).toBe(false)
    }
    expect(traitTierGetsEmblem(null)).toBe(false)
  })
})

describe('표가 서로 맞는다', () => {
  it('일곱 등급에 이름이 다 있고 서로 다르다', () => {
    expect(TRAIT_TIER_KEYS).toHaveLength(7)
    const names = TRAIT_TIER_KEYS.map((k) => TRAIT_TIER_LABEL[k])
    expect(new Set(names).size).toBe(7)
    expect(names).toEqual([
      '최상위권', '상위권', '중상위권', '중위권', '중하위권', '하위권', '최하위권',
    ])
  })

  it('비율 경계가 좋은 쪽에서 나쁜 쪽으로 커진다 — 빈틈도 뒤집힘도 없다', () => {
    const order = ['high', 'midHigh', 'mid', 'midLow', 'low', 'worst'] as const
    let last = 0
    for (const k of order) {
      expect(TRAIT_TIER_PCT_MAX[k], k).toBeGreaterThan(last)
      last = TRAIT_TIER_PCT_MAX[k]
    }
    expect(last).toBe(100)
  })
})
