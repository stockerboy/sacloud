/**
 * 래더 엔진 회귀 테스트.
 *
 * 사용자가 확정한 **최종 검증 기준(20번)** 을 그대로 테스트로 고정한다.
 * 상수를 바꾸다가 이 성질이 깨지면 여기서 잡힌다.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RATING_CONSTANTS,
  CLAN_FORMULA_VERSION,
  PERSONAL_FORMULA_VERSION,
  clanRatingUpdate,
  clanWeightForMembers,
  evaluateEligibility,
  expectedScore,
  lineupConfidence,
  lineupStrength,
  personalK,
  personalRatingUpdate,
  rateMatch,
  repeatDecayFactor,
  rewardCapFactor,
  roundHalfUp,
  seasonStartRating,
  type ConfirmedParticipant,
} from '../index.js'

const C = DEFAULT_RATING_CONSTANTS

/** 본클랜원 — 등록 클랜과 뛴 팀이 같다 */
function member(
  playerId: string,
  rosterLeagueClanId: string | null,
  outcome: 'win' | 'lose',
  ratingBefore = 1500,
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

/**
 * 상세(`guild_name`) 근거로 팀이 정해지는 참가자.
 *
 * `playedFor`는 그 경기에서 뛴 팀, `roster`는 원소속이다. 둘이 다르면 용병이다.
 */
function detailSide(
  playerId: string,
  playedFor: string,
  roster: string | null,
  outcome: 'win' | 'lose',
  ratingBefore = 1500,
): ConfirmedParticipant {
  return { ...member(playerId, roster, outcome, ratingBefore), detailLeagueClanId: playedFor }
}

function squad(
  prefix: string,
  clan: string,
  outcome: 'win' | 'lose',
  count: number,
  rating = 1500,
): ConfirmedParticipant[] {
  return Array.from({ length: count }, (_, index) =>
    member(`${prefix}${index}`, clan, outcome, rating),
  )
}

describe('기본 성질', () => {
  it('같은 래더끼리면 기대 승률이 0.5다', () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 10)
  })

  it('래더가 높을수록 K가 작아지고 바닥 밑으로는 안 내려간다', () => {
    expect(personalK(1500)).toBeCloseTo(29.1, 10)
    expect(personalK(3000)).toBeCloseTo(21.6, 10)
    expect(personalK(100000)).toBe(C.personalKFloor)
  })

  it('half-up 반올림이고 음수도 대칭이다', () => {
    expect(roundHalfUp(11.5)).toBe(12)
    expect(roundHalfUp(-11.5)).toBe(-12)
    expect(roundHalfUp(11.49)).toBe(11)
  })

  it('배치고사 경기의 증감은 0이다', () => {
    expect(
      personalRatingUpdate({
        ratingBefore: 1500,
        opponentRating: 2500,
        outcome: 'win',
        isPlacement: true,
      }).ratingUpdate,
    ).toBe(0)
    expect(
      clanRatingUpdate({
        ratingBefore: 1500,
        opponentRating: 2500,
        outcome: 'lose',
        isPlacement: true,
      }).ratingUpdate,
    ).toBe(0)
  })
})

