/**
 * 래더 프로토타입 회귀 테스트 (Phase 9 조사용).
 *
 * ⚠️ 이 테스트가 지키는 것은 **운영 동작이 아니라 조사 결과**다.
 *    `src/lab/`는 운영 코드가 아니고, 여기서 고정한 값은
 *    "이 공식으로 계산하면 이런 숫자가 나온다"는 **관측 기록**이다.
 *
 * 두 종류가 섞여 있다.
 *  - ✅ 스펙 §8이 요구한 회귀 항목 — 반드시 통과해야 하는 것
 *  - ⚠️ **취약점을 고정한 테스트** — 지금 이렇다는 사실을 잊지 않기 위한 것.
 *        정책이 바뀌면 이 테스트가 깨져야 정상이다
 */
import { describe, expect, it } from 'vitest'
import {
  applyWeaponDelta,
  combinedRating,
  DIV1_PARAMS,
  DIV2_PARAMS,
  expectedScore,
  paramsForMatch,
  ratingUpdate,
  roundHalfUp,
  winK,
  CROSS_DIVISION_DAMPING,
} from '../lab/ladder.js'
import {
  crossModeDivergence,
  farmingProbe,
  inactivityProbe,
  lineupProbe,
  newcomerProbe,
  repeatMatchProbe,
  specAnchors,
  transferProbe,
  upsetProbe,
  winRateDistortionProbe,
} from '../lab/scenarios.js'
import { clanRatingRosterStrength } from '../lab/clanLadder.js'
import { metrics, simulate, spearman } from '../lab/simulate.js'

describe('공식 기본 성질', () => {
  it('같은 래더끼리면 기대 승률이 0.5다', () => {
    expect(expectedScore(1500, 1500, 3400)).toBeCloseTo(0.5, 10)
  })

  it('래더가 높을수록 승리 K가 작아진다 (36.6 - R/200)', () => {
    expect(winK(1500, DIV1_PARAMS)).toBeCloseTo(29.1, 10)
    expect(winK(3000, DIV1_PARAMS)).toBeCloseTo(21.6, 10)
    expect(winK(3000, DIV1_PARAMS)).toBeLessThan(winK(1500, DIV1_PARAMS))
  })

  it('K는 음수로 내려가지 않는다', () => {
    expect(winK(100000, DIV1_PARAMS)).toBe(0)
  })

  it('half-up 반올림이다 (원본이 정수를 쓴다)', () => {
    expect(roundHalfUp(11.5)).toBe(12)
    expect(roundHalfUp(11.49)).toBe(11)
  })

  it('배치고사 경기의 증감은 0이다 (스펙 §1)', () => {
    const result = ratingUpdate({
      ratingBefore: 1500,
      opponentAvgRating: 2500,
      isWin: true,
      isPlacement: true,
      params: DIV1_PARAMS,
    })
    expect(result.ratingUpdate).toBe(0)
  })
})

describe('스펙 §8 관측 앵커', () => {
  it('div1 동급 패배는 -12다', () => {
    expect(specAnchors('k').div1Even).toBe(-12)
    expect(specAnchors('final').div1Even).toBe(-12)
  })

  it('div2 동급 패배는 -15다', () => {
    expect(specAnchors('k').div2Even).toBe(-15)
    expect(specAnchors('final').div2Even).toBe(-15)
  })

  it('div1이 div2에게 지면 -7이다 (교차 보정 0.6)', () => {
    expect(specAnchors('k').div1VsDiv2).toBe(-7)
    expect(specAnchors('final').div1VsDiv2).toBe(-7)
  })

  it('div2 측은 감쇠되지 않는다 — 비대칭이다 (스펙 §2)', () => {
    expect(specAnchors('k').div2VsDiv1).toBe(-15)
    expect(specAnchors('final').div2VsDiv1).toBe(-15)
  })

  it('2단계 반올림이라 승리에서 +11과 +19가 나오지 않는다', () => {
    for (const mode of ['k', 'final', 'both'] as const) {
      const values = specAnchors(mode).winValues
      expect(values).not.toContain(11)
      expect(values).not.toContain(19)
    }
  })

  it('P-C(양쪽 모두)는 관측 -7을 재현하지 못한다 → 후보에서 탈락', () => {
    expect(specAnchors('both').div1VsDiv2).toBe(-4)
    expect(specAnchors('both').div1VsDiv2).not.toBe(-7)
  })
})

