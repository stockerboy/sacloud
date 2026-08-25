/**
 * 무기별 전적 표시 분기 회귀 테스트 (D-149).
 *
 * ── 왜 있나
 *   API 가 옳은 값을 줘도 화면이 `집계 없음` 만 그리면 사용자에게는 고쳐지지 않은 것이다.
 *   실제로 그랬다 — 무기 데이터가 들어온 뒤에도 화면은 계속 `집계 없음` 이었다.
 *
 * ── 여기서 고정하는 것
 *   1. `집계 없음` 은 **그 무기로 뛴 적이 정말 없을 때만** 나온다
 *   2. 뛰었지만 K/D 를 모르면 전 수는 남기고 K/D 자리만 비운다 (0킬로 채우지 않는다)
 *   3. 일부만 아는 경우 아는 경기 수를 함께 알린다
 *   4. 스나이퍼·라이플은 각자 따로 판정된다
 */
import { describe, expect, it } from 'vitest'
import { weaponStatView } from '../record/weaponCopy'

describe('`집계 없음` 은 정말 기록이 없을 때만', () => {
  it('그 무기로 뛴 적이 없으면 none', () => {
    expect(weaponStatView({ games: 0 }).kind).toBe('none')
    expect(weaponStatView({}).kind).toBe('none')
    expect(weaponStatView({ games: 0, knownGames: 0, kdRate: null }).kind).toBe('none')
  })

  it('한 판이라도 뛰었으면 none 이 아니다 — 뛴 경기를 없던 일로 만들지 않는다', () => {
    expect(weaponStatView({ games: 1, knownGames: 0, kdRate: null }).kind).not.toBe('none')
    expect(weaponStatView({ games: 5, knownGames: 5, kdRate: 50 }).kind).not.toBe('none')
  })
})

describe('K/D 를 모르는 경우', () => {
  it('뛴 경기는 있지만 기록이 없으면 unknown 이고 전 수는 남는다', () => {
    const view = weaponStatView({ games: 5, knownGames: 0, kill: 0, death: 0, kdRate: null })
    expect(view).toEqual({ kind: 'unknown', games: 5 })
  })

  it('kdRate 가 undefined 여도 unknown 이다 — 0%로 떨어지지 않는다', () => {
    expect(weaponStatView({ games: 3, knownGames: 2 }).kind).toBe('unknown')
  })

  it('0킬 0데스를 실제 기록인 것처럼 그리지 않는다', () => {
    const view = weaponStatView({ games: 4, knownGames: 0, kill: 0, death: 0, kdRate: null })
    expect(view.kind).toBe('unknown')
    // known 이었다면 `0킬 0데스 0%` 가 화면에 나갔을 것이다
    expect(view).not.toHaveProperty('kill')
  })
})

describe('K/D 를 아는 경우', () => {
  it('전 수 · 킬 · 데스 · 킬뎃을 그대로 넘긴다', () => {
    expect(weaponStatView({ games: 7, knownGames: 7, kill: 70, death: 61, kdRate: 53.4 })).toEqual({
      kind: 'known',
      games: 7,
      knownGames: 7,
      kill: 70,
      death: 61,
      kdRate: 53.4,
      partial: false,
    })
  })

  it('일부 경기만 아는 경우 partial 로 표시한다', () => {
    const view = weaponStatView({
      games: 14,
      knownGames: 11,
      kill: 127,
      death: 81,
      kdRate: 61.1,
    })
    expect(view).toMatchObject({ kind: 'known', games: 14, knownGames: 11, partial: true })
  })

  it('전부 아는 경우 partial 이 아니다', () => {
    expect(weaponStatView({ games: 6, knownGames: 6, kill: 53, death: 52, kdRate: 50.5 })).toMatchObject(
      { partial: false },
    )
  })

  it('K/D 0% 는 유효한 값이다 — 모르는 것과 구분한다', () => {
    // 한 킬도 못 했지만 기록은 있는 경기. `-` 가 아니라 0% 다
    const view = weaponStatView({ games: 2, knownGames: 2, kill: 0, death: 8, kdRate: 0 })
    expect(view.kind).toBe('known')
    expect(view).toMatchObject({ kdRate: 0 })
  })
})

describe('두 무기는 따로 판정된다', () => {
  it('한쪽이 없어도 다른 쪽은 정상으로 나온다', () => {
    const sniper = weaponStatView({ games: 0 })
    const rifle = weaponStatView({ games: 9, knownGames: 9, kill: 80, death: 70, kdRate: 53.3 })
    expect(sniper.kind).toBe('none')
    expect(rifle.kind).toBe('known')
  })

  it('값이 서로 섞이지 않는다', () => {
    const sniper = weaponStatView({ games: 7, knownGames: 7, kill: 70, death: 61, kdRate: 53.4 })
    const rifle = weaponStatView({ games: 6, knownGames: 6, kill: 53, death: 52, kdRate: 50.5 })
    expect(sniper).toMatchObject({ kill: 70, kdRate: 53.4 })
    expect(rifle).toMatchObject({ kill: 53, kdRate: 50.5 })
  })
})
