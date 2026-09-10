import { describe, expect, it } from 'vitest'
import {
  TIER_KD_MIN_GAMES,
  TIER_WIN_RATE_MIN_GAMES,
  buildTierBreakdown,
  tierKdOrNull,
} from '../tierBreakdown'
import { kdRate } from '../derive'

/**
 * ★티어별 킬뎃★ (2026-09-10 · 사장님 «티어별 승률과 킬뎃을 따로 기록해서 ui에 나타낼거니까»).
 *
 * 지키려는 것 셋 —
 *   ① 이 사이트의 킬뎃은 ★킬 ÷ (킬+데스) × 100★ 이다. 킬÷데스 가 아니다
 *   ② 판수가 모자라면 ★말하지 않는다★ (`null`). ★0 이 아니다★ (D-106)
 *   ③ 분모는 판수가 아니라 ★킬뎃을 아는 판수★ 다 (D-149)
 */
describe('tierKdOrNull', () => {
  it('사이트 공통 정의(kdRate)와 같은 값을 낸다 — 킬÷데스 가 아니다', () => {
    expect(tierKdOrNull(20, 100, 50)).toBe(kdRate(100, 50))
    /* 킬÷데스 였다면 2 였을 값이다 */
    expect(tierKdOrNull(20, 100, 50)).toBeCloseTo(66.7, 1)
  })

  it('판수가 모자라면 말하지 않는다 — 0 이 아니라 null', () => {
    expect(tierKdOrNull(TIER_KD_MIN_GAMES - 1, 100, 10)).toBeNull()
    expect(tierKdOrNull(TIER_KD_MIN_GAMES, 100, 10)).not.toBeNull()
  })

  it('한 명도 잡지도 죽지도 않았으면 null 이다', () => {
    expect(tierKdOrNull(30, 0, 0)).toBeNull()
  })

  it('승률과 같은 최소 판수를 쓴다 — 한 줄이 두 기준으로 갈리지 않는다', () => {
    expect(TIER_KD_MIN_GAMES).toBe(TIER_WIN_RATE_MIN_GAMES)
  })
})

describe('buildTierBreakdown — 킬뎃 칸', () => {
  it('킬뎃을 모르는 판은 분모에서 뺀다', () => {
    const row = buildTierBreakdown(1, [
      { tier: 1, games: 40, win: 20, lose: 20, knownGames: 12, kill: 60, death: 40, clans: [] },
    ])[0]!
    expect(row.knownGames).toBe(12)
    expect(row.kd).toBe(kdRate(60, 40))
  })

  it('한 판도 안 붙은 티어는 킬뎃도 null 이다', () => {
    const row = buildTierBreakdown(1, [])[0]!
    expect(row.games).toBe(0)
    expect(row.knownGames).toBe(0)
    expect(row.kd).toBeNull()
  })

  it('킬뎃을 아는 판이 모자라면 승률은 나와도 킬뎃은 안 나온다', () => {
    const row = buildTierBreakdown(1, [
      { tier: 1, games: 30, win: 20, lose: 10, knownGames: 3, kill: 10, death: 5, clans: [] },
    ])[0]!
    expect(row.winRate).not.toBeNull()
    expect(row.kd).toBeNull()
  })
})

describe('buildTierBreakdown — 무기축 (2026-09-10 회의)', () => {
  const tally = {
    tier: 1,
    games: 52,
    win: 34,
    lose: 18,
    knownGames: 52,
    kill: 700,
    death: 500,
    rifleGames: 34,
    rifleKill: 400,
    rifleDeath: 305,
    sniperGames: 18,
    sniperKill: 300,
    sniperDeath: 195,
    clans: [],
  }

  it('무기축마다 판수가 따로 나온다 — 승률의 판수와 다르다', () => {
    const row = buildTierBreakdown(1, [tally])[0]!
    expect(row.games).toBe(52)
    expect(row.rifleGames).toBe(34)
    expect(row.sniperGames).toBe(18)
  })

  it('무기축 킬뎃도 같은 셈법(kdRate)을 쓴다', () => {
    const row = buildTierBreakdown(1, [tally])[0]!
    expect(row.rifleKd).toBe(kdRate(400, 305))
    expect(row.sniperKd).toBe(kdRate(300, 195))
  })

  it('그 무기로 뛴 판이 모자라면 그 축만 null 이다 — 승률·통합은 그대로 나온다', () => {
    const row = buildTierBreakdown(1, [
      { ...tally, rifleGames: 6, sniperGames: 4 },
    ])[0]!
    expect(row.winRate).not.toBeNull()
    expect(row.kd).not.toBeNull()
    expect(row.rifleKd).toBeNull()
    expect(row.sniperKd).toBeNull()
  })

  it('무기 값이 아예 없으면 0판 · null 이다 — 지어내지 않는다', () => {
    const row = buildTierBreakdown(1, [
      { tier: 1, games: 20, win: 10, lose: 10, knownGames: 20, kill: 100, death: 80, clans: [] },
    ])[0]!
    expect(row.rifleGames).toBe(0)
    expect(row.rifleKd).toBeNull()
    expect(row.sniperGames).toBe(0)
    expect(row.sniperKd).toBeNull()
  })
})