describe('P-A와 P-B의 차이', () => {
  it('앵커만으로는 구분되지 않는다', () => {
    const a = specAnchors('k')
    const b = specAnchors('final')
    expect([a.div1Even, a.div2Even, a.div1VsDiv2, a.div2VsDiv1]).toEqual([
      b.div1Even,
      b.div2Even,
      b.div1VsDiv2,
      b.div2VsDiv1,
    ])
  })

  it('교차 division 승리에서만 갈리고, 차이는 최대 1점이다', () => {
    const divergence = crossModeDivergence()
    expect(divergence.differing).toBeGreaterThan(0)
    expect(divergence.maxDifference).toBe(1)
    // 실제 표본이 있으면 갈릴 만큼은 자주 다르다
    expect(divergence.differing / divergence.scanned).toBeGreaterThan(0.05)
  })
})

describe('경기 시점 division 스냅샷', () => {
  it('div1이 div2를 만날 때만 감쇠한다', () => {
    const cross = paramsForMatch({
      playerDivision: 1,
      opponentDivision: 2,
      div1: DIV1_PARAMS,
      div2: DIV2_PARAMS,
      damping: CROSS_DIVISION_DAMPING,
    })
    expect(cross.crossDamping).toBe(0.6)

    const same = paramsForMatch({
      playerDivision: 2,
      opponentDivision: 1,
      div1: DIV1_PARAMS,
      div2: DIV2_PARAMS,
      damping: CROSS_DIVISION_DAMPING,
    })
    expect(same.crossDamping).toBe(1)
    expect(same.params.loseK).toBe(30)
  })
})

describe('무기 분리 (스펙 §6)', () => {
  it('무기를 바꿔도 rating_update가 변하지 않는다', () => {
    const input = {
      ratingBefore: 1800,
      opponentAvgRating: 1700,
      isWin: true,
      params: DIV1_PARAMS,
    }
    // 공식 입력에 weapon이 아예 없다는 것이 이 테스트의 요지다
    expect(ratingUpdate(input).ratingUpdate).toBe(ratingUpdate({ ...input }).ratingUpdate)
  })

  it('통합 래더 = base + sniper + rifle 이 항상 성립한다', () => {
    let split = { baseRating: 1500, sniperDelta: 0, rifleDelta: 0 }
    split = applyWeaponDelta(split, 'sniper', 17)
    split = applyWeaponDelta(split, 'rifle', -12)
    split = applyWeaponDelta(split, 'sniper', 15)

    expect(split.sniperDelta).toBe(32)
    expect(split.rifleDelta).toBe(-12)
    expect(combinedRating(split)).toBe(1500 + 32 - 12)
  })
})

describe('업셋', () => {
  it('약자의 승리가 강자의 승리보다 크다', () => {
    const probe = upsetProbe('k')
    expect(probe.underdogWin).toBeGreaterThan(probe.favoriteWin)
  })

  it('강자의 패배가 약자의 패배보다 크다 (지는 것이 이득이 되면 안 된다)', () => {
    const probe = upsetProbe('k')
    expect(Math.abs(probe.favoriteLoss)).toBeGreaterThan(Math.abs(probe.underdogLoss))
  })

  it('이겨서 잃거나 져서 얻는 경우는 없다', () => {
    for (let rating = 1000; rating <= 4000; rating += 250) {
      for (let opponent = 1000; opponent <= 4000; opponent += 250) {
        const win = ratingUpdate({
          ratingBefore: rating,
          opponentAvgRating: opponent,
          isWin: true,
          params: DIV1_PARAMS,
        }).ratingUpdate
        const lose = ratingUpdate({
          ratingBefore: rating,
          opponentAvgRating: opponent,
          isWin: false,
          params: DIV1_PARAMS,
        }).ratingUpdate
        expect(win).toBeGreaterThanOrEqual(0)
        expect(lose).toBeLessThanOrEqual(0)
      }
    }
  })
})

