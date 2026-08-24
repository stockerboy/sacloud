/**
 * 최종안 회귀 테스트 (D-142).
 *
 * 여기서 지키는 것은 **정책**이지 특정 숫자가 아니다.
 * 값이 조금 변하는 것은 괜찮지만, 아래 성질이 깨지면 설계가 뒤집힌 것이다.
 */
import { describe, expect, it } from 'vitest'
import {
  CLAN_DECAY_TIERS,
  FINAL_COMPOSITION_CAP,
  FINAL_COMPOSITION_WINDOW,
  FINAL_DISPLAY_SCALE,
  FINAL_PERFORMANCE_WEIGHT,
  FINAL_WIN_GAIN_CUTOFF,
  PENALTY_RECOVERY_PER_GAME,
  clanDailyPenalty,
  decayTierFor,
  displayAfterIdle,
  finalDisplay,
  gamesToClearPenalty,
  runSchedule,
  runScheduleAverage,
  type ScheduleProfile,
} from '../final.js'
import { CANDIDATE1_PERSONAL, compositionScore, setCompositionParams } from '../engine.js'

const FINAL = {
  ...CANDIDATE1_PERSONAL,
  performanceWeight: FINAL_PERFORMANCE_WEIGHT,
  displayScale: 1,
  winGainCutoff: FINAL_WIN_GAIN_CUTOFF,
}

const profile = (games: number, winRate: number, min: number, max: number): ScheduleProfile => ({
  label: '', games, winRate, opponentMin: min, opponentMax: max, performance: 0, note: '',
})
/**
 * 경로 여러 개의 평균을 쓴다.
 * Elo 는 평형점 주위를 랜덤워크하므로 경로 하나로 판정하면 안 된다 (하네스 결함 #7).
 */
const score = (games: number, winRate: number, min: number, max: number): number =>
  runScheduleAverage(profile(games, winRate, min, max), FINAL, FINAL_DISPLAY_SCALE, 30).display

describe('최종 상수', () => {
  it('퍼포먼스는 0 이다 — KD·MVP 는 점수에 들어가지 않는다', () => {
    expect(FINAL_PERFORMANCE_WEIGHT).toBe(0)
  })

  it('표시 점수는 3000 에서 시작한다', () => {
    expect(finalDisplay(3000, 500)).toBe(3000)
  })

  it('신뢰도가 낮으면 표시 점수가 억제된다', () => {
    expect(finalDisplay(3400, 40)).toBeLessThan(finalDisplay(3400, 500))
  })
})

describe('상대 강도 우선 — 승률만으로는 못 올라간다', () => {
  it('약팀만 잡은 고승률이 강팀 상대 준수한 성적을 압도하지 못한다', () => {
    // 3000~3200 상대 90% (300판) vs 3400~3600 상대 60% (300판)
    expect(score(300, 0.6, 3400, 3600)).toBeGreaterThan(score(300, 0.9, 3000, 3200))
  })

  it('완벽한 양학(600판 전승)조차 5000 을 넘지 못한다', () => {
    // 차단선 때문에 양학의 상한은 "내가 잡는 팀 중 가장 센 팀 + 382" 로 고정된다.
    // 600판 전승이라는 비현실적 조건에서도 이 선을 넘지 못한다.
    expect(score(600, 1, 3000, 3200)).toBeLessThan(5000)
  })

  it('역대급 outlier 는 완벽한 양학보다 확실히 높다', () => {
    expect(score(700, 0.82, 3350, 3650)).toBeGreaterThan(score(600, 1, 3000, 3200))
  })

  it('KD 가 아무리 높아도 저승률은 상위권이 아니다 — 퍼포먼스가 0이므로 KD는 무관하다', () => {
    const kdMonster = { ...profile(500, 0.45, 3000, 3150), performance: 1 }
    const solid = profile(500, 0.57, 3250, 3450)
    expect(runScheduleAverage(solid, FINAL, FINAL_DISPLAY_SCALE, 30).display).toBeGreaterThan(
      runScheduleAverage(kdMonster, FINAL, FINAL_DISPLAY_SCALE, 30).display,
    )
  })
})

describe('약팀 사냥 차단선', () => {
  it('정직한 일정의 점수는 차단선이 있어도 없어도 같다', () => {
    const noCutoff = { ...FINAL, winGainCutoff: undefined }
    for (const [g, w, a, b] of [[300, 0.55, 3250, 3450], [300, 0.5, 3400, 3600], [500, 0.55, 3100, 3300]] as const) {
      const withCut = runScheduleAverage(profile(g, w, a, b), FINAL, FINAL_DISPLAY_SCALE, 30).display
      const without = runScheduleAverage(profile(g, w, a, b), noCutoff, FINAL_DISPLAY_SCALE, 30).display
      expect(withCut).toBeCloseTo(without, 6)
    }
  })

  it('양학 점수는 차단선이 있으면 반드시 낮아진다', () => {
    const noCutoff = { ...FINAL, winGainCutoff: undefined }
    const farm = profile(600, 0.98, 3000, 3200)
    expect(runScheduleAverage(farm, FINAL, FINAL_DISPLAY_SCALE, 30).display).toBeLessThan(
      runScheduleAverage(farm, noCutoff, FINAL_DISPLAY_SCALE, 30).display,
    )
  })
})

