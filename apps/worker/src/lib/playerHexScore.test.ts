import { describe, expect, it } from 'vitest'
import {
  axisValuesOf,
  foldPlayerHex,
  mainWeaponOf,
  percentileOf,
  tierFactorOf,
  type PlayerHexInput,
  homeTierOf,
} from './playerHexScore.js'

function player(over: Partial<PlayerHexInput> & { leaguePlayerId: string }): PlayerHexInput {
  return {
    games: 20,
    wins: 10,
    sniperGames: 0,
    rifleGames: 20,
    kills: 160,
    tierGames: { 1: 10, 2: 10, 3: 0 },
    clanTier: 2,
    rounds: 240,
    firstKills: 40,
    burstRounds: 30,
    aloneRounds: 20,
    aloneWon: 6,
    outRounds: 60,
    outWon: 20,
    sniperDuelWon: 0,
    sniperDuelLost: 0,
    rifleDuelWon: 60,
    rifleDuelLost: 40,
    ...over,
  }
}

describe('주무기', () => {
  it('판수가 더 많은 쪽이 10판 이상일 때만 정한다', () => {
    expect(mainWeaponOf({ sniperGames: 12, rifleGames: 3 })).toBe(1)
    expect(mainWeaponOf({ sniperGames: 3, rifleGames: 12 })).toBe(0)
    expect(mainWeaponOf({ sniperGames: 9, rifleGames: 2 })).toBeNull()
    expect(mainWeaponOf({ sniperGames: 10, rifleGames: 10 })).toBeNull()
  })
})

describe('축 원값', () => {
  it('표본이 모자라면 null 이다 — 0 이 아니다', () => {
    const v = axisValuesOf(player({ leaguePlayerId: 'a', aloneRounds: 9, aloneWon: 9, rifleDuelWon: 10, rifleDuelLost: 9 }), 0)
    expect(v.save).toBeNull()
    expect(v.duel).toBeNull()
    expect(v.opening).toBeCloseTo(16.7)
    expect(v.burst).toBe(12.5)
    expect(v.carry).toBe(8)
    expect(v.outnumbered).toBeCloseTo(33.3)
  })

  it('싸움은 주무기 쪽 잡음·당함만 본다', () => {
    const p = player({ leaguePlayerId: 'a', sniperDuelWon: 30, sniperDuelLost: 10, rifleDuelWon: 10, rifleDuelLost: 30 })
    expect(axisValuesOf(p, 1).duel).toBe(75)
    expect(axisValuesOf(p, 0).duel).toBe(25)
  })
})

describe('백분위 · 티어계수', () => {
  it('나보다 낮은 사람의 비율이다', () => {
    expect(percentileOf([10, 20, 30, 40], 25)).toBe(50)
    expect(percentileOf([10, 20, 30, 40], 10)).toBe(0)
    expect(percentileOf([10, 20, 30, 40], 100)).toBe(100)
    expect(percentileOf([], 5)).toBeNull()
    expect(percentileOf([1], null)).toBeNull()
  })

  /* ⚠ 정정 (2026-09-11 사장님) — 옛 판은 «상대 티어별 판수의 가중 평균» 이었다.
     지금은 ★가장 많이 뛴 구간 하나★ 의 무게를 쓴다. 옛 판은 TIER_FACTOR_WEIGHTED 로 되돌린다 */
  it('티어계수는 가장 많이 뛴 구간의 무게다 (ASTRA 1 · CH1 0.367 · CH2 0.347)', () => {
    expect(tierFactorOf({ 1: 10, 2: 0, 3: 0 })).toBe(1)
    expect(tierFactorOf({ 1: 0, 2: 10, 3: 0 })).toBe(0.367)
    /* 5:5 면 높은 구간(ASTRA)을 준다 — 용병으로 아래 티어를 뛰어도 깎이지 않는다 */
    expect(tierFactorOf({ 1: 5, 2: 5, 3: 0 })).toBe(1)
    expect(tierFactorOf({ 1: 3, 2: 9, 3: 0 })).toBe(0.367)
    expect(tierFactorOf({ 1: 0, 2: 0, 3: 0 })).toBe(1)
  })
  it('내 구간 — 가장 많이 뛴 티어 · 같으면 높은 쪽', () => {
    expect(homeTierOf({ 1: 0, 2: 0, 3: 0 })).toBe(null)
    expect(homeTierOf({ 1: 2, 2: 9, 3: 1 })).toBe(2)
    expect(homeTierOf({ 1: 4, 2: 4, 3: 0 })).toBe(1)
  })
})

describe('접기', () => {
  it('무기별 모집단으로 나눠 등수를 매기고, 주무기가 없는 사람은 weapon null 로 남는다', () => {
    const rows = foldPlayerHex([
      player({ leaguePlayerId: 'r1', rifleDuelWon: 80, rifleDuelLost: 20, firstKills: 60 }),
      player({ leaguePlayerId: 'r2' }),
      player({ leaguePlayerId: 'r3', rifleDuelWon: 20, rifleDuelLost: 80, firstKills: 10 }),
      player({ leaguePlayerId: 's1', sniperGames: 15, rifleGames: 2, sniperDuelWon: 30, sniperDuelLost: 10 }),
      player({ leaguePlayerId: 'n1', sniperGames: 4, rifleGames: 4 }),
    ])
    const byId = new Map(rows.map((r) => [r.leaguePlayerId, r]))
    expect(byId.get('r1')?.weapon).toBe(0)
    expect(byId.get('r1')?.scoreRank).toBe(1)
    expect(byId.get('r1')?.scoreTotal).toBe(3)
    expect(byId.get('r3')?.scoreRank).toBe(3)
    expect(byId.get('s1')?.weapon).toBe(1)
    expect(byId.get('s1')?.scoreTotal).toBe(1)
    expect(byId.get('n1')?.weapon).toBeNull()
    expect(byId.get('n1')?.score).toBeNull()
    expect(byId.get('n1')?.scoreRank).toBeNull()
  })

  it('점수 = 3000 + 700 × (여섯축 0.8 + 승률 0.2) × 티어계수 × 신뢰 + 클랜보정', () => {
    /* 혼자면 모든 백분위가 0 → perf −1 → 3000 − 700 × 티어계수 × 신뢰 + 보정 */
    const [r] = foldPlayerHex([player({ leaguePlayerId: 'a', tierGames: { 1: 20, 2: 0, 3: 0 }, clanTier: 1, rounds: 120 })])
    expect(r?.hex).toBe(0)
    expect(r?.tierFactor).toBe(1)
    expect(r?.shrink).toBe(0.5)
    expect(r?.clanBonus).toBe(40)
    expect(r?.score).toBe(3000 - 700 * 0.5 + 40)
  })

  it('부리그가 셋이 아닌 리그(SPL)는 티어계수 1 · 클랜보정 0 이다', () => {
    const [r] = foldPlayerHex([player({ leaguePlayerId: 'a', tierGames: { 1: 0, 2: 0, 3: 0 }, clanTier: null })])
    expect(r?.tierFactor).toBe(1)
    expect(r?.clanBonus).toBe(0)
  })
})
