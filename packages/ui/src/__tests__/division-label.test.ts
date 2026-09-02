/**
 * 등급 표기 — 「N티어」 하나뿐이다 (2026-09-02 사장님 지시 #23).
 *
 * > "1부 2부 라는 표현을 이제 아예 안 쓴다."
 *
 * ⚠ 옛 테스트 (D-165) 는 공식리그를 `N부리그`, 무소속리그를 `N티어` 로 못 박았다.
 *   그 규칙은 `divisionLabel.ts` 의 `LEGACY_DIVISION_WORDING` 스위치로만 남아 있다.
 *   여기서 못 박는 것: **어떤 구분값을 주어도 「부리그」 라는 글자는 나오지 않는다.**
 */
import { describe, expect, it } from 'vitest'
import { divisionLabel, divisionUnit } from '../league/divisionLabel'

describe('등급 표기 — 티어 하나뿐 (#23)', () => {
  it('공식리그 구분을 줘도 `N티어` 다', () => {
    expect(divisionLabel(1, 'official')).toBe('1티어')
    expect(divisionLabel(2, 'official')).toBe('2티어')
    expect(divisionUnit('official')).toBe('티어')
  })

  it('구분을 모르면 역시 `N티어` 다', () => {
    expect(divisionLabel(1)).toBe('1티어')
    expect(divisionLabel(3, undefined)).toBe('3티어')
    expect(divisionUnit(undefined)).toBe('티어')
  })

  it('무소속리그는 그대로 `N티어` 다', () => {
    expect(divisionLabel(1, 'independent')).toBe('1티어')
    expect(divisionLabel(6, 'independent')).toBe('6티어')
    expect(divisionUnit('independent')).toBe('티어')
  })

  /* IPL 이 6단이다 (D-181). 표기 함수는 상한을 모르는 것이 정상이라
     6티어까지 나오는지만 본다 — 숫자를 아는 곳은 `INDEPENDENT_TIER_COUNT` 하나다 */
  it('1~6티어가 전부 만들어진다', () => {
    const labels = [1, 2, 3, 4, 5, 6].map((tier) => divisionLabel(tier, 'independent'))
    expect(labels).toEqual(['1티어', '2티어', '3티어', '4티어', '5티어', '6티어'])
  })

  it('어떤 값을 줘도 「부리그」 라는 글자는 나오지 않는다', () => {
    for (const category of ['official', 'independent', 'INDEPENDENT', '', undefined]) {
      expect(divisionLabel(1, category)).not.toContain('부')
      expect(divisionUnit(category)).toBe('티어')
    }
  })
})