describe('판수 · 신규', () => {
  it('1000판 저승률은 150판 준수한 성적을 못 이긴다', () => {
    expect(score(150, 0.6, 3050, 3200)).toBeGreaterThan(score(1000, 0.41, 3000, 3100))
  })

  it('40판 반짝은 500판 검증된 강자를 못 제친다', () => {
    expect(score(500, 0.55, 3100, 3300)).toBeGreaterThan(score(40, 0.75, 3050, 3200))
  })

  it('판수를 늘려도 승률이 5할이면 기준점 근처에 머문다', () => {
    expect(Math.abs(score(1000, 0.5, 3000, 3100) - 3000)).toBeLessThan(500)
  })
})

describe('역사적 outlier — 5000 에 하드캡이 없다', () => {
  it('역대급 조건이면 5000 을 넘는다', () => {
    expect(score(700, 0.82, 3350, 3650)).toBeGreaterThan(5000)
  })

  it('평범한 상위권은 5000 에 못 간다', () => {
    expect(score(300, 0.58, 3100, 3300)).toBeLessThan(5000)
    expect(score(500, 0.55, 3100, 3300)).toBeLessThan(5000)
  })
})

describe('미참여 감점', () => {
  it('4000 미만은 아무리 쉬어도 깎이지 않는다', () => {
    expect(displayAfterIdle(3900, 90)).toBe(3900)
    expect(decayTierFor(3900)).toBeNull()
  })

  it('1주 휴식은 거의 처벌하지 않는다', () => {
    expect(4800 - displayAfterIdle(4800, 7)).toBeLessThan(15)
  })

  it('4800 이 한 달 넘게 잠수하면 100점 이상 잃는다', () => {
    expect(4800 - displayAfterIdle(4800, 35)).toBeGreaterThan(100)
  })

  it('높은 점수일수록 더 빨리 잃는다', () => {
    expect(4900 - displayAfterIdle(4900, 28)).toBeGreaterThan(4200 - displayAfterIdle(4200, 28))
  })

  it('감점만으로 3000 아래로 내려가지 않는다', () => {
    expect(displayAfterIdle(4900, 3650)).toBeGreaterThanOrEqual(3000)
  })

  it('1판 던지기로 초기화되지 않는다 — 회복에 여러 경기가 필요하다', () => {
    const penalty = 4800 - displayAfterIdle(4800, 35)
    expect(gamesToClearPenalty(penalty)).toBeGreaterThan(10)
    expect(PENALTY_RECOVERY_PER_GAME).toBeLessThan(20)
  })

  it('클랜은 개인과 다른 표를 쓰고 7일 전에는 깎이지 않는다', () => {
    expect(clanDailyPenalty(6)).toBe(0)
    expect(clanDailyPenalty(10)).toBeGreaterThan(0)
    expect(clanDailyPenalty(21)).toBeGreaterThan(clanDailyPenalty(10))
    expect(CLAN_DECAY_TIERS.length).toBeGreaterThan(0)
  })
})

describe('클랜 구성 보정', () => {
  it('클랜원 1명이어도 0점 처리하지 않는다 — 보정만 0이다', () => {
    setCompositionParams(FINAL_COMPOSITION_CAP, FINAL_COMPOSITION_WINDOW)
    expect(compositionScore(1)).toBe(0)
  })

  it('클랜원이 많을수록 보정이 크고 상한을 넘지 않는다', () => {
    setCompositionParams(FINAL_COMPOSITION_CAP, FINAL_COMPOSITION_WINDOW)
    expect(compositionScore(5)).toBe(FINAL_COMPOSITION_CAP)
    expect(compositionScore(3)).toBeGreaterThan(compositionScore(2))
    expect(compositionScore(9)).toBe(FINAL_COMPOSITION_CAP)
  })

  it('구성 보정은 실력 차이를 뒤집을 만큼 크지 않다', () => {
    setCompositionParams(FINAL_COMPOSITION_CAP, FINAL_COMPOSITION_WINDOW)
    // 클5(상한) 과 클1(0) 의 차이보다 큰 Elo 격차는 절대 뒤집히지 않는다
    expect(compositionScore(5) - compositionScore(1)).toBeLessThanOrEqual(FINAL_COMPOSITION_CAP)
  })
})

describe('결정적 재현', () => {
  it('같은 입력은 항상 같은 결과를 준다', () => {
    expect(score(300, 0.58, 3100, 3300)).toBe(score(300, 0.58, 3100, 3300))
    expect(runSchedule(profile(300, 0.58, 3100, 3300), FINAL, FINAL_DISPLAY_SCALE, 30, 3).display)
      .toBe(runSchedule(profile(300, 0.58, 3100, 3300), FINAL, FINAL_DISPLAY_SCALE, 30, 3).display)
  })
})
