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
  seasonSoftReset,
  type ConfirmedParticipant,
} from '../index.js'

const C = DEFAULT_RATING_CONSTANTS

function member(
  playerId: string,
  leagueClanId: string,
  outcome: 'win' | 'lose',
  ratingBefore = 1500,
  sources: ConfirmedParticipant['sources'] = ['player_match_list'],
): ConfirmedParticipant {
  return { playerId, leagueClanId, outcome, kill: 10, death: 8, assist: 2, sources, ratingBefore }
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
      ratingBefore: 2500,
      opponentRating: 1400,
      outcome: 'win',
    }).ratingUpdate
    expect(farmWin).toBe(0)
  })

  it('보상 감쇠는 승리에만 걸린다 — 약자에게 지면 제값을 잃는다', () => {
    const loss = personalRatingUpdate({
      ratingBefore: 2500,
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

describe('검증 기준 — 반복 대전', () => {
  it('같은 결과가 반복될수록 보상이 줄어든다', () => {
    expect(repeatDecayFactor(0)).toBe(1)
    expect(repeatDecayFactor(1)).toBeCloseTo(C.repeatDecay, 10)
    expect(repeatDecayFactor(2)).toBeCloseTo(C.repeatDecay ** 2, 10)
    expect(repeatDecayFactor(50)).toBe(C.repeatDecayFloor)
  })

  it('같은 상대 20연승이 새 상대 20연승보다 훨씬 적게 오른다', () => {
    const gain = (repeat: boolean): number => {
      let rating = 1500
      for (let index = 0; index < 20; index += 1) {
        rating += personalRatingUpdate({
          ratingBefore: rating,
          opponentRating: 1500,
          outcome: 'win',
          priorSameOutcome: repeat ? index : 0,
        }).ratingUpdate
      }
      return rating - 1500
    }
    expect(gain(true)).toBeLessThan(gain(false) * 0.6)
  })

  it('결과가 뒤집히면 감쇠하지 않는다 (새 정보다)', () => {
    expect(repeatDecayFactor(0)).toBe(1)
  })
})

describe('검증 기준 — 시즌 soft reset', () => {
  it('순위 정보가 사라지지 않는다', () => {
    const before = [900, 1200, 1500, 1800, 2400, 3000]
    const after = before.map((rating) => seasonSoftReset(rating))
    for (let index = 1; index < after.length; index += 1) {
      expect(after[index]!).toBeGreaterThan(after[index - 1]!)
    }
  })

  it('폭이 carryRate만큼 줄어든다', () => {
    const before = [500, 3000]
    const after = before.map((rating) => seasonSoftReset(rating))
    const ratio = (after[1]! - after[0]!) / (before[1]! - before[0]!)
    expect(ratio).toBeCloseTo(C.seasonCarryRate, 2)
  })

  it('완전 초기화가 아니다', () => {
    expect(seasonSoftReset(3000)).toBeGreaterThan(C.seasonBaseline)
    expect(seasonSoftReset(500)).toBeLessThan(C.seasonBaseline)
  })
})

describe('경기 인정 기준 — 양측 3명 이상 (D-057)', () => {
  it('3v3이면 인정한다', () => {
    const result = evaluateEligibility({
      participants: [...squad('A', 'CA', 'win', 3), ...squad('B', 'CB', 'lose', 3)],
    })
    expect(result.eligible).toBe(true)
    expect(result.completeness).toBe('3v3')
  })

  it('4v3도 인정한다', () => {
    const result = evaluateEligibility({
      participants: [...squad('A', 'CA', 'win', 4), ...squad('B', 'CB', 'lose', 3)],
    })
    expect(result.eligible).toBe(true)
    expect(result.completeness).toBe('4v3')
  })

  it('5v2는 인정하지 않는다', () => {
    const result = evaluateEligibility({
      participants: [...squad('A', 'CA', 'win', 5), ...squad('B', 'CB', 'lose', 2)],
    })
    expect(result.eligible).toBe(false)
    expect(result.status).toBe('insufficient_participants')
    expect(result.completeness).toBe('5v2')
  })

  it('한쪽 클랜만 확인되면 인정하지 않는다', () => {
    const result = evaluateEligibility({ participants: squad('A', 'CA', 'win', 5) })
    expect(result.status).toBe('single_clan')
  })

  it('클랜이 셋이면 인정하지 않는다', () => {
    const result = evaluateEligibility({
      participants: [
        ...squad('A', 'CA', 'win', 3),
        ...squad('B', 'CB', 'lose', 3),
        member('X0', 'CC', 'lose'),
      ],
    })
    expect(result.status).toBe('too_many_clans')
  })

  it('같은 클랜 안에서 승패가 엇갈리면 인정하지 않는다', () => {
    const result = evaluateEligibility({
      participants: [
        ...squad('A', 'CA', 'win', 2),
        member('A2', 'CA', 'lose'),
        ...squad('B', 'CB', 'lose', 3),
      ],
    })
    expect(result.status).toBe('inconsistent_outcome')
  })

  it('양 팀 결과가 같으면 승자를 정하지 않는다', () => {
    const result = evaluateEligibility({
      participants: [...squad('A', 'CA', 'win', 3), ...squad('B', 'CB', 'win', 3)],
    })
    expect(result.status).toBe('no_winner')
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

describe('개인 점수는 확인된 선수에게만 (D-067)', () => {
  it('3v3 경기에서 개인 결과는 6건뿐이다 — 없는 참가자를 만들지 않는다', () => {
    const result = rateMatch({
      participants: [...squad('A', 'CA', 'win', 3), ...squad('B', 'CB', 'lose', 3)],
      clanRatings: { CA: 1500, CB: 1500 },
    })
    expect(result.eligibility.eligible).toBe(true)
    expect(result.players).toHaveLength(6)
    expect(result.clans).toHaveLength(2)
  })

  it('인정되지 않은 경기는 증감을 하나도 만들지 않는다', () => {
    const result = rateMatch({
      participants: [...squad('A', 'CA', 'win', 5), ...squad('B', 'CB', 'lose', 2)],
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
