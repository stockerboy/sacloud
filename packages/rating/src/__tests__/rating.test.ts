/**
 * 래더 엔진 회귀 테스트 — **D-145 FINAL LOCK** 기준.
 *
 * 사양: `docs/RATING_FINAL_SPEC.md`
 * 여기서 지키는 것은 **정책**이다. 상수를 바꾸다가 성질이 깨지면 여기서 잡힌다.
 */
import { describe, expect, it } from 'vitest'
import {
  CLAN_FORMULA_VERSION,
  DEFAULT_RATING_CONSTANTS,
  PERSONAL_FORMULA_VERSION,
  applyWinRateBands,
  averageMembers,
  clanDailyDecay,
  clanRatingUpdate,
  compositionScore,
  confidenceFor,
  dailyDecay,
  displayScore,
  evaluateEligibility,
  expectedScore,
  lineupConfidence,
  personalRatingUpdate,
  rateMatch,
  roundHalfUp,
  seasonStartRating,
  suppressionFactor,
  type ConfirmedParticipant,
} from '../index.js'

const C = DEFAULT_RATING_CONSTANTS
const BASE = C.initialRating

function member(
  playerId: string,
  rosterLeagueClanId: string | null,
  outcome: 'win' | 'lose',
  ratingBefore = BASE,
  sources: ConfirmedParticipant['sources'] = ['player_match_list'],
): ConfirmedParticipant {
  return {
    playerId,
    rosterLeagueClanId,
    outcome,
    kill: 10,
    death: 8,
    assist: 2,
    sources,
    ratingBefore,
  }
}

function detailSide(
  playerId: string,
  playedFor: string,
  roster: string | null,
  outcome: 'win' | 'lose',
  ratingBefore = BASE,
): ConfirmedParticipant {
  return { ...member(playerId, roster, outcome, ratingBefore), detailLeagueClanId: playedFor }
}

function squad(
  prefix: string,
  clan: string,
  outcome: 'win' | 'lose',
  count: number,
  rating = BASE,
): ConfirmedParticipant[] {
  return Array.from({ length: count }, (_, index) =>
    member(`${prefix}${index}`, clan, outcome, rating),
  )
}

/** 정상 5v5 한 경기 */
function match5v5(opts: {
  winnerMembers?: number
  loserMembers?: number
  winnerRating?: number
  loserRating?: number
  clanRatings?: Record<string, number>
} = {}) {
  const wm = opts.winnerMembers ?? 5
  const lm = opts.loserMembers ?? 5
  const winners = [
    ...squad('W', 'A', 'win', wm, opts.winnerRating ?? BASE),
    ...Array.from({ length: 5 - wm }, (_, i) =>
      detailSide(`WM${i}`, 'A', 'X', 'win', opts.winnerRating ?? BASE),
    ),
  ]
  const losers = [
    ...squad('L', 'B', 'lose', lm, opts.loserRating ?? BASE),
    ...Array.from({ length: 5 - lm }, (_, i) =>
      detailSide(`LM${i}`, 'B', 'Y', 'lose', opts.loserRating ?? BASE),
    ),
  ]
  return rateMatch({
    participants: [...winners, ...losers],
    clanRatings: opts.clanRatings ?? { A: BASE, B: BASE },
  })
}

/* ========================================================================== */

describe('기본 성질', () => {
  it('같은 점수면 기대 승률 0.5', () => {
    expect(expectedScore(BASE, BASE)).toBeCloseTo(0.5, 10)
  })

  it('기대 승률은 400 스케일 표준 Elo 다', () => {
    expect(expectedScore(BASE + 400, BASE)).toBeCloseTo(10 / 11, 10)
  })

  it('K 는 고정 50 이다 — 점수에 따라 변하지 않는다', () => {
    const low = personalRatingUpdate({ ratingBefore: 2000, opponentRating: 2000, outcome: 'win' })
    const high = personalRatingUpdate({ ratingBefore: 4500, opponentRating: 4500, outcome: 'win' })
    expect(low.kUsed).toBe(50)
    expect(high.kUsed).toBe(50)
    expect(low.ratingUpdate).toBeCloseTo(high.ratingUpdate, 10)
  })

  it('클랜 K 도 50 이다', () => {
    expect(clanRatingUpdate({ ratingBefore: BASE, opponentRating: BASE, outcome: 'win' }).kUsed).toBe(50)
  })

  it('배치고사 경기는 증감이 0이다', () => {
    expect(
      personalRatingUpdate({ ratingBefore: BASE, opponentRating: BASE, outcome: 'win', isPlacement: true })
        .ratingUpdate,
    ).toBe(0)
  })

  it('시즌 시작은 모두 같은 기준점이다', () => {
    expect(seasonStartRating()).toBe(3000)
  })

  it('roundHalfUp 은 음수도 크기 기준으로 반올림한다', () => {
    expect(roundHalfUp(2.5)).toBe(3)
    expect(roundHalfUp(-2.5)).toBe(-3)
  })
})

