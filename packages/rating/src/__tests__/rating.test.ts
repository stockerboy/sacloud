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

/** 용병 — 등록 클랜이 다른 곳이거나 없다. 팀은 **승패로** 정해진다 */
function mercenary(
  playerId: string,
  homeClanId: string | null,
  outcome: 'win' | 'lose',
  ratingBefore = 1500,
): ConfirmedParticipant {
  return member(playerId, homeClanId, outcome, ratingBefore)
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

describe('경기 인정 기준 — 양 팀 **본클랜원** 3명 이상 (D-057 · D-071)', () => {
  it('본클랜원 3v3이면 인정한다', () => {
    const result = evaluateEligibility({
      participants: [...squad('A', 'CA', 'win', 3), ...squad('B', 'CB', 'lose', 3)],
    })
    expect(result.eligible).toBe(true)
    expect(result.completeness).toBe('3v3')
  })

  it('본클랜원 4v3도 인정한다', () => {
    const result = evaluateEligibility({
      participants: [...squad('A', 'CA', 'win', 4), ...squad('B', 'CB', 'lose', 3)],
    })
    expect(result.eligible).toBe(true)
    expect(result.completeness).toBe('4v3')
  })

  it('본클랜원 5v2는 인정하지 않는다', () => {
    const result = evaluateEligibility({
      participants: [...squad('A', 'CA', 'win', 5), ...squad('B', 'CB', 'lose', 2)],
    })
    expect(result.eligible).toBe(false)
    expect(result.status).toBe('insufficient_members')
  })

  it('한쪽 클랜만 확인되면 인정하지 않는다', () => {
    const result = evaluateEligibility({ participants: squad('A', 'CA', 'win', 5) })
    expect(result.status).toBe('single_clan')
  })

  it('본클랜원 조건을 채운 클랜이 셋이면 인정하지 않는다', () => {
    const result = evaluateEligibility({
      participants: [
        ...squad('A', 'CA', 'win', 3),
        ...squad('B', 'CB', 'lose', 3),
        ...squad('X', 'CC', 'lose', 3),
      ],
    })
    expect(result.status).toBe('too_many_clans')
  })

  it('본클랜원 승패가 정확히 반반이면 팀을 판정하지 않는다', () => {
    const result = evaluateEligibility({
      participants: [
        ...squad('A', 'CA', 'win', 2),
        member('A2', 'CA', 'lose'),
        member('A3', 'CA', 'lose'),
        ...squad('B', 'CB', 'lose', 3),
      ],
    })
    expect(result.status).toBe('inconsistent_outcome')
  })

  it('다수와 다른 결과인 본클랜원 1명 때문에 경기를 버리지 않는다', () => {
    // CA 본클랜원 3승 1패 → CA는 승리 팀, 나머지 1명은 상대 팀 용병으로 본다
    const result = evaluateEligibility({
      participants: [
        ...squad('A', 'CA', 'win', 3),
        member('A3', 'CA', 'lose'),
        ...squad('B', 'CB', 'lose', 3),
      ],
    })
    expect(result.eligible).toBe(true)
    expect(result.winnerSide?.members).toBe(3)
    const moved = result.assigned.find((participant) => participant.playerId === 'A3')
    expect(moved?.leagueClanId).toBe('CB')
    expect(moved?.role).toBe('mercenary')
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

describe('용병 — 3명 조건에는 못 쓰지만 개인 기록은 받는다 (D-071 ~ D-076)', () => {
  /** CASE A: 본클랜원 3+용병 2 vs 본클랜원 4+용병 1 */
  const caseA = () =>
    rateMatch({
      participants: [
        ...squad('A', 'CA', 'win', 3, 1600),
        mercenary('M-리릭', 'CC', 'win', 1700),
        mercenary('M-무소속', null, 'win', 1400),
        ...squad('B', 'CB', 'lose', 4, 1500),
        mercenary('M-타클랜', 'CD', 'lose', 1550),
      ],
      clanRatings: { CA: 1600, CB: 1500, CC: 2000, CD: 900 },
    })

  it('CASE A — 본클랜원 3명씩이면 용병이 섞여도 공식전이다', () => {
    const result = caseA()
    expect(result.eligibility.eligible).toBe(true)
    expect(result.eligibility.winnerSide?.members).toBe(3)
    expect(result.eligibility.winnerSide?.mercenaries).toBe(2)
    expect(result.eligibility.loserSide?.members).toBe(4)
    expect(result.eligibility.loserSide?.mercenaries).toBe(1)
  })

  it('CASE A — 확인 수준은 출전자 전원 기준이다 (본클랜원만 세지 않는다)', () => {
    expect(caseA().eligibility.completeness).toBe('5v5')
    expect(caseA().confidence).toBe('high')
  })

  it('CASE A — 10명 전원이 개인 기록을 받는다 (용병 포함)', () => {
    const result = caseA()
    expect(result.players).toHaveLength(10)
    const mercenaries = result.players.filter((player) => player.role === 'mercenary')
    expect(mercenaries).toHaveLength(3)
    expect(mercenaries.every((player) => player.ratingUpdate !== 0)).toBe(true)
  })

  it('CASE A — 용병의 원소속 클랜 래더는 변하지 않는다', () => {
    const result = caseA()
    const touched = result.clans.map((clan) => clan.leagueClanId).sort()
    expect(touched).toEqual(['CA', 'CB'])
  })

  it('CASE A — 용병은 뛴 팀의 결과를 따른다', () => {
    const result = caseA()
    const lyric = result.players.find((player) => player.playerId === 'M-리릭')
    expect(lyric?.leagueClanId).toBe('CA')
    expect(lyric?.rosterLeagueClanId).toBe('CC')
    expect(lyric?.outcome).toBe('win')
    expect(lyric?.ratingUpdate).toBeGreaterThan(0)
  })

  it('CASE B — 본클랜원 2 + 용병 3 은 인정하지 않는다', () => {
    const result = rateMatch({
      participants: [
        ...squad('A', 'CA', 'win', 2),
        mercenary('M1', 'CC', 'win'),
        mercenary('M2', 'CD', 'win'),
        mercenary('M3', null, 'win'),
        ...squad('B', 'CB', 'lose', 5),
      ],
      clanRatings: { CA: 1500, CB: 1500 },
    })
    expect(result.eligibility.eligible).toBe(false)
    expect(result.eligibility.status).toBe('insufficient_members')
    expect(result.players).toHaveLength(0)
    expect(result.clans).toHaveLength(0)
  })

  it('CASE C — 확인되지 않은 선수는 만들지 않는다 (3v3만 기록)', () => {
    const result = rateMatch({
      participants: [...squad('A', 'CA', 'win', 3), ...squad('B', 'CB', 'lose', 3)],
      clanRatings: { CA: 1500, CB: 1500 },
    })
    expect(result.eligibility.eligible).toBe(true)
    expect(result.players).toHaveLength(6)
    expect(result.eligibility.completeness).toBe('3v3')
  })

  it('CASE D — 다른 클랜 소속이 용병으로 뛰면 원소속은 무관하다', () => {
    const result = rateMatch({
      participants: [
        ...squad('A', 'CA', 'win', 3),
        mercenary('X', 'CC', 'win', 1500),
        ...squad('B', 'CB', 'lose', 3),
      ],
      clanRatings: { CA: 1500, CB: 1500, CC: 2500 },
    })
    const x = result.players.find((player) => player.playerId === 'X')
    expect(x?.role).toBe('mercenary')
    expect(x?.leagueClanId).toBe('CA')
    expect(x?.outcome).toBe('win')
    expect(result.clans.some((clan) => clan.leagueClanId === 'CC')).toBe(false)
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
