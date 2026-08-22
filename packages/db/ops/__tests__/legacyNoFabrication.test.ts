/**
 * 과거 기록에 **없는 값을 만들어내지 않는다** 회귀 테스트 (D-106 · 정책 14·28).
 *
 * 실제로 있었던 버그를 고정한다.
 *   파서는 `null`을 제대로 냈는데 **importer가 `?? 0`으로 채웠다.**
 *   그래서 승률만 주는 시즌 4 카드가 `0승 0패 · 승률 56.9%` 라는 거짓 기록이 됐다.
 *
 * 0은 "모름"이 아니라 "0번"이다. 둘을 섞으면 되돌릴 수 없다.
 */
import { describe, expect, it } from 'vitest'
import { kdRateOrNull, winRateOrNull } from '@sacloud/contract'
import { legacySeasonCardData } from '../legacyImport'
import type { LegacySeasonRow } from '../legacySource'

/** 시즌 4 실측 형태 — 순위·승률·킬뎃만 있고 승패·킬데스는 없다 */
function seasonFourCard(): LegacySeasonRow {
  return {
    season: 4,
    legacyPlayerId: '285626135',
    legacyLeaguePlayerId: '96273',
    nickname: '천세',
    rank: 122,
    rankCount: 29991,
    win: null,
    lose: null,
    winRate: 56.9,
    kill: null,
    death: null,
    kdRate: 56.9,
    rating: null,
    assist: null,
    headshot: null,
    killPerMatch: null,
    mvpCount: null,
    clanName: null,
    division: null,
    source: '3rd.supply',
  }
}

describe('importer는 없는 값을 0으로 채우지 않는다', () => {
  it('승패·킬데스를 주지 않은 시즌은 그대로 null로 저장한다', () => {
    const data = legacySeasonCardData(seasonFourCard())

    expect(data.win).toBeNull()
    expect(data.lose).toBeNull()
    expect(data.kill).toBeNull()
    expect(data.death).toBeNull()
    expect(data.rating).toBeNull()
  })

  it('원본이 준 값은 그대로 남는다', () => {
    const data = legacySeasonCardData(seasonFourCard())

    expect(data.rank).toBe(122)
    expect(data.rankCount).toBe(29991)
    expect(data.winRate).toBe(56.9)
    expect(data.kdRate).toBe(56.9)
  })

  it('원본 식별자를 버리지 않는다 (닉네임으로 합치지 않기 위한 근거 — D-100)', () => {
    const data = legacySeasonCardData(seasonFourCard())

    expect(data.legacyPlayerId).toBe('285626135')
    expect(data.legacyLeaguePlayerId).toBe('96273')
    expect(data.nicknameAtSeason).toBe('천세')
    expect(data.source).toBe('3rd.supply')
  })

  it('값이 다 있는 시즌은 숫자 그대로 저장한다', () => {
    const data = legacySeasonCardData({
      ...seasonFourCard(),
      season: 6,
      win: 967,
      lose: 578,
      kill: 16875,
      death: 10605,
    })

    expect(data.win).toBe(967)
    expect(data.lose).toBe(578)
    expect(data.kill).toBe(16875)
    expect(data.death).toBe(10605)
  })

  it('0승 0패인 시즌과 모르는 시즌을 구분한다', () => {
    const unknown = legacySeasonCardData(seasonFourCard())
    const zero = legacySeasonCardData({ ...seasonFourCard(), win: 0, lose: 0 })

    expect(unknown.win).toBeNull()
    expect(zero.win).toBe(0)
    expect(unknown.win).not.toBe(zero.win)
  })
})

describe('모르는 값으로는 파생값을 계산하지 않는다', () => {
  it('승패를 모르면 승률도 모른다 (0%로 만들지 않는다)', () => {
    expect(winRateOrNull(null, null)).toBeNull()
    expect(winRateOrNull(3, null)).toBeNull()
    expect(winRateOrNull(null, 3)).toBeNull()
  })

  it('킬데스를 모르면 킬뎃도 모른다', () => {
    expect(kdRateOrNull(null, null)).toBeNull()
    expect(kdRateOrNull(10, null)).toBeNull()
  })

  it('둘 다 알면 평소대로 계산한다', () => {
    expect(winRateOrNull(218, 173)).toBeCloseTo(55.8, 1)
    expect(kdRateOrNull(3468, 3197)).toBeCloseTo(52, 1)
  })

  it('진짜 0승 0패는 0%다 (모름과 다르다)', () => {
    expect(winRateOrNull(0, 0)).toBe(0)
  })
})
