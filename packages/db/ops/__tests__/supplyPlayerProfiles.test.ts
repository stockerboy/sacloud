/**
 * 3rd.supply 선수 프로필 적재 규칙 회귀 (D-161).
 *
 * 여기서 고정하는 것은 **"모르면 지어내지 않는다"** 하나다.
 * 원본 `position` 은 숫자 코드이고, 우리가 원본 화면에서 확인한 표기는 코드 `3` 하나뿐이다.
 * 표를 넓히려면 **원본 화면을 보고** 넓혀야 한다 — 이 테스트가 그 경계를 지킨다.
 */
import { describe, expect, it } from 'vitest'
import { SUPPLY_POSITION_LABELS, supplyPositionLabel } from '../supplyPlayerProfiles'

describe('supplyPositionLabel', () => {
  it('원본 화면에서 확인한 코드만 표기를 준다', () => {
    /* 선수 `Yolloanswag`(position=3)의 원본 상세정보에 `A 숏` 이 떴다 (2026-08-28) */
    expect(supplyPositionLabel(3)).toBe('A 숏')
  })

  it('표기를 모르는 코드는 null 이다 — 그럴듯한 이름을 만들지 않는다', () => {
    /* 존재는 확인했지만 뭐라고 부르는지 못 봤다. `[미확인]` 이다 */
    for (const code of [0, 1, 2, 4, 5, 6]) {
      expect(supplyPositionLabel(code)).toBeNull()
    }
  })

  it('코드 0 을 falsy 로 버리지 않는다', () => {
    /* `0` 은 유효한 코드다. `if (!code)` 로 걸러 내면 그 선수의 값이 조용히 사라진다.
       지금은 표기를 몰라 null 이지만, 그것은 "값이 없다" 가 아니라 "이름을 모른다" 다 */
    expect(Object.prototype.hasOwnProperty.call(SUPPLY_POSITION_LABELS, 0)).toBe(false)
    expect(supplyPositionLabel(0)).toBeNull()
  })

  it('값이 없으면 null 이다', () => {
    expect(supplyPositionLabel(null)).toBeNull()
    expect(supplyPositionLabel(undefined)).toBeNull()
  })

  it('숫자가 아닌 값이 들어와도 무너지지 않는다', () => {
    expect(supplyPositionLabel(Number.NaN)).toBeNull()
    expect(supplyPositionLabel(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('표는 얼려 둔다 — 실행 중에 몰래 늘어나면 안 된다', () => {
    expect(Object.isFrozen(SUPPLY_POSITION_LABELS)).toBe(true)
  })
})
