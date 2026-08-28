/**
 * 선수 프로필 `최근 폼` 판정 회귀 (D-167).
 *
 * 여기서 지키는 것 두 가지.
 *  1. 경계값이 흩어지지 않는다 — `FORM_TREND_THRESHOLD_PP` 하나가 전부를 정한다.
 *  2. **경기가 부족하면 판정하지 않는다.** `steady` 로 뭉개면 3경기 뛴 선수에게
 *     "꾸준한 퍼포먼스" 라고 말하게 된다 (D-106).
 */
import { describe, expect, it } from 'vitest'
import {
  FORM_MIN_BASELINE_GAMES,
  FORM_MONTHS,
  FORM_RECENT_GAMES,
  FORM_TREND_THRESHOLD_PP,
  formMonthKey,
  formMonthKeys,
  formRangeStart,
  judgeFormTrend,
} from '../form'
import { PlayerForm } from '../entities/detail'

/** 킬뎃 `rate`% 가 되도록 `games` 판짜리 구간을 만든다 (한 판 20교전 가정) */
function window(games: number, rate: number) {
  const total = games * 20
  const kill = Math.round((total * rate) / 100)
  return { games, kill, death: total - kill }
}

describe('judgeFormTrend', () => {
  it('경계 미만은 꾸준이다', () => {
    const judged = judgeFormTrend(window(10, 52), window(30, 50))
    expect(judged.trend).toBe('steady')
    expect(judged.delta).toBe(2)
  })

  it('경계 이상이면 급상승이다 (경계값 포함)', () => {
    const judged = judgeFormTrend(window(10, 55), window(30, 50))
    expect(judged.delta).toBe(FORM_TREND_THRESHOLD_PP)
    expect(judged.trend).toBe('rising')
  })

  it('경계 이하로 떨어지면 하락이다 (경계값 포함)', () => {
    const judged = judgeFormTrend(window(10, 45), window(30, 50))
    expect(judged.delta).toBe(-FORM_TREND_THRESHOLD_PP)
    expect(judged.trend).toBe('falling')
  })

  it('최근 경기가 모자라면 판정하지 않는다 — steady 로 뭉개지 않는다', () => {
    const judged = judgeFormTrend(window(FORM_RECENT_GAMES - 1, 70), window(30, 50))
    expect(judged.trend).toBe('unknown')
    expect(judged.delta).toBeNull()
    expect(judged.recentKdRate).toBeNull()
  })

  it('비교 구간이 모자라면 판정하지 않는다', () => {
    const judged = judgeFormTrend(window(10, 70), window(FORM_MIN_BASELINE_GAMES - 1, 50))
    expect(judged.trend).toBe('unknown')
  })

  it('킬·데스가 통째로 0이면 0% 라고 하지 않는다', () => {
    const judged = judgeFormTrend(
      { games: 10, kill: 0, death: 0 },
      { games: 30, kill: 600, death: 600 },
    )
    expect(judged.trend).toBe('unknown')
    expect(judged.recentKdRate).toBeNull()
  })
})

describe('달 버킷은 KST 기준이다', () => {
  it('UTC 로는 전달이지만 KST 로는 다음 달인 시각', () => {
    // 2026-03-31T20:00Z = 2026-04-01T05:00 KST
    expect(formMonthKey(new Date('2026-03-31T20:00:00Z'))).toBe('2026-04')
  })

  it('KST 자정 직전은 그 달에 남는다', () => {
    // 2026-03-31T14:59Z = 2026-03-31T23:59 KST
    expect(formMonthKey(new Date('2026-03-31T14:59:00Z'))).toBe('2026-03')
  })

  it('오래된 달 → 최신 달 순으로 6칸이다', () => {
    const keys = formMonthKeys(new Date('2026-08-28T03:00:00Z'))
    expect(keys).toHaveLength(FORM_MONTHS)
    expect(keys).toEqual(['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'])
  })

  it('해를 넘겨도 이어진다', () => {
    expect(formMonthKeys(new Date('2026-02-10T03:00:00Z'))).toEqual([
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ])
  })

  it('구간 시작은 첫 달 1일 00:00 KST 다', () => {
    const start = formRangeStart(new Date('2026-08-28T03:00:00Z'))
    // 2026-03-01T00:00 KST = 2026-02-28T15:00Z
    expect(start.toISOString()).toBe('2026-02-28T15:00:00.000Z')
    expect(formMonthKey(start)).toBe('2026-03')
  })
})

describe('PlayerForm 계약', () => {
  it('경기가 없던 달은 kd_rate 가 null 이다 — 0 으로 채우지 않는다', () => {
    const parsed = PlayerForm.parse({
      months: [{ month: '2026-06', games: 0, kill: 0, death: 0, kd_rate: null }],
      trend: 'unknown',
      recent_games: 0,
      recent_kd_rate: null,
      baseline_games: 0,
      baseline_kd_rate: null,
      delta: null,
    })
    expect(parsed.months[0]!.kd_rate).toBeNull()
  })
})
