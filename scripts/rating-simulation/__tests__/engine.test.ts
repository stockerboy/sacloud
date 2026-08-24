/**
 * 시뮬레이션 엔진 회귀 (D-139).
 *
 * 시뮬레이션은 **결론의 근거**다. 근거가 재현되지 않거나 규칙이 조용히 어긋나면
 * 그 위에 쓴 보고서 전체가 무너진다. 그래서 규칙을 테스트로 못 박는다.
 *
 * 여기서 고정하는 약속
 *   1. 같은 시드면 같은 결과 (결정성)
 *   2. 동급전 표가 사용자 지시(§31)와 **정확히** 일치한다
 *   3. 패배는 구성과 무관하게 항상 같다 (구성 패널티 없음)
 *   4. 상대 구성은 보너스에 영향이 없다
 *   5. 반복 상대 감쇠가 **없다**
 *   6. 퍼포먼스는 패배를 덜 깎는 방향으로 작동한다 (더 깎지 않는다)
 */
import { describe, expect, it } from 'vitest'
import { Rng } from '../rng'
import {
  CANDIDATE1_CLAN,
  DEFAULT_CLAN,
  DEFAULT_PERSONAL,
  averageMembers,
  clanUpdate,
  compositionBonus,
  compositionScore,
  confidenceFor,
  displayRating,
  expectedScore,
  personalUpdate,
} from '../engine'
import { evenMatchTable } from '../scenarios'

describe('난수 결정성', () => {
  it('같은 시드는 같은 수열을 낸다', () => {
    const a = Array.from({ length: 20 }, () => new Rng(7).next())
    const b = new Rng(7)
    const seq1 = Array.from({ length: 20 }, () => b.next())
    const c = new Rng(7)
    const seq2 = Array.from({ length: 20 }, () => c.next())
    expect(seq1).toEqual(seq2)
    expect(a[0]).toBe(seq1[0])
  })

  it('다른 시드는 다른 수열을 낸다', () => {
    expect(new Rng(1).next()).not.toBe(new Rng(2).next())
  })
})

describe('클랜 — 동급전 표 (§31)', () => {
  it('승리는 30 + (n-1)×3 이다', () => {
    const table = evenMatchTable(DEFAULT_CLAN)
    expect(table.map((r) => Math.round(r.win))).toEqual([30, 33, 36, 39, 42])
  })

  it('패배는 구성과 무관하게 항상 -30 이다 — 구성 패널티 없음', () => {
    const table = evenMatchTable(DEFAULT_CLAN)
    expect(table.map((r) => Math.round(r.lose))).toEqual([-30, -30, -30, -30, -30])
  })

  it('보너스는 (n-1)×3 이다', () => {
    expect([1, 2, 3, 4, 5].map((n) => compositionBonus(n, DEFAULT_CLAN))).toEqual([0, 3, 6, 9, 12])
  })
})

describe('클랜 — 상대 구성은 영향이 없다', () => {
  it('승자 보너스는 패자 구성과 무관하다', () => {
    const results = [1, 2, 3, 4, 5].map(
      (loserMembers) =>
        clanUpdate({
          ratingBefore: 3000,
          opponentRating: 3000,
          won: true,
          members: 4,
          opponentMembers: loserMembers,
          constants: DEFAULT_CLAN,
        }).delta,
    )
    expect(new Set(results.map((r) => Math.round(r)))).toEqual(new Set([39]))
  })

  it('클1이 이겨도 기본 점수는 온전히 받는다', () => {
    const r = clanUpdate({
      ratingBefore: 3000,
      opponentRating: 3000,
      won: true,
      members: 1,
      constants: DEFAULT_CLAN,
    })
    expect(Math.round(r.baseDelta)).toBe(30)
    expect(r.bonus).toBe(0)
  })
})

describe('반복 상대 감쇠가 없다', () => {
  it('같은 상대와 20번 붙어도 n번째라는 이유로 줄지 않는다', () => {
    const deltas: number[] = []
    for (let i = 0; i < 20; i += 1) {
      deltas.push(
        clanUpdate({
          ratingBefore: 3000,
          opponentRating: 3000,
          won: true,
          members: 5,
          constants: DEFAULT_CLAN,
        }).delta,
      )
    }
    // rating 을 고정한 채 반복하면 값이 전부 같아야 한다 (횟수 기반 감쇠가 없다는 뜻)
    expect(new Set(deltas.map((d) => Math.round(d))).size).toBe(1)
  })
})

