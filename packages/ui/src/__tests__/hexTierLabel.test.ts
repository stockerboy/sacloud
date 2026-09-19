import { describe, expect, it } from 'vitest'
import { hexTierOf } from '../v3/hexTierLabel'

/**
 * ★육각 등급★ (2026-09-20 사장님)
 *
 * > 「N명중 n위 이렇게 쓰지말고 최하위권 하위권 중하위권 중위권 중상위권 상위권
 * >  최상위권 3,2,1위 이렇게 해줘 상위권기준 빡세게 잡아줘」
 */
describe('육각 등급', () => {
  it('1·2·3위는 숫자 그대로다', () => {
    expect(hexTierOf(1, 1000)?.label).toBe('1위')
    expect(hexTierOf(2, 1000)?.label).toBe('2위')
    expect(hexTierOf(3, 1000)?.label).toBe('3위')
    /* 셋 다 강조한다 */
    expect(hexTierOf(1, 1000)?.strong).toBe(true)
    expect(hexTierOf(3, 1000)?.strong).toBe(true)
  })

  it('★상위권 기준이 빡세다★ — 상위 5% 까지만 강조한다', () => {
    expect(hexTierOf(10, 1000)?.label).toBe('최상위권') /* 1% */
    expect(hexTierOf(50, 1000)?.label).toBe('상위권') /* 5% */
    expect(hexTierOf(50, 1000)?.strong).toBe(true)
    /* 5% 를 넘으면 강조하지 않는다 */
    expect(hexTierOf(51, 1000)?.label).toBe('중상위권')
    expect(hexTierOf(51, 1000)?.strong).toBe(false)
  })

  it('아래 등급이 순서대로 나온다', () => {
    expect(hexTierOf(200, 1000)?.label).toBe('중상위권') /* 20% */
    expect(hexTierOf(500, 1000)?.label).toBe('중위권') /* 50% */
    expect(hexTierOf(750, 1000)?.label).toBe('중하위권') /* 75% */
    expect(hexTierOf(900, 1000)?.label).toBe('하위권') /* 90% */
    expect(hexTierOf(1000, 1000)?.label).toBe('최하위권')
  })

  it('★작은 리그에서도 말이 된다★ — 6곳짜리 클랜 육각', () => {
    expect(hexTierOf(1, 6)?.label).toBe('1위')
    expect(hexTierOf(4, 6)?.label).toBe('중하위권') /* 66.7% */
    expect(hexTierOf(6, 6)?.label).toBe('최하위권')
  })

  it('모르면 `null` 이다 — 지어내지 않는다', () => {
    expect(hexTierOf(null, 1000)).toBeNull()
    expect(hexTierOf(1, null)).toBeNull()
    expect(hexTierOf(0, 1000)).toBeNull()
    expect(hexTierOf(1001, 1000)).toBeNull()
  })
})
