/**
 * 경기 상세(펼친 패널) 표시 회귀 테스트.
 *
 * ── 왜 있나
 *   여기 있는 분기는 **틀려도 화면이 멀쩡해 보인다.** 딜량 막대가 엉뚱한 기준으로
 *   그려져도 막대는 그럴듯하고, 래더가 없는 참가자에게 `0점` 을 찍어도 셀은 채워진다.
 *   실제로 예전 구현이 그렇게 거짓말을 했다. 눈으로는 못 잡으니 분기를 고정한다.
 *
 * ── 여기서 고정하는 것
 *   1. 딜량 막대 기준은 **그 경기 최대 딜량**이고, 결측(`null`)은 기준 계산에서 뺀다
 *   2. 비율은 분모를 아는 경우에만 만든다 (0킬 헤드샷 비율을 만들지 않는다)
 *   3. 모르면 `알수없음` — 0 으로 채우지 않는다 (D-034 · D-148)
 *   4. 배치고사면 래더 자리에 `배치고사`
 *   5. 진영 정보를 모르면(`blue_team === null`) 선레드/선블루를 적지 않는다
 */
import { describe, expect, it } from 'vitest'
import { WEAPON } from '@sacloud/contract'
import {
  damageBarPercent,
  firstSideLabel,
  headshotView,
  kdaView,
  matchWeaponLabel,
  maxDamage,
  mvpBadgeVisible,
  ratingCellView,
  teamIsViewerClan,
  teamWon,
} from '../record/matchDetailView'

/* ------------------------------------------------------------------ 딜량 --- */

describe('딜량 막대는 그 경기 최대 딜량을 기준으로 한다', () => {
  it('최대값 대비 비율로 길이를 정한다', () => {
    const stats = [{ damage: 3679 }, { damage: 1438 }, { damage: 2144 }]
    const max = maxDamage(stats)
    expect(max).toBe(3679)
    expect(damageBarPercent(3679, max)).toBe(100)
    expect(damageBarPercent(1438, max)).toBeCloseTo((1438 / 3679) * 100, 6)
  })

  it('null 은 최대값 계산에서 뺀다 — 결측이 기준을 끌어내리지 않는다', () => {
    expect(maxDamage([{ damage: null }, { damage: 1200 }, { damage: null }])).toBe(1200)
    // 결측이 0으로 취급됐다면 최대값은 그대로지만, 반대로 최대값 자리가 결측일 때가 문제다
    expect(maxDamage([{ damage: null }, { damage: 900 }, { damage: 2000 }])).toBe(2000)
  })

  it('전원 null 이면 기준이 없어 막대를 그리지 않는다', () => {
    const max = maxDamage([{ damage: null }, { damage: null }])
    expect(max).toBeNull()
    expect(damageBarPercent(null, max)).toBeNull()
    expect(damageBarPercent(1500, max)).toBeNull()
  })

  it('참가자가 없으면 기준도 없다', () => {
    expect(maxDamage([])).toBeNull()
  })

  it('내 딜량이 null 이면 막대를 그리지 않는다', () => {
    expect(damageBarPercent(null, 3000)).toBeNull()
  })

  it('전원 0딜이어도 모두 100% 막대가 되지 않는다', () => {
    const max = maxDamage([{ damage: 0 }, { damage: 0 }])
    expect(max).toBe(0)
    expect(damageBarPercent(0, max)).toBeNull()
  })

  it('막대 길이는 0~100 을 벗어나지 않는다', () => {
    expect(damageBarPercent(5000, 3000)).toBe(100)
    expect(damageBarPercent(-100, 3000)).toBe(0)
  })
})

/* ---------------------------------------------------------------- 헤드샷 --- */

describe('헤드샷 비율은 킬을 알 때만 만든다', () => {
  it('킬 대비로 계산한다', () => {
    const view = headshotView(1, 9)
    expect(view).toEqual({ kind: 'known', headshot: 1, rate: (1 / 9) * 100 })
  })

  it('킬이 0이면 비율을 만들지 않는다 — 0/0 을 0% 로 적지 않는다', () => {
    expect(headshotView(0, 0)).toEqual({ kind: 'known', headshot: 0, rate: null })
  })

  it('킬을 모르면 비율을 만들지 않는다', () => {
    expect(headshotView(3, null)).toEqual({ kind: 'known', headshot: 3, rate: null })
  })

  it('헤드샷을 모르면 알수없음이다 — 0 으로 채우지 않는다', () => {
    expect(headshotView(null, 9)).toEqual({ kind: 'unknown' })
    expect(headshotView(null, null)).toEqual({ kind: 'unknown' })
  })
})

/* ------------------------------------------------------------------- kda --- */