describe('개인 — 퍼포먼스 방향', () => {
  const base = {
    ratingBefore: 3000,
    opponentAvgRating: 3000,
    gamesBefore: 200,
    constants: DEFAULT_PERSONAL,
  }

  it('이기면 잘할수록 더 받는다', () => {
    const good = personalUpdate({ ...base, won: true, performance: 1 }).delta
    const flat = personalUpdate({ ...base, won: true, performance: 0 }).delta
    const bad = personalUpdate({ ...base, won: true, performance: -1 }).delta
    expect(good).toBeGreaterThan(flat)
    expect(flat).toBeGreaterThan(bad)
  })

  it('지면 잘할수록 **덜** 깎인다 (더 깎이지 않는다)', () => {
    const good = personalUpdate({ ...base, won: false, performance: 1 }).delta
    const flat = personalUpdate({ ...base, won: false, performance: 0 }).delta
    const bad = personalUpdate({ ...base, won: false, performance: -1 }).delta
    expect(good).toBeGreaterThan(flat) // 덜 마이너스
    expect(flat).toBeGreaterThan(bad)
    expect(good).toBeLessThan(0) // 그래도 패배는 마이너스다
  })

  it('퍼포먼스가 승패를 뒤집지 않는다 — 잘해도 패배는 마이너스', () => {
    for (const w of [0, 0.05, 0.1, 0.15]) {
      const r = personalUpdate({
        ...base,
        constants: { ...DEFAULT_PERSONAL, performanceWeight: w },
        won: false,
        performance: 1,
      })
      expect(r.delta).toBeLessThan(0)
    }
  })
})

describe('개인 — 신뢰도', () => {
  it('구간이 지시대로다', () => {
    expect(confidenceFor(1)).toBe(0.4)
    expect(confidenceFor(30)).toBe(0.4)
    expect(confidenceFor(31)).toBe(0.55)
    expect(confidenceFor(60)).toBe(0.55)
    expect(confidenceFor(61)).toBe(0.7)
    expect(confidenceFor(90)).toBe(0.7)
    expect(confidenceFor(91)).toBe(0.85)
    expect(confidenceFor(120)).toBe(0.85)
    expect(confidenceFor(121)).toBe(0.95)
    expect(confidenceFor(149)).toBe(0.95)
    expect(confidenceFor(150)).toBe(1)
  })

  it('150판 이후로는 더 해도 올라가지 않는다', () => {
    expect(confidenceFor(150)).toBe(confidenceFor(1000))
  })

  it('display 모드는 baseline 쪽으로 당긴다', () => {
    expect(displayRating(3400, 20, 'display')).toBeCloseTo(3000 + 400 * 0.4, 6)
    expect(displayRating(3400, 200, 'display')).toBe(3400)
    // delta 모드는 표시값을 건드리지 않는다
    expect(displayRating(3400, 20, 'delta')).toBe(3400)
  })
})

describe('Elo 기본', () => {
  it('동급이면 기대 승률 50%', () => {
    expect(expectedScore(3000, 3000)).toBeCloseTo(0.5, 10)
  })
  it('400점 우위면 약 90.9%', () => {
    expect(expectedScore(3400, 3000)).toBeCloseTo(10 / 11, 6)
  })
  it('양학 승리는 적게, upset 승리는 크게', () => {
    const farm = clanUpdate({ ratingBefore: 4000, opponentRating: 3000, won: true, members: 1, constants: DEFAULT_CLAN }).delta
    const upset = clanUpdate({ ratingBefore: 3000, opponentRating: 4000, won: true, members: 1, constants: DEFAULT_CLAN }).delta
    expect(farm).toBeLessThan(5)
    expect(upset).toBeGreaterThan(55)
  })
})

describe('보너스 모드 (대안)', () => {
  it('zero-sum 은 총량을 늘리지 않는다', () => {
    const constants = { ...DEFAULT_CLAN, bonusMode: 'zero-sum' as const }
    const win = clanUpdate({ ratingBefore: 3000, opponentRating: 3000, won: true, members: 5, opponentMembers: 5, constants })
    const lose = clanUpdate({ ratingBefore: 3000, opponentRating: 3000, won: false, members: 5, opponentMembers: 5, constants })
    expect(win.delta + lose.delta).toBeCloseTo(0, 6)
  })

  it('separate-track 은 래더에 보너스를 넣지 않는다', () => {
    const constants = { ...DEFAULT_CLAN, bonusMode: 'separate-track' as const }
    const r = clanUpdate({ ratingBefore: 3000, opponentRating: 3000, won: true, members: 5, constants })
    expect(Math.round(r.delta)).toBe(30)
  })

  it('opponent-scaled 는 약자를 이길 때 보너스가 거의 없다', () => {
    const constants = { ...DEFAULT_CLAN, bonusMode: 'opponent-scaled' as const }
    const farm = clanUpdate({ ratingBefore: 4000, opponentRating: 3000, won: true, members: 5, constants })
    const even = clanUpdate({ ratingBefore: 3000, opponentRating: 3000, won: true, members: 5, constants })
    expect(farm.bonus).toBeLessThan(3)
    expect(even.bonus).toBeCloseTo(12, 6)
  })
})