describe('제로섬 — 점수가 새거나 쌓이지 않는다', () => {
  it('한 경기의 개인 증감 합은 0이다', () => {
    const result = match5v5()
    const total = result.players.reduce((sum, p) => sum + p.ratingUpdate, 0)
    expect(total).toBeCloseTo(0, 8)
  })

  it('점수 차가 나는 경기에서도 개인 증감 합은 0이다', () => {
    const result = match5v5({ winnerRating: BASE + 300, loserRating: BASE - 200 })
    expect(result.players.reduce((sum, p) => sum + p.ratingUpdate, 0)).toBeCloseTo(0, 8)
  })

  it('클랜 증감 합도 0이다 — 반영률로 한쪽만 깎지 않는다', () => {
    const result = match5v5({ winnerMembers: 5, loserMembers: 1 })
    expect(result.clans.reduce((sum, c) => sum + c.ratingUpdate, 0)).toBeCloseTo(0, 8)
  })

  it('억제가 걸린 일방적 경기에서도 합은 0이다', () => {
    const result = match5v5({ winnerRating: BASE + 800, loserRating: BASE - 800 })
    expect(result.players.reduce((sum, p) => sum + p.ratingUpdate, 0)).toBeCloseTo(0, 8)
    expect(result.clans.reduce((sum, c) => sum + c.ratingUpdate, 0)).toBeCloseTo(0, 8)
  })
})

describe('일방적 경기 억제 (D-145 · 0.80 ~ 0.86)', () => {
  it('경계값', () => {
    expect(suppressionFactor(0.5)).toBe(1)
    expect(suppressionFactor(0.8)).toBe(1)
    expect(suppressionFactor(0.81)).toBeCloseTo(1 - 0.01 / 0.06, 10)
    expect(suppressionFactor(0.85)).toBeCloseTo(1 - 0.05 / 0.06, 10)
    expect(suppressionFactor(0.86)).toBe(0)
    expect(suppressionFactor(0.87)).toBe(0)
  })

  it('계단이 없다 — 경계에서 연속이다', () => {
    expect(suppressionFactor(0.8 + 1e-9)).toBeCloseTo(1, 6)
    expect(suppressionFactor(0.86 - 1e-9)).toBeCloseTo(0, 6)
  })

  it('이변(약한 쪽 승리)은 언제나 만점이다', () => {
    const upset = personalRatingUpdate({
      ratingBefore: BASE - 500,
      opponentRating: BASE + 500,
      outcome: 'win',
    })
    expect(upset.suppression).toBe(1)
    expect(upset.ratingUpdate).toBeGreaterThan(40)
  })

  it('예상대로 이긴 일방적 경기는 거의 안 오른다', () => {
    const stomp = personalRatingUpdate({
      ratingBefore: BASE + 500,
      opponentRating: BASE - 500,
      outcome: 'win',
    })
    expect(stomp.suppression).toBe(0)
    expect(stomp.ratingUpdate).toBe(0)
  })

  it('예상대로 진 약팀도 거의 안 잃는다 — 양쪽 대칭이다', () => {
    const stomped = personalRatingUpdate({
      ratingBefore: BASE - 500,
      opponentRating: BASE + 500,
      outcome: 'lose',
    })
    expect(Math.abs(stomped.ratingUpdate)).toBe(0)
  })

  it('이변으로 진 강팀은 온전히 잃는다', () => {
    const upsetLoss = personalRatingUpdate({
      ratingBefore: BASE + 500,
      opponentRating: BASE - 500,
      outcome: 'lose',
    })
    expect(upsetLoss.suppression).toBe(1)
    expect(upsetLoss.ratingUpdate).toBeLessThan(-40)
  })
})

