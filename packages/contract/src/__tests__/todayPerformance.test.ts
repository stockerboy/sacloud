/**
 * `오늘 퍼포먼스` 판정과 문구 (10절 · D-182).
 *
 * 여기서 고정하려는 것은 세 가지다.
 *   1. **모자란 것을 `유지중` 으로 뭉개지 않는다** — 3판 미만·킬데스 없음·기준 없음
 *   2. **폼은 킬데스만 본다** — 승률이 아무리 요동쳐도 판정이 안 바뀐다
 *   3. **하루의 경계는 KST** — UTC 로 자르면 00~09시 클랜전이 어제로 샌다
 */
import { describe, expect, it } from 'vitest'
import {
  NO_GAMES_TODAY,
  TODAY_FORM_THRESHOLD_PP,
  TODAY_MIN_GAMES,
  buildTodayPerformance,
  kstDayStart,
  type TodayTally,
} from '../todayPerformance'

/** 킬·데스만 주면 나머지는 알아서 채우는 헬퍼 */
function tally(over: Partial<TodayTally> = {}): TodayTally {
  return { games: 5, knownGames: 5, win: 3, lose: 2, kill: 60, death: 40, ...over }
}

describe('오늘 퍼포먼스 (D-182)', () => {
  it('오늘 경기가 없으면 폼을 판정하지 않는다', () => {
    const result = buildTodayPerformance(
      { games: 0, knownGames: 0, win: 0, lose: 0, kill: 0, death: 0 },
      61,
    )
    expect(result.sentence).toBe(NO_GAMES_TODAY)
    expect(result.trend).toBe('unknown')
    expect(result.kdRate).toBeNull()
    expect(result.winRate).toBeNull()
    expect(result.delta).toBeNull()
  })

  it(`${TODAY_MIN_GAMES}판 미만이면 킬데스는 보여주되 폼은 판정하지 않는다`, () => {
    /* 킬데스 60% 로 시즌평균(50%)보다 10%p 나 높다. 경계만 보면 `상승` 이지만
       판수가 모자라므로 판정하지 않는다 — 한 판짜리 킬데스는 난수에 가깝다 */
    const result = buildTodayPerformance(
      tally({ games: 2, knownGames: 2, win: 1, lose: 1 }),
      50,
    )
    expect(result.trend).toBe('unknown')
    expect(result.delta).toBeNull()
    expect(result.kdRate).toBe(60)
    expect(result.sentence).toBe('2전 1승 1패로 승률은 50퍼, 킬데스 60퍼입니다 (3판부터 폼을 봅니다)')
  })

  it('시즌평균보다 경계 넘게 낮으면 하락중이다', () => {
    const result = buildTodayPerformance(tally(), 70)
    expect(result.kdRate).toBe(60)
    expect(result.delta).toBe(-10)
    expect(result.trend).toBe('falling')
    expect(result.sentence).toBe('5전 3승 2패로 승률은 60퍼, 킬데스 60퍼로 폼이 하락중입니다')
  })

  it('시즌평균보다 경계 넘게 높으면 상승중이다', () => {
    const result = buildTodayPerformance(tally(), 50)
    expect(result.trend).toBe('rising')
    expect(result.sentence).toContain('폼이 상승중입니다')
  })

  it('경계 안이면 유지중이다 — 경계값 자체도 유지중이다', () => {
    expect(buildTodayPerformance(tally(), 61).trend).toBe('steady')
    /* 정확히 ±2.0%p 는 "벗어났다" 가 아니다. 경계에 걸친 값을 상승/하락이라 부르지 않는다 */
    expect(buildTodayPerformance(tally(), 60 - TODAY_FORM_THRESHOLD_PP).trend).toBe('steady')
    expect(buildTodayPerformance(tally(), 60 + TODAY_FORM_THRESHOLD_PP).trend).toBe('steady')
  })

  it('폼은 킬데스만 본다 — 승률이 바뀌어도 판정은 그대로다', () => {
    const allWin = buildTodayPerformance(tally({ win: 5, lose: 0 }), 70)
    const allLose = buildTodayPerformance(tally({ win: 0, lose: 5 }), 70)
    expect(allWin.trend).toBe('falling')
    expect(allLose.trend).toBe('falling')
    expect(allWin.delta).toBe(allLose.delta)
    /* 문구의 승률만 갈린다 */
    expect(allWin.sentence).toContain('승률은 100퍼')
    expect(allLose.sentence).toContain('승률은 0퍼')
  })

  it('K/D 를 아는 경기가 없으면 킬데스는 0이 아니라 알수없음이다', () => {
    const result = buildTodayPerformance(
      tally({ knownGames: 0, kill: 0, death: 0 }),
      61,
    )
    expect(result.kdRate).toBeNull()
    expect(result.trend).toBe('unknown')
    expect(result.sentence).toBe('5전 3승 2패로 승률은 60퍼, 킬데스는 알수없음입니다')
  })

  it('견줄 시즌 평균이 없으면 판정하지 않는다', () => {
    const result = buildTodayPerformance(tally(), null)
    expect(result.trend).toBe('unknown')
    expect(result.delta).toBeNull()
    expect(result.sentence).toContain('킬데스는 알수없음입니다')
  })

  it('전적 수치는 그대로 실려 나간다', () => {
    const result = buildTodayPerformance(tally(), 61)
    expect(result.games).toBe(5)
    expect(result.knownGames).toBe(5)
    expect(result.win).toBe(3)
    expect(result.lose).toBe(2)
    expect(result.seasonKdRate).toBe(61)
  })
})

describe('하루의 경계는 KST 다', () => {
  it('KST 00:00 이 하루의 시작이다 (UTC 로는 전날 15:00)', () => {
    /* 2026-08-29 02:00 KST = 2026-08-28 17:00 UTC */
    const now = new Date('2026-08-28T17:00:00.000Z')
    expect(kstDayStart(now).toISOString()).toBe('2026-08-28T15:00:00.000Z')
  })

  it('KST 새벽 경기가 어제로 새지 않는다', () => {
    /* 클랜전이 가장 많은 시간대다. UTC 로 자르면 이 경기가 통째로 빠진다 */
    const now = new Date('2026-08-29T14:00:00.000Z') // 2026-08-29 23:00 KST
    const start = kstDayStart(now)
    const dawnMatch = new Date('2026-08-28T16:30:00.000Z') // 2026-08-29 01:30 KST
    expect(dawnMatch.getTime()).toBeGreaterThanOrEqual(start.getTime())
  })

  it('KST 자정 직전과 직후는 다른 날이다', () => {
    const beforeMidnight = new Date('2026-08-29T14:59:00.000Z') // 08-29 23:59 KST
    const afterMidnight = new Date('2026-08-29T15:01:00.000Z') // 08-30 00:01 KST
    expect(kstDayStart(beforeMidnight).toISOString()).not.toBe(
      kstDayStart(afterMidnight).toISOString(),
    )
  })
})