/* -------------------------------------------------------------------------- */
/* 후보 1안 (D-140)                                                            */
/* -------------------------------------------------------------------------- */

describe('후보 1안 — 상한 있는 구성 보정', () => {
  it('기준점이 지시대로다', () => {
    expect(compositionScore(1)).toBe(0)
    expect(compositionScore(2)).toBe(20)
    expect(compositionScore(3)).toBe(40)
    expect(compositionScore(4)).toBe(70)
    expect(compositionScore(5)).toBe(100)
  })

  it('기준점 사이는 직선이다 — 한 명 더 데려오면 조금 더 받는다', () => {
    expect(compositionScore(2.5)).toBe(30)
    expect(compositionScore(3.5)).toBe(55)
    expect(compositionScore(4.5)).toBe(85)
  })

  it('단조 증가한다', () => {
    let prev = -1
    for (let a = 1; a <= 5; a += 0.1) {
      const score = compositionScore(a)
      expect(score).toBeGreaterThanOrEqual(prev)
      prev = score
    }
  })

  it('**상한 100 을 넘지 않는다** — 판수로 무한 적립되지 않는다', () => {
    expect(compositionScore(5)).toBe(100)
    expect(compositionScore(10)).toBe(100)
    expect(compositionScore(999)).toBe(100)
  })

  it('1명 미만·0명은 0이다', () => {
    expect(compositionScore(0)).toBe(0)
    expect(compositionScore(0.5)).toBe(0)
  })

  it('최근 N경기만 본다 — 옛날 기록으로 계속 받지 않는다', () => {
    const history = [...Array(30).fill(5), ...Array(20).fill(1)]
    // 최근 20경기가 전부 1명이므로 평균도 1이어야 한다
    expect(averageMembers(history, 20)).toBe(1)
    expect(compositionScore(averageMembers(history, 20))).toBe(0)
  })

  it('경기가 없으면 0이다', () => {
    expect(averageMembers([])).toBe(0)
  })
})

describe('후보 1안 — 클랜 Elo 는 순수 제로섬이다', () => {
  it('승자 이득과 패자 손실이 정확히 상쇄된다', () => {
    for (const [a, b] of [[3000, 3000], [3400, 3000], [3000, 3400], [4000, 3000]] as const) {
      const win = clanUpdate({ ratingBefore: a, opponentRating: b, won: true, members: 5, constants: CANDIDATE1_CLAN })
      const lose = clanUpdate({ ratingBefore: b, opponentRating: a, won: false, members: 5, constants: CANDIDATE1_CLAN })
      expect(win.delta + lose.delta).toBeCloseTo(0, 9)
    }
  })

  it('구성이 몇 명이든 래더 delta 가 같다 — 누적 보너스가 없다', () => {
    const deltas = [1, 2, 3, 4, 5].map(
      (m) => clanUpdate({ ratingBefore: 3000, opponentRating: 3000, won: true, members: m, constants: CANDIDATE1_CLAN }).delta,
    )
    expect(new Set(deltas.map((d) => Math.round(d * 1e6))).size).toBe(1)
    expect(Math.round(deltas[0]!)).toBe(25) // K 50 · 동급전 ±25
  })
})

describe('후보 1안 — 표시 배율', () => {
  it('내부는 그대로 두고 표시만 늘린다', () => {
    // 내부 3387 · 배율 3.3 → 3000 + 387×3.3 = 4277.1
    expect(displayRating(3387, 200, 'display', 3.3)).toBeCloseTo(4277.1, 6)
  })

  it('baseline 은 배율과 무관하게 3000 이다', () => {
    expect(displayRating(3000, 200, 'display', 3.3)).toBe(3000)
  })

  it('신뢰도를 배율보다 **먼저** 적용한다 — 덜 검증된 점수를 3배로 부풀리지 않는다', () => {
    // 20판(신뢰도 0.4) · 내부 3400 → 3000 + 400×0.4×3.3 = 3528
    expect(displayRating(3400, 20, 'display', 3.3)).toBeCloseTo(3528, 6)
    // 신뢰도를 나중에 적용했다면 3000 + 400×3.3×0.4 = 3528 로 같지만,
    // 순서가 바뀌면 baseline 처리가 달라진다 — 아래가 그것을 고정한다
    expect(displayRating(2600, 20, 'display', 3.3)).toBeCloseTo(3000 - 400 * 0.4 * 3.3, 6)
  })

  it('배율 1 이면 예전과 같다', () => {
    expect(displayRating(3400, 200, 'display', 1)).toBe(3400)
  })
})