describe('검증 기준 — 점수가 새거나 쌓이지 않는다', () => {
  it('동급 경기 한 건의 증감 합이 0이다 (점수 주입 없음)', () => {
    const win = personalRatingUpdate({
      ratingBefore: 1500,
      opponentRating: 1500,
      outcome: 'win',
    }).ratingUpdate
    const lose = personalRatingUpdate({
      ratingBefore: 1500,
      opponentRating: 1500,
      outcome: 'lose',
    }).ratingUpdate
    expect(win + lose).toBe(0)
  })

  it('클랜도 동급 경기에서 제로섬이다', () => {
    const win = clanRatingUpdate({
      ratingBefore: 1600,
      opponentRating: 1600,
      outcome: 'win',
    }).ratingUpdate
    const lose = clanRatingUpdate({
      ratingBefore: 1600,
      opponentRating: 1600,
      outcome: 'lose',
    }).ratingUpdate
    expect(win + lose).toBe(0)
  })

  it('점수가 음수·NaN·무한대로 가지 않는다', () => {
    for (const rating of [0, 1, 500, 1500, 5000, 20000]) {
      for (const opponent of [0, 500, 1500, 5000, 20000]) {
        for (const outcome of ['win', 'lose'] as const) {
          const result = personalRatingUpdate({ ratingBefore: rating, opponentRating: opponent, outcome })
          expect(Number.isFinite(result.ratingUpdate)).toBe(true)
          expect(Number.isInteger(result.ratingUpdate)).toBe(true)
          expect(Math.max(C.ratingFloor, rating + result.ratingUpdate)).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })
})

describe('보상 감쇠의 방향 — 절대값이 아니라 부호를 본다 (D-069)', () => {
  /**
   * 실제로 확인이 필요했던 지점.
   *
   * 같은 2600 vs 1200 경기라도 **누가 이겼는가**에 따라 결과가 완전히 달라야 한다.
   * 감쇠가 점수차의 절대값으로 걸리면 업셋 보상까지 0이 되어 정책이 무너진다.
   */
  it('강자가 약자를 이기면 거의 못 얻는다', () => {
    const result = personalRatingUpdate({
      ratingBefore: 2600,
      opponentRating: 1200,
      outcome: 'win',
    })
    expect(result.capFactor).toBe(0)
    expect(result.ratingUpdate).toBeLessThanOrEqual(1)
    expect(result.ratingUpdate).toBeGreaterThanOrEqual(0)
  })

  it('약자가 강자를 이기면 크게 얻는다 — 같은 격차인데 감쇠되지 않는다', () => {
    const result = personalRatingUpdate({
      ratingBefore: 1200,
      opponentRating: 2600,
      outcome: 'win',
    })
    expect(result.capFactor).toBe(1)
    expect(result.ratingUpdate).toBeGreaterThanOrEqual(20)
  })

  it('업셋 보상이 강자의 보상보다 압도적으로 크다', () => {
    const underdog = personalRatingUpdate({
      ratingBefore: 1200,
      opponentRating: 2600,
      outcome: 'win',
    }).ratingUpdate
    const favorite = personalRatingUpdate({
      ratingBefore: 2600,
      opponentRating: 1200,
      outcome: 'win',
    }).ratingUpdate
    expect(underdog).toBeGreaterThan(favorite * 10)
  })

  it('클랜도 같은 방향으로 동작한다', () => {
    const favorite = clanRatingUpdate({
      ratingBefore: 2400,
      opponentRating: 1000,
      outcome: 'win',
    })
    const underdog = clanRatingUpdate({
      ratingBefore: 1000,
      opponentRating: 2400,
      outcome: 'win',
    })
    expect(favorite.capFactor).toBe(0)
    expect(underdog.capFactor).toBe(1)
    expect(underdog.ratingUpdate).toBeGreaterThan(favorite.ratingUpdate)
  })
})

describe('승리 증감은 절대 음수가 되지 않는다 (D-069)', () => {
  it('어떤 격차·반복 조건에서도 승리는 0 이상이다', () => {
    for (let rating = 0; rating <= 4000; rating += 250) {
      for (let opponent = 0; opponent <= 4000; opponent += 250) {
        for (const prior of [0, 1, 5, 20]) {
          expect(
            personalRatingUpdate({
              ratingBefore: rating,
              opponentRating: opponent,
              outcome: 'win',
              priorSameOutcome: prior,
            }).ratingUpdate,
            `${rating} vs ${opponent} (반복 ${prior})`,
          ).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('600 낮은 상대에게 300연승해도 시작보다 낮아지지 않는다', () => {
    let rating = 1500
    for (let index = 0; index < 300; index += 1) {
      const update = personalRatingUpdate({
        ratingBefore: rating,
        opponentRating: 900,
        outcome: 'win',
      }).ratingUpdate
      expect(update).toBeGreaterThanOrEqual(0)
      rating += update
    }
    expect(rating).toBeGreaterThan(1500)
  })

  it('기대 승률대로 싸우면 장기 기댓값이 손해가 아니다 (격차 600까지)', () => {
    for (const gap of [0, 200, 400, 600]) {
      const win = personalRatingUpdate({
        ratingBefore: 1500 + gap,
        opponentRating: 1500,
        outcome: 'win',
      })
      const lose = personalRatingUpdate({
        ratingBefore: 1500 + gap,
        opponentRating: 1500,
        outcome: 'lose',
      })
      const expectedValue = win.expected * win.ratingUpdate + (1 - win.expected) * lose.ratingUpdate
      expect(expectedValue, `격차 ${gap}`).toBeGreaterThan(-1)
    }
  })
})

describe('검증 기준 — 업셋과 양학', () => {
  it('약자의 승리가 강자의 승리보다 훨씬 크다', () => {
    const underdog = personalRatingUpdate({
      ratingBefore: 1200,
      opponentRating: 2600,
      outcome: 'win',
    }).ratingUpdate
    const favorite = personalRatingUpdate({
      ratingBefore: 2600,
      opponentRating: 2300,
      outcome: 'win',
    }).ratingUpdate
    expect(underdog).toBeGreaterThan(favorite * 1.5)
  })

  it('강자가 약자에게 지면 크게 잃는다', () => {
    const favoriteLoss = personalRatingUpdate({
      ratingBefore: 2600,
      opponentRating: 1200,
      outcome: 'lose',
    }).ratingUpdate
    const underdogLoss = personalRatingUpdate({
      ratingBefore: 1200,
      opponentRating: 2600,
      outcome: 'lose',
    }).ratingUpdate
    expect(Math.abs(favoriteLoss)).toBeGreaterThan(Math.abs(underdogLoss))
  })

  it('점수차가 크게 벌어진 상대를 이기면 보상이 0이 된다 (양학 차단)', () => {
    expect(rewardCapFactor(C.rewardCapStart)).toBe(1)
    expect(rewardCapFactor(C.rewardCapFull)).toBe(0)
    expect(rewardCapFactor((C.rewardCapStart + C.rewardCapFull) / 2)).toBeCloseTo(0.5, 10)

    const farmWin = personalRatingUpdate({
      ratingBefore: 2700,
      opponentRating: 1400,
      outcome: 'win',
    }).ratingUpdate
    expect(farmWin).toBe(0)
  })

  it('보상 감쇠는 승리에만 걸린다 — 약자에게 지면 제값을 잃는다', () => {
    const loss = personalRatingUpdate({
      ratingBefore: 2700,
      opponentRating: 1400,
      outcome: 'lose',
    }).ratingUpdate
    expect(loss).toBeLessThan(-20)
  })

  it('약체만 반복해서 잡으면 래더가 오르지 않는다', () => {
    let rating = 1500
    for (let index = 0; index < 200; index += 1) {
      rating += personalRatingUpdate({
        ratingBefore: rating,
        opponentRating: 900,
        outcome: 'win',
      }).ratingUpdate
    }
    // 격차가 cap을 넘는 순간 보상이 끊긴다
    expect(rating).toBeLessThan(1500 + C.rewardCapFull)
  })
})

describe('반복 대전 — 멸망전은 벌하지 않는다 (D-070)', () => {
  it('기본값은 꺼져 있다 — 같은 상대와 반복해도 감쇠하지 않는다', () => {
    expect(C.repeatDecay).toBe(1)
    expect(repeatDecayFactor(5)).toBe(1)
    expect(repeatDecayFactor(20, 1500)).toBe(1)
  })

  it('비슷한 상대와의 멸망전 20연승이 새 상대 20연승과 같다', () => {
    const gain = (repeat: boolean): number => {
      let rating = 1600
      for (let index = 0; index < 20; index += 1) {
        rating += personalRatingUpdate({
          ratingBefore: rating,
          opponentRating: 1550,
          outcome: 'win',
          priorSameOutcome: repeat ? index : 0,
        }).ratingUpdate
      }
      return rating - 1600
    }
    expect(gain(true)).toBe(gain(false))
  })

  it('켜더라도 점수 차가 작으면 걸리지 않는다 (멸망전 보호)', () => {
    const enabled = { ...C, repeatDecay: 0.6 }
    // 격차 50 — 정상적인 접전이다
    expect(repeatDecayFactor(10, 50, enabled)).toBe(1)
    // 격차 900 — farming 구간이다
    expect(repeatDecayFactor(1, 900, enabled)).toBeCloseTo(0.6, 10)
    expect(repeatDecayFactor(50, 900, enabled)).toBe(enabled.repeatDecayFloor)
  })

  it('결과가 뒤집히면 감쇠하지 않는다 (새 정보다)', () => {
    expect(repeatDecayFactor(0, 2000, { ...C, repeatDecay: 0.6 })).toBe(1)
  })
})

describe('시즌 시작 — 모두 같은 출발점 (D-064 · 2026-08-22 정책 변경)', () => {
  it('이전 시즌 점수와 무관하게 같은 값에서 시작한다', () => {
    // Season 7 최종: 2400 / 1800 / 1200 → Season 8 시작: 전부 같은 값
    const previous = [2400, 1800, 1200]
    const next = previous.map(() => seasonStartRating())
    expect(new Set(next).size).toBe(1)
    expect(next[0]).toBe(C.seasonBaseline)
  })

  it('전 시즌 1위라고 높은 점수에서 시작하지 않는다', () => {
    expect(seasonStartRating()).toBe(1500)
  })

  it('carryRate 같은 이월 비율이 남아 있지 않다', () => {
    expect(Object.keys(C)).not.toContain('seasonCarryRate')
  })
})

describe('공식 경기 판정 — 한쪽만 본클랜원 3명이어도 공식이다 (D-079, OR 조건)', () => {
  const match = (homeMembers: number, homeMercs: number, awayMembers: number, awayMercs: number) =>
    evaluateEligibility({
      participants: [
        ...squad('A', 'CA', 'win', homeMembers),
        ...Array.from({ length: homeMercs }, (_, index) =>
          detailSide(`AM${index}`, 'CA', 'CX', 'win'),
        ),
        ...squad('B', 'CB', 'lose', awayMembers),
        ...Array.from({ length: awayMercs }, (_, index) =>
          detailSide(`BM${index}`, 'CB', 'CY', 'lose'),
        ),
      ],
    })

  it('클3+용2 vs 클3+용2 → 공식', () => {
    const result = match(3, 2, 3, 2)
    expect(result.official).toBe(true)
    expect(result.status).toBe('official')
    expect(result.completeness).toBe('5v5')
  })

  it('클3+용2 vs 클2+용3 → 공식 (한쪽만 채워도 된다)', () => {
    const result = match(3, 2, 2, 3)
    expect(result.official).toBe(true)
    expect(result.winnerSide?.members).toBe(3)
    expect(result.loserSide?.members).toBe(2)
  })

  it('클3+용2 vs 클1+용4 → 공식', () => {
    expect(match(3, 2, 1, 4).official).toBe(true)
  })

  it('클3+용2 vs 클0+용5 → 공식 (상대가 본클랜원을 한 명도 안 내도)', () => {
    const result = match(3, 2, 0, 5)
    expect(result.official).toBe(true)
    expect(result.loserSide?.members).toBe(0)
    expect(result.loserSide?.leagueClanId).toBe('CB')
  })

  it('클2+용3 vs 클2+용3 → 비공식 경기', () => {
    const result = match(2, 3, 2, 3)
    expect(result.official).toBe(false)
    expect(result.recordable).toBe(true)
    expect(result.status).toBe('reference')
    expect(result.reason).toContain('비공식 경기')
  })

  it('클2+용3 vs 클1+용4 → 비공식 경기', () => {
    expect(match(2, 3, 1, 4).official).toBe(false)
  })

  it('클1+용4 vs 클1+용4 → 비공식 경기', () => {
    expect(match(1, 4, 1, 4).official).toBe(false)
  })

  it('비공식 경기도 경기 자체는 기록 가능하다 (지우지 않는다 — D-080)', () => {
    const result = match(2, 3, 2, 3)
    expect(result.recordable).toBe(true)
    expect(result.assigned).toHaveLength(10)
    expect(result.winnerLeagueClanId).toBe('CA')
  })

  it('한쪽 결과만 확인되면 기록하지 않는다', () => {
    const result = evaluateEligibility({ participants: squad('A', 'CA', 'win', 5) })
    expect(result.recordable).toBe(false)
    expect(result.status).toBe('single_clan')
  })

  it('어느 클랜인지 근거가 없으면 기록하지 않는다 (추측 금지)', () => {
    const result = evaluateEligibility({
      participants: [
        member('A0', null, 'win'),
        member('A1', null, 'win'),
        member('B0', null, 'lose'),
        member('B1', null, 'lose'),
      ],
    })
    expect(result.recordable).toBe(false)
    expect(result.status).toBe('unidentified_side')
  })

  it('확인 수준은 출전자 전원 기준이다 (본클랜원만 세지 않는다)', () => {
    expect(match(1, 4, 1, 4).completeness).toBe('5v5')
    expect(match(3, 0, 3, 1).completeness).toBe('4v3')
  })

  it('근거 출처를 숫자로 남긴다', () => {
    const result = evaluateEligibility({
      participants: [
        member('A0', 'CA', 'win', 1500, ['player_match_list']),
        member('A1', 'CA', 'win', 1500, ['player_match_list', 'match_detail']),
        member('A2', 'CA', 'win', 1500, ['match_detail']),
        ...squad('B', 'CB', 'lose', 3),
      ],
    })
    expect(result.observationParticipantCount).toBe(5)
    expect(result.detailParticipantCount).toBe(2)
  })

  it('확인 수준을 등급으로 남긴다', () => {
    expect(lineupConfidence(5, 5)).toBe('high')
    expect(lineupConfidence(5, 4)).toBe('medium')
    expect(lineupConfidence(4, 3)).toBe('low')
  })
})

describe('클랜 래더 반영률 — 본클랜원 수에 따라 팀마다 다르다 (D-081)', () => {
  it('3명 이상 100% · 2명 70% · 1명 40% · 0명 0%', () => {
    expect(clanWeightForMembers(5)).toBe(1)
    expect(clanWeightForMembers(3)).toBe(1)
    expect(clanWeightForMembers(2)).toBe(0.7)
    expect(clanWeightForMembers(1)).toBe(0.4)
    expect(clanWeightForMembers(0)).toBe(0)
  })

  const rated = (awayMembers: number, awayMercs: number) =>
    rateMatch({
      participants: [
        ...squad('A', 'CA', 'win', 3, 1500),
        detailSide('AM0', 'CA', 'CX', 'win', 1500),
        detailSide('AM1', 'CA', 'CX', 'win', 1500),
        ...squad('B', 'CB', 'lose', awayMembers, 1500),
        ...Array.from({ length: awayMercs }, (_, index) =>
          detailSide(`BM${index}`, 'CB', 'CY', 'lose', 1500),
        ),
      ],
      clanRatings: { CA: 1500, CB: 1500 },
    })

  it('CASE 1 — 클3+용2 vs 클3+용2 → 클랜 100% / 100%', () => {
    const result = rated(3, 2)
    const [winner, loser] = result.clans
    expect(winner?.clanWeight).toBe(1)
    expect(loser?.clanWeight).toBe(1)
    expect(winner?.ratingUpdate).toBe(winner?.rawRatingUpdate)
    expect(loser?.ratingUpdate).toBe(loser?.rawRatingUpdate)
  })

  it('CASE 2 — 상대가 본클랜원 2명이면 그 팀만 70%', () => {
    const result = rated(2, 3)
    const winner = result.clans.find((clan) => clan.leagueClanId === 'CA')!
    const loser = result.clans.find((clan) => clan.leagueClanId === 'CB')!
    expect(winner.clanWeight).toBe(1)
    expect(loser.clanWeight).toBe(0.7)
    expect(loser.ratingUpdate).toBe(Math.round(loser.rawRatingUpdate * 0.7))
    // 이긴 팀은 그대로 100% 받는다 — 상대 구성 때문에 손해 보지 않는다
    expect(winner.ratingUpdate).toBe(winner.rawRatingUpdate)
  })

  it('CASE 3 — 본클랜원 1명이면 40%', () => {
    const loser = rated(1, 4).clans.find((clan) => clan.leagueClanId === 'CB')!
    expect(loser.clanWeight).toBe(0.4)
    expect(Math.abs(loser.ratingUpdate)).toBeLessThan(Math.abs(loser.rawRatingUpdate))
  })

  it('CASE 4 — 본클랜원 0명이면 클랜 래더가 움직이지 않는다', () => {
    const loser = rated(0, 5).clans.find((clan) => clan.leagueClanId === 'CB')!
    expect(loser.clanWeight).toBe(0)
    expect(loser.ratingUpdate).toBe(0)
    expect(loser.ratingAfter).toBe(loser.ratingBefore)
  })

  it('반영률은 승리·패배 양쪽에 같게 적용된다', () => {
    const win = rateMatch({
      participants: [
        ...squad('A', 'CA', 'win', 2, 1500),
        detailSide('AM0', 'CA', 'CX', 'win', 1500),
        detailSide('AM1', 'CA', 'CX', 'win', 1500),
        detailSide('AM2', 'CA', 'CX', 'win', 1500),
        ...squad('B', 'CB', 'lose', 3, 1500),
      ],
      clanRatings: { CA: 1500, CB: 1500 },
    })
    const weighted = win.clans.find((clan) => clan.leagueClanId === 'CA')!
    expect(weighted.clanWeight).toBe(0.7)
    expect(weighted.ratingUpdate).toBeGreaterThan(0)
    expect(weighted.ratingUpdate).toBeLessThan(weighted.rawRatingUpdate)
  })

  it('개인 래더에는 반영률을 적용하지 않는다 (D-082)', () => {
    const result = rated(0, 5)
    const mercenary = result.players.find((player) => player.playerId === 'BM0')!
    const member0 = result.players.find((player) => player.playerId === 'A0')!
    // 본클랜원 0명인 팀이어도 개인 증감은 정상 계산된다
    expect(mercenary.ratingUpdate).not.toBe(0)
    expect(Math.abs(mercenary.ratingUpdate)).toBe(Math.abs(member0.ratingUpdate))
  })
})

describe('비공식 경기 — 공식 통계에 전혀 반영하지 않는다 (D-080)', () => {
  const reference = () =>
    rateMatch({
      participants: [
        ...squad('A', 'CA', 'win', 2, 1600),
        detailSide('AM0', 'CA', 'CX', 'win', 1600),
        detailSide('AM1', 'CA', 'CX', 'win', 1600),
        detailSide('AM2', 'CA', 'CX', 'win', 1600),
        ...squad('B', 'CB', 'lose', 2, 1400),
        detailSide('BM0', 'CB', 'CY', 'lose', 1400),
        detailSide('BM1', 'CB', 'CY', 'lose', 1400),
        detailSide('BM2', 'CB', 'CY', 'lose', 1400),
      ],
      clanRatings: { CA: 1600, CB: 1400 },
    })

  it('CASE 5 — 클2+용3 vs 클2+용3 → 개인·클랜 증감이 하나도 없다', () => {
    const result = reference()
    expect(result.eligibility.official).toBe(false)
    expect(result.players).toHaveLength(0)
    expect(result.clans).toHaveLength(0)
  })

  it('CASE 8 — 참가자와 기록 자체는 남는다 (기록실에 보여야 한다)', () => {
    const result = reference()
    expect(result.eligibility.recordable).toBe(true)
    expect(result.eligibility.assigned).toHaveLength(10)
    const one = result.eligibility.assigned.find((participant) => participant.playerId === 'A0')
    expect(one?.kill).toBe(10)
    expect(one?.death).toBe(8)
  })

  it('CASE 6 — 클2+용3 vs 클1+용4도 비공식 경기다', () => {
    const result = rateMatch({
      participants: [
        ...squad('A', 'CA', 'win', 2),
        detailSide('AM0', 'CA', 'CX', 'win'),
        detailSide('AM1', 'CA', 'CX', 'win'),
        detailSide('AM2', 'CA', 'CX', 'win'),
        ...squad('B', 'CB', 'lose', 1),
        ...Array.from({ length: 4 }, (_, index) =>
          detailSide(`BM${index}`, 'CB', 'CY', 'lose'),
        ),
      ],
      clanRatings: { CA: 1500, CB: 1500 },
    })
    expect(result.eligibility.official).toBe(false)
    expect(result.players).toHaveLength(0)
  })
})

describe('용병 — 개인 기록은 100%, 원소속 클랜은 불변 (D-073 · D-075 · D-082)', () => {
  const caseA = () =>
    rateMatch({
      participants: [
        ...squad('A', 'CA', 'win', 3, 1600),
        detailSide('M-리릭', 'CA', 'CC', 'win', 1700),
        detailSide('M-무소속', 'CA', null, 'win', 1400),
        ...squad('B', 'CB', 'lose', 4, 1500),
        detailSide('M-타클랜', 'CB', 'CD', 'lose', 1550),
      ],
      clanRatings: { CA: 1600, CB: 1500, CC: 2000, CD: 900 },
    })

  it('CASE 7 — 용병 3명이 섞여도 전원 개인 기록을 받는다', () => {
    const result = caseA()
    expect(result.eligibility.official).toBe(true)
    expect(result.players).toHaveLength(10)
    const mercenaries = result.players.filter((player) => player.role === 'mercenary')
    expect(mercenaries).toHaveLength(3)
    expect(mercenaries.every((player) => player.ratingUpdate !== 0)).toBe(true)
  })

  it('CASE 7 — 용병의 원소속 클랜 래더는 변하지 않는다', () => {
    const touched = caseA().clans.map((clan) => clan.leagueClanId).sort()
    expect(touched).toEqual(['CA', 'CB'])
  })

  it('용병은 뛴 팀의 결과를 따른다', () => {
    const lyric = caseA().players.find((player) => player.playerId === 'M-리릭')
    expect(lyric?.leagueClanId).toBe('CA')
    expect(lyric?.rosterLeagueClanId).toBe('CC')
    expect(lyric?.outcome).toBe('win')
    expect(lyric?.ratingUpdate).toBeGreaterThan(0)
  })

  it('확인 수준은 출전자 전원 기준이다', () => {
    expect(caseA().eligibility.completeness).toBe('5v5')
    expect(caseA().confidence).toBe('high')
  })

  it('본클랜원인데 상대 팀 결과로 관측되면 그 경기에서는 용병으로 본다', () => {
    const result = evaluateEligibility({
      participants: [
        ...squad('A', 'CA', 'win', 3),
        member('B-용병', 'CB', 'win'),
        ...squad('B', 'CB', 'lose', 3),
      ],
    })
    const moved = result.assigned.find((participant) => participant.playerId === 'B-용병')
    expect(moved?.leagueClanId).toBe('CA')
    expect(moved?.role).toBe('mercenary')
  })
})

describe('CASE 11 — 멸망전 10연전은 경기마다 순차 계산한다 (D-084)', () => {
  it('앞 경기 결과가 다음 경기의 시작 래더가 된다', () => {
    let clanA = 1500
    let clanB = 1500
    const updates: number[] = []

    for (let index = 0; index < 10; index += 1) {
      const result = rateMatch({
        participants: [
          ...squad('A', 'CA', 'win', 5, clanA),
          ...squad('B', 'CB', 'lose', 5, clanB),
        ],
        clanRatings: { CA: clanA, CB: clanB },
        priorSameOutcome: index,
      })
      expect(result.eligibility.official).toBe(true)
      const winner = result.clans.find((clan) => clan.leagueClanId === 'CA')!
      const loser = result.clans.find((clan) => clan.leagueClanId === 'CB')!
      updates.push(winner.ratingUpdate)
      clanA = winner.ratingAfter
      clanB = loser.ratingAfter
    }

    // 10경기 전부 기록된다 — 반복이라고 빼거나 0점 처리하지 않는다
    expect(updates).toHaveLength(10)
    expect(updates.every((value) => value > 0)).toBe(true)
    // 격차가 벌어질수록 보상이 줄어든다 (같은 값을 반복하지 않는다)
    expect(updates[9]!).toBeLessThan(updates[0]!)
    expect(clanA).toBeGreaterThan(1500)
    expect(clanB).toBeLessThan(1500)
  })
})

describe('개인 점수는 확인된 선수에게만 (D-067)', () => {
  it('3v3 경기에서 개인 결과는 6건뿐이다 — 없는 참가자를 만들지 않는다', () => {
    const result = rateMatch({
      participants: [...squad('A', 'CA', 'win', 3), ...squad('B', 'CB', 'lose', 3)],
      clanRatings: { CA: 1500, CB: 1500 },
    })
    expect(result.eligibility.official).toBe(true)
    expect(result.players).toHaveLength(6)
    expect(result.clans).toHaveLength(2)
  })

  it('비공식 경기는 증감을 하나도 만들지 않는다', () => {
    const result = rateMatch({
      participants: [
        ...squad('A', 'CA', 'win', 2),
        detailSide('AM0', 'CA', 'CX', 'win'),
        ...squad('B', 'CB', 'lose', 2),
        detailSide('BM0', 'CB', 'CY', 'lose'),
      ],
      clanRatings: { CA: 1500, CB: 1500 },
    })
    expect(result.players).toHaveLength(0)
    expect(result.clans).toHaveLength(0)
  })

  it('상대 평균은 **확인된 상대 선수들**의 래더 평균이다', () => {
    const result = rateMatch({
      participants: [
        ...squad('A', 'CA', 'win', 3, 1500),
        ...squad('B', 'CB', 'lose', 3, 1800),
      ],
      clanRatings: { CA: 1500, CB: 1800 },
    })
    expect(result.players.find((player) => player.playerId === 'A0')?.opponentAvgRating).toBe(1800)
  })

  it('formulaVersion이 개인·클랜 각각 남는다', () => {
    const result = rateMatch({
      participants: [...squad('A', 'CA', 'win', 3), ...squad('B', 'CB', 'lose', 3)],
      clanRatings: { CA: 1500, CB: 1500 },
    })
    expect(result.players[0]?.formulaVersion).toBe(PERSONAL_FORMULA_VERSION)
    expect(result.clans[0]?.formulaVersion).toBe(CLAN_FORMULA_VERSION)
  })
})

describe('라인업 전력 (D-064)', () => {
  it('확인 인원이 모자라면 라인업을 반영하지 않는다', () => {
    const result = rateMatch({
      participants: [...squad('A', 'CA', 'win', 3), ...squad('B', 'CB', 'lose', 3)],
      clanRatings: { CA: 1500, CB: 1500 },
    })
    expect(result.clans.every((clan) => !clan.lineupBlended)).toBe(true)
    expect(result.confidence).toBe('low')
  })

  it('양측 4명 이상 확인되면 라인업을 섞는다', () => {
    const result = rateMatch({
      participants: [
        ...squad('A', 'CA', 'win', 4, 1900),
        ...squad('B', 'CB', 'lose', 4, 1300),
      ],
      clanRatings: { CA: 1500, CB: 1500 },
    })
    expect(result.clans.every((clan) => clan.lineupBlended)).toBe(true)
    expect(result.confidence).toBe('medium')
  })

  it('확인되지 않은 선수의 래더를 추정해 채우지 않는다', () => {
    const strength = lineupStrength(squad('A', 'CA', 'win', 3, 2000))
    expect(strength.confirmed).toBe(3)
    expect(strength.average).toBe(2000)
    expect(strength.usable).toBe(false)
  })
})

describe('division 중립 (D-059)', () => {
  it('공식 입력에 division이 없다', () => {
    expect(Object.keys(C)).not.toContain('division')
    const input = {
      ratingBefore: 1500,
      opponentRating: 1500,
      outcome: 'win' as const,
    }
    // 같은 입력이면 소속이 무엇이든 같은 값이다 (넣을 자리가 아예 없다)
    expect(personalRatingUpdate(input).ratingUpdate).toBe(personalRatingUpdate(input).ratingUpdate)
  })
})

describe('결정적 replay', () => {
  it('같은 경기를 다시 계산해도 같은 값이 나온다', () => {
    const input = {
      participants: [
        ...squad('A', 'CA', 'win', 4, 1700),
        ...squad('B', 'CB', 'lose', 4, 1450),
      ],
      clanRatings: { CA: 1650, CB: 1480 },
      priorSameOutcome: 2,
    }
    expect(JSON.stringify(rateMatch(input))).toBe(JSON.stringify(rateMatch(input)))
  })

  it('참가자 순서가 달라도 결과가 같다', () => {
    const players = [...squad('A', 'CA', 'win', 3, 1600), ...squad('B', 'CB', 'lose', 3, 1400)]
    const forward = rateMatch({ participants: players, clanRatings: { CA: 1600, CB: 1400 } })
    const reversed = rateMatch({
      participants: [...players].reverse(),
      clanRatings: { CA: 1600, CB: 1400 },
    })
    const key = (result: typeof forward) =>
      result.players
        .map((player) => `${player.playerId}:${player.ratingUpdate}`)
        .sort()
        .join(',')
    expect(key(forward)).toBe(key(reversed))
  })
})

/**
 * 정책 확정판 케이스 A~E (2026-08-22).
 *
 * 두 단계를 **분리해서** 확인한다.
 *   1단계  공식 경기인가 — `home >= 3 OR away >= 3` 하나로만 판단한다
 *   2단계  공식이면, 팀마다 **자기 본클랜원 수**로 클랜 증감을 가중한다 (100/70/40/0)
 *
 * 두 단계가 섞이면 "3+2 vs 0+5"가 비공식으로 떨어지거나,
 * 반대로 가중치가 인정 조건처럼 쓰인다.
 */
describe('정책 확정판 — 공식 판정과 클랜 가중치는 별개 단계다', () => {
  /** 홈 `클{m}+용{n}` vs 원정 `클{m}+용{n}` */
  const build = (
    homeMembers: number,
    homeMercs: number,
    awayMembers: number,
    awayMercs: number,
    homeRating = 1500,
    awayRating = 1500,
  ) =>
    rateMatch({
      participants: [
        ...squad('A', 'CA', 'win', homeMembers, homeRating),
        ...Array.from({ length: homeMercs }, (_, index) =>
          detailSide(`AM${index}`, 'CA', 'CX', 'win', homeRating),
        ),
        ...squad('B', 'CB', 'lose', awayMembers, awayRating),
        ...Array.from({ length: awayMercs }, (_, index) =>
          detailSide(`BM${index}`, 'CB', 'CY', 'lose', awayRating),
        ),
      ],
      clanRatings: { CA: 1500, CB: 1500 },
    })

  const clanOf = (result: ReturnType<typeof rateMatch>, id: string) =>
    result.clans.find((clan) => clan.leagueClanId === id)!

  it('CASE A — 클1+용4 vs 클5 → 공식. 40% / 100%', () => {
    const result = build(1, 4, 5, 0)
    expect(result.eligibility.official, '한쪽이 3명 이상이면 공식이다').toBe(true)

    const home = clanOf(result, 'CA')
    const away = clanOf(result, 'CB')
    expect(home.clanWeight).toBe(0.4)
    expect(away.clanWeight).toBe(1)
    // 가중은 **원래 증감에 곱한 값**이다. 다른 공식을 쓰지 않는다
    expect(home.ratingUpdate).toBe(Math.round(home.rawRatingUpdate * 0.4))
    expect(away.ratingUpdate).toBe(away.rawRatingUpdate)

    // 개인은 전원 100%. 용병도 줄이지 않는다
    expect(result.players).toHaveLength(10)
    expect(result.players.every((player) => player.ratingUpdate !== 0)).toBe(true)
    const mercenaries = result.players.filter((player) => player.role === 'mercenary')
    expect(mercenaries).toHaveLength(4)
    const member0 = result.players.find((player) => player.playerId === 'A0')!
    const merc0 = result.players.find((player) => player.playerId === 'AM0')!
    expect(merc0.ratingUpdate, '같은 팀·같은 점수면 용병도 같은 증감이다').toBe(
      member0.ratingUpdate,
    )
  })

  it('CASE A — 져도 같은 가중치를 쓴다 (이길 때만 깎지 않는다)', () => {
    // 홈이 지는 배치: 승패만 뒤집는다
    const result = rateMatch({
      participants: [
        ...squad('A', 'CA', 'lose', 1),
        ...Array.from({ length: 4 }, (_, index) =>
          detailSide(`AM${index}`, 'CA', 'CX', 'lose'),
        ),
        ...squad('B', 'CB', 'win', 5),
      ],
      clanRatings: { CA: 1500, CB: 1500 },
    })
    const home = clanOf(result, 'CA')
    expect(home.clanWeight).toBe(0.4)
    expect(home.rawRatingUpdate).toBeLessThan(0)
    expect(home.ratingUpdate).toBe(Math.round(home.rawRatingUpdate * 0.4))
  })

  it('CASE A — 합계가 0이 아니어도 강제로 맞추지 않는다 (비제로섬 허용)', () => {
    const result = build(1, 4, 5, 0)
    const total = clanOf(result, 'CA').ratingUpdate + clanOf(result, 'CB').ratingUpdate
    expect(total).not.toBe(0)
  })

  it('CASE B — 클2+용3 vs 클5 → 공식. 70% / 100%', () => {
    const result = build(2, 3, 5, 0)
    expect(result.eligibility.official).toBe(true)
    expect(clanOf(result, 'CA').clanWeight).toBe(0.7)
    expect(clanOf(result, 'CB').clanWeight).toBe(1)
  })

  it('CASE C — 클2+용3 vs 클2+용3 → 비공식. 클랜·개인 증감 모두 없음', () => {
    const result = build(2, 3, 2, 3)
    expect(result.eligibility.official).toBe(false)
    expect(result.clans).toHaveLength(0)
    expect(result.players).toHaveLength(0)
    // 경기 자체는 기록 가능하다. 저장은 worker가 한다
    expect(result.eligibility.recordable).toBe(true)
  })

  it('CASE D — 무소속끼리도 계산은 똑같다 (래더 엔진은 category를 모른다)', () => {
    const result = build(3, 2, 3, 2)
    expect(result.eligibility.official).toBe(true)
    expect(clanOf(result, 'CA').clanWeight).toBe(1)
    expect(clanOf(result, 'CB').clanWeight).toBe(1)
    expect(result.players).toHaveLength(10)
    // 무소속 전용 K값·전용 공식은 없다
    expect(clanOf(result, 'CA').ratingUpdate).toBe(clanOf(result, 'CA').rawRatingUpdate)
  })

  it('CASE E — 1부 클1+용4 vs 무소속 클5 → 공식. 40% / 100%, 개인은 양쪽 다 계산', () => {
    const result = build(1, 4, 5, 0)
    expect(result.eligibility.official).toBe(true)
    expect(clanOf(result, 'CA').clanWeight).toBe(0.4)
    expect(clanOf(result, 'CB').clanWeight).toBe(1)
    // 무소속이라고 개인 계산을 생략하지 않는다 — 전력차 계산에 필요하다 (D-102)
    expect(result.players.filter((player) => player.playerId.startsWith('B'))).toHaveLength(5)
  })

  it('실제 실력차가 클랜 증감에 반영된다 (무소속 선수를 1500 고정으로 두면 안 되는 이유)', () => {
    const even = build(3, 2, 3, 2, 1500, 1500)
    const strongHome = build(3, 2, 3, 2, 1900, 1300)
    // 라인업 전력이 실제로 섞였는지부터 확인한다
    expect(clanOf(strongHome, 'CA').lineupBlended, '양측 4명 이상 확인되면 라인업을 섞는다').toBe(true)
    // 강팀이 이기면 덜 오른다 — 참가 선수의 실제 점수를 알아야 나오는 차이다
    expect(clanOf(strongHome, 'CA').ratingUpdate).toBeLessThan(clanOf(even, 'CA').ratingUpdate)
  })
})