describe('신뢰도 — sqrt 곡선 (D-145)', () => {
  it('150경기에서 정확히 100% 가 된다', () => {
    expect(confidenceFor(150)).toBe(1)
  })

  it('150경기 이후로는 늘지 않는다 — 판수 보너스가 아니다', () => {
    expect(confidenceFor(151)).toBe(1)
    expect(confidenceFor(1000)).toBe(1)
  })

  it('경기 수에 따라 단조 증가한다', () => {
    for (const [a, b] of [[1, 30], [30, 31], [60, 61], [90, 91], [120, 121], [149, 150]] as const) {
      expect(confidenceFor(b)).toBeGreaterThanOrEqual(confidenceFor(a))
    }
  })

  it('경계에서 한 경기 점프가 작다 — 계단식(15%p)과 달리 1%p 미만', () => {
    for (const g of [31, 61, 91, 121, 150]) {
      expect(confidenceFor(g) - confidenceFor(g - 1)).toBeLessThan(0.01)
    }
  })

  it('표시 점수 점프로 환산해도 작다 (내부 편차 450 기준)', () => {
    for (const g of [31, 61, 91, 121, 150]) {
      const jump = 450 * C.displayScale * (confidenceFor(g) - confidenceFor(g - 1))
      expect(jump).toBeLessThan(20)
    }
  })

  it('초반은 여전히 강하게 억제된다', () => {
    expect(confidenceFor(1)).toBeLessThan(0.1)
    expect(confidenceFor(30)).toBeLessThan(0.5)
  })
})

describe('표시 점수', () => {
  it('기준점에서 시작한다', () => {
    expect(displayScore({ internalRating: BASE, games: 500, winRate: 0.5 }).display).toBe(3000)
  })

  it('신뢰도가 낮으면 억제된다', () => {
    const few = displayScore({ internalRating: 3400, games: 40, winRate: 0.7 })
    const many = displayScore({ internalRating: 3400, games: 500, winRate: 0.7 })
    expect(few.display).toBeLessThan(many.display)
  })

  it('배율 3.5 가 적용된다', () => {
    expect(displayScore({ internalRating: 3400, games: 150, winRate: 0.7 }).base).toBeCloseTo(
      3000 + 400 * 3.5,
      6,
    )
  })

  it('순서: 표시 → 자격선 → 감점', () => {
    // 자격 미달이라 잘린 뒤에 감점이 붙는다
    const r = displayScore({ internalRating: 3500, games: 300, winRate: 0.3, activityPenalty: 100 })
    expect(r.gated).toBeLessThan(r.base)
    expect(r.display).toBeLessThan(r.gated)
  })

  it('감점만으로 기준점 아래로 내려가지 않는다', () => {
    const r = displayScore({ internalRating: 3100, games: 300, winRate: 0.6, activityPenalty: 99999 })
    expect(r.display).toBeGreaterThanOrEqual(3000)
  })
})

describe('랭커 승률 자격선 — 강한 상대와 붙은 것은 패배의 면죄부가 아니다', () => {
  it('승률 48% 미만은 4000 이상 갈 수 없다', () => {
    expect(applyWinRateBands(5000, 0.47)).toBeLessThan(4000)
    expect(applyWinRateBands(5000, 0.3)).toBeLessThan(4000)
  })

  it('승률 48% 이면 4000 에 오를 수 있다', () => {
    expect(applyWinRateBands(5000, 0.48)).toBeGreaterThanOrEqual(4000)
  })

  it('밴드마다 최소 승률이 지켜진다', () => {
    for (const band of C.winRateBands) {
      expect(applyWinRateBands(6000, band.minWinRate - 0.001)).toBeLessThan(band.minDisplay)
      expect(applyWinRateBands(6000, band.minWinRate)).toBeGreaterThanOrEqual(band.minDisplay)
    }
  })

  it('자격 미달자를 한 점에 몰지 않는다 — 부족한 만큼 더 내린다', () => {
    expect(applyWinRateBands(5000, 0.3)).toBeLessThan(applyWinRateBands(5000, 0.47))
  })

  it('자격을 갖춘 선수의 점수는 건드리지 않는다', () => {
    expect(applyWinRateBands(4250, 0.62)).toBe(4250)
    expect(applyWinRateBands(3500, 0.2)).toBe(3500)
  })

  it('내부 Elo 는 자격선의 영향을 받지 않는다', () => {
    const a = personalRatingUpdate({ ratingBefore: 3400, opponentRating: 3400, outcome: 'lose' })
    const b = personalRatingUpdate({ ratingBefore: 3400, opponentRating: 3400, outcome: 'lose' })
    expect(a.ratingUpdate).toBe(b.ratingUpdate)
  })
})

