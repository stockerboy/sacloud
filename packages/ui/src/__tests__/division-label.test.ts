/**
 * 부리그/티어 표기 (D-165).
 *
 * 여기서 고정하는 것은 하나다 — **공식리그 표기가 바뀌지 않는다.**
 * 티어는 값을 새로 만든 것이 아니라 같은 `division` 을 다르게 부르는 것뿐이다.
 */
import { describe, expect, it } from 'vitest'
import { divisionLabel, divisionUnit } from '../league/divisionLabel'

describe('부리그 · 티어 표기', () => {
  it('공식리그는 `N부리그` 그대로다', () => {
    expect(divisionLabel(1, 'official')).toBe('1부리그')
    expect(divisionLabel(2, 'official')).toBe('2부리그')
    expect(divisionUnit('official')).toBe('부리그')
  })

  it('구분을 모르면 공식리그 표기로 둔다 (기존 화면이 안 바뀌게)', () => {
    expect(divisionLabel(1)).toBe('1부리그')
    expect(divisionLabel(3, undefined)).toBe('3부리그')
    expect(divisionUnit(undefined)).toBe('부리그')
  })

  it('무소속리그만 `N티어`다', () => {
    expect(divisionLabel(1, 'independent')).toBe('1티어')
    expect(divisionLabel(6, 'independent')).toBe('6티어')
    expect(divisionUnit('independent')).toBe('티어')
  })

  /* IPL 이 6단이 됐다 (D-181). 표기 함수는 상한을 모르는 것이 정상이라
     6티어까지 나오는지만 본다 — 숫자를 아는 곳은 `INDEPENDENT_TIER_COUNT` 하나다 */
  it('1~6티어가 전부 만들어진다', () => {
    const labels = [1, 2, 3, 4, 5, 6].map((tier) => divisionLabel(tier, 'independent'))
    expect(labels).toEqual(['1티어', '2티어', '3티어', '4티어', '5티어', '6티어'])
  })

  it('모르는 값은 무소속으로 보지 않는다', () => {
    expect(divisionLabel(1, 'INDEPENDENT')).toBe('1부리그')
    expect(divisionLabel(1, '')).toBe('1부리그')
  })
})
