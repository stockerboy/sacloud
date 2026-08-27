import { describe, expect, it } from 'vitest'
import { positionLabel, resolvePlayerPosition } from '../record/weaponCopy'

/**
 * 포지션은 **경기 수로만** 정한다 (D-152).
 * 킬 수·킬뎃·현재 클랜으로 정하지 않는다. 동률이면 반드시 `멀티` 다.
 */
describe('resolvePlayerPosition', () => {
  it('스나 경기가 더 많으면 스나이퍼', () => {
    expect(resolvePlayerPosition(10, 3)).toBe('sniper')
    expect(resolvePlayerPosition(1, 0)).toBe('sniper')
  })

  it('라이플 경기가 더 많으면 라이플', () => {
    expect(resolvePlayerPosition(3, 10)).toBe('rifle')
    expect(resolvePlayerPosition(0, 1)).toBe('rifle')
  })

  it('동률이면 반드시 멀티 — 한쪽으로 몰아 주지 않는다', () => {
    expect(resolvePlayerPosition(5, 5)).toBe('multi')
    expect(resolvePlayerPosition(1, 1)).toBe('multi')
    expect(resolvePlayerPosition(120, 120)).toBe('multi')
  })

  it('둘 다 0이면 멀티가 아니라 집계 없음', () => {
    /* 뛴 적이 없는데 "멀티로 뛴다"고 말할 수는 없다 */
    expect(resolvePlayerPosition(0, 0)).toBe('none')
  })

  it('음수·NaN 같은 값이 와도 무너지지 않는다', () => {
    expect(resolvePlayerPosition(-3, 2)).toBe('rifle')
    expect(resolvePlayerPosition(Number.NaN, 4)).toBe('rifle')
    expect(resolvePlayerPosition(Number.NaN, Number.NaN)).toBe('none')
  })

  it('표기는 원본 용어 그대로', () => {
    expect(positionLabel('sniper')).toBe('스나이퍼')
    expect(positionLabel('rifle')).toBe('라이플')
    expect(positionLabel('multi')).toBe('멀티')
    expect(positionLabel('none')).toBe('집계 없음')
  })
})
