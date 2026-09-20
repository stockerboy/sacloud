import { describe, expect, it } from 'vitest'
import {
  axisValuesOf,
  axisValuesV4Of,
  crackValueV1,
  foldPlayerHex,
  HEX_SHRINK_K,
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
    /*
     * ⚠ ★2026-09-18 — 세이브가 「비율」 에서 「점수 총합」 이 됐다★ (사장님).
     *   그래서 ★한 판이라도 뛰었으면 0점도 0으로 적는다★ —
     *   「유의미한 차이 아니면 불 끄는 것」 을 하지 말라고 하셨다.
     *   한 판도 안 뛰었을 때만 `null` 이다.
     */
    expect(v.save).toBe(0)
    expect(v.duel).toBeNull()
    /*
     * ⚠ ★2026-09-15 에 세 축의 뜻이 바뀌었다★ (사장님).
     *   선짤·연속킬  «라운드 비율(%)» → ★판당 몇 번★
     *                옛 기대값 — opening 16.7 · burst 12.5 (40/240 · 30/240)
     *                지금 — 40/20 = 2회 · 30/20 = 1.5회
     *   캐리력→게임영향력  «판당 킬» → ★한 라운드에 적 다섯 중 몇 명★
     *                옛 기대값 — 8 (160킬/20판)
     *                지금 — 재료(maxRoundKills)가 없으면 ★null★ 이다 (0 이라 우기지 않는다)
     */
    /*
     * ⚠ ★2026-09-16 — ④ 가 «평균 사망 시간» 이 됐다★ (사장님).
     *   이 픽스처에는 죽은 시각 재료가 없으므로 ★null★ 이다 — 0 이라 우기지 않는다.
     *   옛 기대값은 2 였다 (선짤 40회/20판).
     */
    /*
     * ⚠ ★2026-09-18 — 크랙이 「칠한 구역 안 25초 점수」 가 됐다★ (사장님).
     *   한 판이라도 뛰었으면 0점도 0으로 적는다 — 「불 끄지 마라」 는 지시다.
     */
    expect(v.safe).toBe(0)
    /*
     * ⚠ ★5번 축이 «크랙 성공» 이 됐다★ (2026-09-16 사장님) — 칠한 구역 안 25초 첫 킬 ÷ 판수.
     *
     *   ★그날 저녁에 «어디서» 가 붙었다★ — 사장님이 아티팩트로 116칸을 칠하셔서
     *   재료가 `firstKills`(맵 전체) 에서 `crackKills`(구역 안) 로 바뀌었다.
     *   이 픽스처에는 `crackKills` 가 없으므로 ★null★ 이다 — 0회라고 우기지 않는다.
     *   옛 기대값 — 2 (구역을 안 보던 40회/20판) · 그 전 — null (교환율) · 그 전 — 1.5
     */
    expect(v.gap).toBeNull()
    /* 구역을 안 보던 옛 셈은 그대로 살아 있다 (`CLAUDE.md` 1-4) */
    expect(crackValueV1(player({ leaguePlayerId: 'a', games: 20, firstKills: 40 }))).toBe(2)
    /*
     * ⚠ ★2026-09-18 — 크랙이 「횟수」 에서 「점수」 가 됐다★ (사장님:
     *   「내가 칠한 구역 안에서 잡아야 크랙이야 거기서 이제 누굴 잡았냐
     *    몇명 잡았냐에 따른 점수 차등지급」).
     *
     *   옛 셈   `crackKills` 9회 / 20판 = 45%
     *   지금    `crackScore` 36점 / 20판 = 1.8점 → 눈금에 올려 18
     *
     *   ⚠ 옛 셈은 `axisValuesV4Of` 에 그대로 있다 (`CLAUDE.md` 1-4) — 바로 아래에서 확인한다.
     */
    expect(axisValuesOf(player({ leaguePlayerId: 'a', games: 20, crackScore: 36 }), 0).safe).toBe(18)
    expect(axisValuesV4Of(player({ leaguePlayerId: 'a', games: 20, crackKills: 9 }), 0).safe).toBe(45)
    /*
     * ⚠ ★2026-09-16 밤 — ③가 «기회창출 / 기회차단» 이 됐다★ (사장님).
     *   이 픽스처는 라플(weapon 0)라 «기회차단» 이고, 그 재료(`foeOpenRounds`)가
     *   없으므로 ★null★ 이다 — 0% 라고 우기지 않는다.
     *   옛 기대값 — 0 (게임영향력 «우위를 만든 킬 ÷ 라운드») · 그 전 — 8 (판당 킬)
     *   옛 셈은 `carryValueV4()` 에 그대로 살아 있다.
     */
    expect(v.chance).toBeNull()
    /*
     * ⚠ ★2026-09-18 — 소수싸움이 「뒤집은 비율」 에서 「뒤집어 딴 점수의 평균」 이 됐다★
     *   (사장님: 「소수싸움은 경기6각에서 받은 소수싸움 점수들의 평균 줄세우기」).
     *   이 픽스처에는 `fewScore` 가 없으니 ★0★ 이다 — 한 판이라도 뛰었으면 0으로 적는다.
     *   옛 셈(뒤집은 라운드 비율 33.3%)은 `axisValuesV4Of` 에 그대로 있다.
     */
    expect(v.outnumbered).toBe(0)
    expect(axisValuesV4Of(player({ leaguePlayerId: 'a', outRounds: 30, outWon: 10 }), 0).outnumbered)
      .toBeCloseTo(33.3)
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

  /* 2026-09-12 사장님이 비중을 19:35:46 · 판수무게 300 으로 바꿨다. 혼자면 셋 다 백분위 0 이라 합은 그대로 −1 이다 */
  it('★점수 = 3000 + (700 × 성적 × 티어계수 + 클랜보정) × 신뢰★ — 보정도 판수를 따른다', () => {
    /* 혼자면 모든 백분위가 0 → perf −1 → 3000 − 700 × 티어계수 × 신뢰 + 보정 */
    /*
     * ⚠ ★상수를 시험에 박아 두지 않는다★ (2026-09-20).
     *   `HEX_SHRINK_K` 를 300 → 600 으로 올렸더니 이 시험이 깨졌다 —
     *   ★식이 틀린 게 아니라 시험이 옛 숫자를 외우고 있었다.★
     *   「라운드가 K 면 수축이 0.5」 라는 ★규칙★ 을 시험한다. 숫자가 아니라.
     */
    const [r] = foldPlayerHex([
      player({ leaguePlayerId: 'a', tierGames: { 1: 20, 2: 0, 3: 0 }, clanTier: 1, rounds: HEX_SHRINK_K }),
    ])
    expect(r?.hex).toBe(0)
    expect(r?.tierFactor).toBe(1)
    expect(r?.shrink).toBe(0.5)
    expect(r?.clanBonus).toBe(40)
    /*
     * ⚠ ★2026-09-20 — 클랜 보정이 수축 안으로 들어왔다★ (사장님: 「ㅇㅇ줄여줘」).
     *   옛 식: 3000 + 700×성적×티어계수×수축 ★+ 보정★   ← 보정이 수축 밖
     *   새 식: 3000 + (700×성적×티어계수 ★+ 보정★) × 수축
     *   두 판만 뛴 1구간 선수가 +40 을 온전히 받던 것을 막는다.
     */
    expect(r?.score).toBe(3000 + (-700 + 40) * 0.5)
  })

  it('부리그가 셋이 아닌 리그(SPL)는 티어계수 1 · 클랜보정 0 이다', () => {
    const [r] = foldPlayerHex([player({ leaguePlayerId: 'a', tierGames: { 1: 0, 2: 0, 3: 0 }, clanTier: null })])
    expect(r?.tierFactor).toBe(1)
    expect(r?.clanBonus).toBe(0)
  })
})