describe('⚠️ 취약점 — 지금 이렇다는 사실을 고정한다', () => {
  it('약한 상대만 이겨도 점수가 계속 오른다 (양학이 막히지 않는다)', () => {
    const probe = farmingProbe('k')
    expect(probe.finalRating).toBeGreaterThan(3000)
    expect(probe.reachedZeroGain).toBe(false)
    expect(probe.tailGainPerMatch).toBeGreaterThan(0)
  })

  it('승률 50%로 계속 해도 점수가 오른다 (div1은 제로섬이 아니다)', () => {
    const probe = inactivityProbe('k')
    expect(probe.ratingDrift).toBe(0) // 쉬는 사람은 그대로
    expect(probe.activeGain).toBeGreaterThan(0) // 활동만 해도 오른다
  })

  it('div1은 인플레이션, div2는 제로섬이다', () => {
    const div1Win = ratingUpdate({
      ratingBefore: 1500,
      opponentAvgRating: 1500,
      isWin: true,
      params: DIV1_PARAMS,
    }).ratingUpdate
    const div1Lose = ratingUpdate({
      ratingBefore: 1500,
      opponentAvgRating: 1500,
      isWin: false,
      params: DIV1_PARAMS,
    }).ratingUpdate
    expect(div1Win + div1Lose).toBeGreaterThan(0)

    const div2Win = ratingUpdate({
      ratingBefore: 1500,
      opponentAvgRating: 1500,
      isWin: true,
      params: DIV2_PARAMS,
    }).ratingUpdate
    const div2Lose = ratingUpdate({
      ratingBefore: 1500,
      opponentAvgRating: 1500,
      isWin: false,
      params: DIV2_PARAMS,
    }).ratingUpdate
    expect(div2Win + div2Lose).toBe(0)
  })

  it('약체만 골라 높은 승률을 만든 쪽이 정면승부한 쪽보다 높아진다 (승률 왜곡)', () => {
    const probe = winRateDistortionProbe('k')
    expect(probe.farmerRanksHigher).toBe(true)
    expect(probe.farmerWinRate).toBeGreaterThan(probe.contenderWinRate)
  })

  it('클랜 래더를 개인 증감 평균으로 잡으면 약한 라인업이 이득이다', () => {
    const memberMean = lineupProbe('member-mean', 'k')
    expect(memberMean.exploitable).toBe(true)
    expect(memberMean.weakestLineupGain).toBeGreaterThan(memberMean.strongestLineupGain)
  })
})

describe('클랜 래더 후보', () => {
  it('team-elo는 라인업에 반응하지 않는다', () => {
    const probe = lineupProbe('team-elo', 'k')
    expect(probe.exploitable).toBe(false)
    expect(probe.weakestLineupGain).toBe(probe.strongestLineupGain)
  })

  it('roster-strength만 이적에 즉시 반응한다', () => {
    expect(transferProbe('roster-strength').immediateResponse).toBe(true)
    expect(transferProbe('team-elo').immediateResponse).toBe(false)
    expect(transferProbe('member-mean').immediateResponse).toBe(false)
  })

  it('로스터 강도는 상위 N명 평균이다', () => {
    expect(clanRatingRosterStrength([2400, 1900, 1850, 1800, 1750, 1700], 5, 1500)).toBe(1940)
    expect(clanRatingRosterStrength([], 5, 1500)).toBe(1500)
  })
})

describe('반복 대전 · 신규 유저', () => {
  it('같은 실력 두 팀이 계속 붙어도 점수 차가 발산하지 않는다', () => {
    const probe = repeatMatchProbe('k', { matches: 500 })
    // 무작위 진동은 있어도 한쪽으로 무한히 벌어지지는 않는다
    expect(probe.gapDistribution.max).toBeLessThan(1000)
  })

  it('신규 유저가 상위권에 닿는 데 수백 경기가 필요하지 않다', () => {
    const probe = newcomerProbe('k')
    expect(probe.matchesToTarget).toBeGreaterThan(0)
    expect(probe.matchesToTarget).toBeLessThan(150)
  })
})

describe('시뮬레이터', () => {
  it('같은 seed면 같은 결과가 나온다 (결정적)', () => {
    const first = metrics(simulate({ matches: 500 }))
    const second = metrics(simulate({ matches: 500 }))
    expect(first.ratings).toEqual(second.ratings)
    expect(first.inflation).toBe(second.inflation)
  })

  it('래더가 숨은 실력 순서를 대체로 맞힌다', () => {
    const result = metrics(simulate({ matches: 4000 }))
    expect(result.skillCorrelation).toBeGreaterThan(0.8)
  })

  it('스피어만 상관은 완전 일치에서 1이다', () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 10)
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1, 10)
  })

  it('배치고사 중에는 점수가 움직이지 않는다', () => {
    const result = simulate({ matches: 200, placementMatches: 1000 })
    expect(result.players.every((player) => player.rating === result.config.initialRating)).toBe(
      true,
    )
  })
})