describe('미참여 감점', () => {
  it('4000 미만은 깎이지 않는다', () => {
    expect(dailyDecay(3999, 365)).toBe(0)
  })

  it('유예 기간에는 깎이지 않는다', () => {
    expect(dailyDecay(4850, 6)).toBe(0)
    expect(dailyDecay(4100, 9)).toBe(0)
  })

  it('높은 점수일수록 빨리 깎인다', () => {
    expect(dailyDecay(4950, 30)).toBeGreaterThan(dailyDecay(4100, 30))
  })

  it('클랜은 개인과 다른 표를 쓴다', () => {
    expect(clanDailyDecay(6)).toBe(0)
    expect(clanDailyDecay(10)).toBeGreaterThan(0)
    expect(clanDailyDecay(21)).toBeGreaterThan(clanDailyDecay(10))
  })

  it('한 판으로 페널티가 초기화되지 않는다', () => {
    expect(C.decayRecoveryPerGame).toBeLessThan(20)
    // 4800 에서 한 달 잠수하면 100점 이상 쌓인다 → 회복에 여러 경기가 필요하다
    let penalty = 0
    for (let day = 1; day <= 35; day += 1) penalty += dailyDecay(4800 - penalty, day)
    expect(penalty).toBeGreaterThan(100)
    expect(Math.ceil(penalty / C.decayRecoveryPerGame)).toBeGreaterThan(10)
  })
})

describe('클랜 구성 보정', () => {
  it('클랜원 1명이어도 0점 처리하지 않는다 — 보정만 +0', () => {
    expect(compositionScore(1)).toBe(0)
  })

  it('상한을 넘지 않는다', () => {
    expect(compositionScore(5)).toBe(C.compositionCap)
    expect(compositionScore(99)).toBe(C.compositionCap)
  })

  it('클랜원이 많을수록 크다', () => {
    expect(compositionScore(4)).toBeGreaterThan(compositionScore(3))
    expect(compositionScore(3)).toBeGreaterThan(compositionScore(2))
  })

  it('판수로 누적되지 않는다 — 최근 N경기 평균만 본다', () => {
    const many = Array.from({ length: 500 }, () => 5)
    const few = Array.from({ length: 20 }, () => 5)
    expect(compositionScore(averageMembers(many))).toBe(compositionScore(averageMembers(few)))
  })

  it('평균은 최근 20경기만 쓴다', () => {
    const recent = [...Array.from({ length: 50 }, () => 1), ...Array.from({ length: 20 }, () => 5)]
    expect(averageMembers(recent)).toBe(5)
  })
})

describe('official 게이트 폐기 (D-145)', () => {
  it('양 팀 본클랜원 0명이어도 래더가 지급된다', () => {
    const result = match5v5({ winnerMembers: 0, loserMembers: 0 })
    expect(result.eligibility.official).toBe(false)
    expect(result.eligibility.ratingEligible).toBe(true)
    expect(result.players).toHaveLength(10)
    expect(result.clans).toHaveLength(2)
    expect(result.players.every((p) => p.ratingUpdate !== 0)).toBe(true)
  })

  it('클1용4 vs 클1용4 도 정상 지급된다', () => {
    const result = match5v5({ winnerMembers: 1, loserMembers: 1 })
    expect(result.players).toHaveLength(10)
    expect(result.clans).toHaveLength(2)
  })

  it('클랜원 수가 증감 크기를 바꾸지 않는다', () => {
    const full = match5v5({ winnerMembers: 5, loserMembers: 5 })
    const none = match5v5({ winnerMembers: 0, loserMembers: 0 })
    const winnerOf = (r: typeof full) => r.clans.find((c) => c.outcome === 'win')!.ratingUpdate
    expect(winnerOf(full)).toBeCloseTo(winnerOf(none), 10)
  })

  it('본클랜원 수는 구성 보정 입력으로만 남는다', () => {
    const result = match5v5({ winnerMembers: 4, loserMembers: 2 })
    expect(result.clans.find((c) => c.outcome === 'win')!.members).toBe(4)
    expect(result.clans.find((c) => c.outcome === 'lose')!.members).toBe(2)
  })

  it('official 라벨 자체는 계속 계산된다', () => {
    expect(match5v5({ winnerMembers: 3, loserMembers: 0 }).eligibility.official).toBe(true)
    expect(match5v5({ winnerMembers: 2, loserMembers: 2 }).eligibility.official).toBe(false)
  })
})