describe('kda 는 모르면 알수없음이다', () => {
  it('셋 다 null 이면 알수없음 (명단만 복원된 참가자 · D-148)', () => {
    expect(kdaView({ kill: null, death: null, assist: null, kd_rate: null })).toEqual({
      kind: 'unknown',
    })
  })

  it('값이 있으면 그대로 쓰고 킬뎃 비율도 함께 준다', () => {
    expect(kdaView({ kill: 9, death: 9, assist: 4, kd_rate: 50 })).toEqual({
      kind: 'known',
      kill: 9,
      death: 9,
      assist: 4,
      rate: 50,
    })
  })

  it('0킬 0데스 0어시는 알수없음이 아니다 — 실제로 그렇게 뛴 것이다', () => {
    expect(kdaView({ kill: 0, death: 0, assist: 0, kd_rate: null }).kind).toBe('known')
  })

  it('일부만 모르면 아는 값을 지우지 않는다', () => {
    expect(kdaView({ kill: 7, death: null, assist: null, kd_rate: null })).toEqual({
      kind: 'known',
      kill: 7,
      death: null,
      assist: null,
      rate: null,
    })
  })

  it('킬뎃 비율을 모르면 만들지 않는다', () => {
    expect(kdaView({ kill: 9, death: 9, assist: 4, kd_rate: null }).kind).toBe('known')
    const view = kdaView({ kill: 9, death: 9, assist: 4, kd_rate: null })
    expect(view.kind === 'known' ? view.rate : 'x').toBeNull()
  })
})

/* ------------------------------------------------------------------ 래더 --- */

describe('래더 칸', () => {
  it('배치고사면 숫자 대신 배치고사다', () => {
    expect(ratingCellView({ placement: true, rating: null })).toEqual({ kind: 'placement' })
    // 값이 있어도 배치 중이면 배치고사가 이긴다 (원본 규칙)
    expect(ratingCellView({ placement: true, rating: 1500 })).toEqual({ kind: 'placement' })
  })

  it('래더 값이 있으면 그 값이다', () => {
    expect(ratingCellView({ placement: false, rating: 1540 })).toEqual({
      kind: 'rating',
      value: 1540,
    })
  })

  it('배치도 아닌데 값이 없으면 알수없음이다 — 0점으로 채우지 않는다', () => {
    expect(ratingCellView({ placement: false, rating: null })).toEqual({ kind: 'unknown' })
  })
})

/* ------------------------------------------------------------------ 무기 --- */

describe('무기 칸', () => {
  it('0 은 라이플, 1 은 스나이퍼다', () => {
    expect(matchWeaponLabel(WEAPON.RIFLE)).toBe('라이플')
    expect(matchWeaponLabel(WEAPON.SNIPER)).toBe('스나이퍼')
  })

  it('모르면 null 이고 화면이 알수없음을 그린다 (D-034)', () => {
    expect(matchWeaponLabel(null)).toBeNull()
    expect(matchWeaponLabel(undefined)).toBeNull()
  })

  it('0 을 falsy 로 흘려 알수없음으로 만들지 않는다', () => {
    expect(matchWeaponLabel(0)).toBe('라이플')
  })
})

/* -------------------------------------------------------------- 팀 헤더 --- */

describe('선공 표기는 진영 정보를 알 때만 적는다', () => {
  it('blue_team 이 null 이면 어느 팀에도 적지 않는다', () => {
    expect(firstSideLabel(null, 'red')).toBeNull()
    expect(firstSideLabel(null, 'blue')).toBeNull()
    expect(firstSideLabel(undefined, 'red')).toBeNull()
  })

  it('알면 진영대로 적는다 — 레드 블록은 선레드, 블루 블록은 선블루', () => {
    expect(firstSideLabel(true, 'red')).toBe('선레드')
    expect(firstSideLabel(true, 'blue')).toBe('선블루')
    expect(firstSideLabel(false, 'red')).toBe('선레드')
    expect(firstSideLabel(false, 'blue')).toBe('선블루')
  })
})

describe('팀 블록이 어느 클랜인지 잇는다', () => {
  it('참가자 기록의 win 이 팀 승패다', () => {
    expect(teamWon([{ win: true }])).toBe(true)
    expect(teamWon([{ win: false }])).toBe(false)
    expect(teamWon([])).toBeNull()
  })

  it('승패가 보는 쪽과 같으면 보는 쪽 클랜이다', () => {
    const stats = [{ win: true }, { win: true }, { win: true }]
    expect(teamIsViewerClan(stats, true)).toBe(true)
    expect(teamIsViewerClan(stats, false)).toBe(false)
  })

  it('진 팀은 보는 쪽이 이겼을 때 상대 클랜이다', () => {
    expect(teamIsViewerClan([{ win: false }], true)).toBe(false)
    expect(teamIsViewerClan([{ win: false }], false)).toBe(true)
  })

  it('참가자가 없으면 근거가 없어 null 이다 — 클랜명을 지어내지 않는다', () => {
    expect(teamIsViewerClan([], true)).toBeNull()
    expect(teamIsViewerClan([], false)).toBeNull()
  })
})

/* ------------------------------------------------------------------- MVP --- */

describe('MVP 배지', () => {
  it('경기가 지목한 한 명에게만 붙는다', () => {
    expect(mvpBadgeVisible('p1', null, 'p1')).toBe(true)
    expect(mvpBadgeVisible('p2', true, 'p1')).toBe(false)
  })

  it('지목이 없으면 참가자 플래그를 본다', () => {
    expect(mvpBadgeVisible('p1', true, null)).toBe(true)
    expect(mvpBadgeVisible('p1', false, null)).toBe(false)
  })

  it('모르면(null) 붙이지 않는다 (D-034)', () => {
    expect(mvpBadgeVisible('p1', null, null)).toBe(false)
  })
})
