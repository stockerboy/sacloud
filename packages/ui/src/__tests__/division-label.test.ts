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
import { divisionLabel, divisionShort, divisionUnit, tierGroupOf } from '../league/divisionLabel'

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

  /*
   * ⚠ 2026-09-10 — 사장님이 IPL 티어를 ★셋으로 줄이고 이름을 주셨다.★
   *   «티어는 네개 Spectra Astra challenger1 challenger2» → SPECTRA 를 빼고 셋으로 확정.
   *   그래서 무소속리그만 ★이름★ 이 나온다. 공식리그는 그대로 `N티어` 다.
   *   쉘 표기로 돌아가려면 `IPL_TIER_NAMES_ON` 을 `false` 로 둔다.
   */
  /**
   * ⚠ ★2026-09-13 — 챌린저 둘을 합쳤다★ (사장님: «걍 challenger 라고 붙여»).
   *   옛 값 — 2: 'CHALLENGER1' · 3: 'CHALLENGER2'.
   *   ★번호(division)는 그대로 2·3 이다★ — 승강·구간 승률은 여전히 둘을 구분한다.
   *   보이는 이름만 합쳤다.
   */
  it('무소속리그는 티어 이름이 나온다 — 챌린저는 하나다', () => {
    expect(divisionLabel(1, 'independent')).toBe('ASTRA')
    expect(divisionLabel(2, 'independent')).toBe('CHALLENGER')
    expect(divisionLabel(3, 'independent')).toBe('CHALLENGER')
    expect(divisionUnit('independent')).toBe('티어')
  })

  it('구간 묶음 — ASTRA 는 따로, 챌린저는 하나로', () => {
    expect(tierGroupOf(1)).toBe(1)
    expect(tierGroupOf(2)).toBe(2)
    expect(tierGroupOf(3)).toBe(2)
    /* 모르는 번호도 챌린저 쪽으로 — ASTRA 는 1 하나뿐이다 */
    expect(tierGroupOf(4)).toBe(2)
  })

  it('이름을 모르는 번호는 지어내지 않고 쉘 표기로 떨어진다', () => {
    expect(divisionLabel(4, 'independent')).toBe('4티어')
  })

  it('짧은 표기 — 챌린저는 둘 다 CH', () => {
    expect(divisionShort(1, 'independent')).toBe('AST')
    /* 옛 값: 2 → 'CH1' · 3 → 'CH2' (2026-09-13 합침) */
    expect(divisionShort(2, 'independent')).toBe('CH')
    expect(divisionShort(3, 'independent')).toBe('CH')
    expect(divisionShort(1, 'official')).toBe('1T')
  })

  it('어떤 값을 줘도 「부리그」 라는 글자는 나오지 않는다', () => {
    for (const category of ['official', 'independent', 'INDEPENDENT', '', undefined]) {
      expect(divisionLabel(1, category)).not.toContain('부')
      expect(divisionUnit(category)).toBe('티어')
    }
  })
})