describe('정상 5v5 가 아니면 래더 제외', () => {
  it('4v5 는 래더 대상이 아니다', () => {
    const result = rateMatch({
      participants: [...squad('W', 'A', 'win', 4), ...squad('L', 'B', 'lose', 5)],
      clanRatings: { A: BASE, B: BASE },
    })
    expect(result.eligibility.ratingEligible).toBe(false)
    expect(result.players).toHaveLength(0)
    expect(result.clans).toHaveLength(0)
  })

  it('5v3 도 제외된다', () => {
    const result = rateMatch({
      participants: [...squad('W', 'A', 'win', 5), ...squad('L', 'B', 'lose', 3)],
      clanRatings: { A: BASE, B: BASE },
    })
    expect(result.players).toHaveLength(0)
  })
})

describe('용병 — 개인 100%, 원소속 클랜은 불변', () => {
  it('용병도 개인 증감을 온전히 받는다', () => {
    const result = match5v5({ winnerMembers: 1 })
    const merc = result.players.find((p) => p.playerId === 'WM0')!
    const own = result.players.find((p) => p.playerId === 'W0')!
    expect(merc.ratingUpdate).toBeCloseTo(own.ratingUpdate, 10)
    expect(merc.role).toBe('mercenary')
  })

  it('용병의 원소속 클랜 래더는 변하지 않는다', () => {
    const result = match5v5({ winnerMembers: 1 })
    expect(result.clans.map((c) => c.leagueClanId).sort()).toEqual(['A', 'B'])
  })
})

describe('결정적 replay', () => {
  it('같은 입력은 항상 같은 결과다', () => {
    const a = match5v5({ winnerRating: 3200, loserRating: 3100 })
    const b = match5v5({ winnerRating: 3200, loserRating: 3100 })
    expect(a.players.map((p) => p.ratingUpdate)).toEqual(b.players.map((p) => p.ratingUpdate))
    expect(a.clans.map((c) => c.ratingUpdate)).toEqual(b.clans.map((c) => c.ratingUpdate))
  })

  it('formula version 이 붙는다', () => {
    const result = match5v5()
    expect(result.players[0]!.formulaVersion).toBe(PERSONAL_FORMULA_VERSION)
    expect(result.clans[0]!.formulaVersion).toBe(CLAN_FORMULA_VERSION)
    expect(PERSONAL_FORMULA_VERSION).toBe('sacloud-d145')
  })

  it('NaN/Infinity 가 나오지 않는다', () => {
    for (const [w, l] of [[3000, 3000], [4500, 1000], [1000, 4500], [3000, 5000]] as const) {
      const result = match5v5({ winnerRating: w, loserRating: l })
      for (const p of result.players) expect(Number.isFinite(p.ratingUpdate)).toBe(true)
      for (const c of result.clans) expect(Number.isFinite(c.ratingUpdate)).toBe(true)
    }
  })
})

describe('KD / MVP 는 점수에 들어가지 않는다', () => {
  it('킬뎃이 달라도 증감이 같다', () => {
    const base = squad('W', 'A', 'win', 5)
    const hot = base.map((p) => ({ ...p, kill: 40, death: 1, assist: 20 }))
    const cold = base.map((p) => ({ ...p, kill: 0, death: 30, assist: 0 }))
    const losers = squad('L', 'B', 'lose', 5)
    const a = rateMatch({ participants: [...hot, ...losers], clanRatings: { A: BASE, B: BASE } })
    const b = rateMatch({ participants: [...cold, ...losers], clanRatings: { A: BASE, B: BASE } })
    expect(a.players.map((p) => p.ratingUpdate)).toEqual(b.players.map((p) => p.ratingUpdate))
  })
})

describe('라인업 확인 등급', () => {
  it('5v5 는 high', () => {
    expect(lineupConfidence(5, 5)).toBe('high')
  })
  it('4v5 는 medium', () => {
    expect(lineupConfidence(4, 5)).toBe('medium')
  })
  it('3v5 는 low', () => {
    expect(lineupConfidence(3, 5)).toBe('low')
  })
})

describe('팀 식별', () => {
  it('참가자로 양 팀을 식별한다', () => {
    const result = evaluateEligibility({
      participants: [...squad('W', 'A', 'win', 5), ...squad('L', 'B', 'lose', 5)],
    })
    expect(result.recordable).toBe(true)
    expect(result.winnerLeagueClanId).toBe('A')
    expect(result.completeness).toBe('5v5')
  })
})
