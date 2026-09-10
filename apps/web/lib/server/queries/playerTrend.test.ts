import { describe, expect, it } from 'vitest'
import { buildPlayerTrend, trendDayIndex } from './playerTrend'

const at = (iso: string) => new Date(iso)

describe('선수 추이 — 사장님 지시서 (2026-09-10)', () => {
  it('하루 경계는 새벽 6시(KST) — 9/9 05:59 은 «9/8», 06:00 은 «9/9»', () => {
    expect(trendDayIndex(at('2026-09-08T20:59:00Z'))).toBe(5) // KST 9/9 05:59 → 9/8 칸 (0=9/3)
    expect(trendDayIndex(at('2026-09-08T21:00:00Z'))).toBe(6) // KST 9/9 06:00 → 9/9 칸
  })

  it('9/3 부터 10/1 까지 29칸 · 첫 칸은 «9/3» · 마지막은 «10/1»', () => {
    const days = buildPlayerTrend([], at('2026-09-10T12:00:00Z'))
    expect(days).toHaveLength(29)
    expect(days[0]?.label).toBe('9/3')
    expect(days[28]?.label).toBe('10/1')
    expect(days[0]?.date).toBe('2026-09-03')
  })

  it('게임이 없던 날은 0% 로 붙어 있고, 미래는 future 다', () => {
    const now = at('2026-09-10T12:00:00Z') // KST 9/10 21:00 → «9/10» 칸 (index 7)
    const days = buildPlayerTrend([], now)
    expect(days[0]?.win_rate).toBe(0)
    expect(days[7]?.today).toBe(true)
    expect(days[7]?.future).toBe(false)
    expect(days[8]?.future).toBe(true)
  })

  it('첫 경기가 9/7 이면 9/3~9/6 은 0%, 9/7 부터 실제값', () => {
    const rows = [
      { startAt: at('2026-09-07T10:00:00Z'), winnerSide: 'red', side: 'red', kill: 10, death: 5 },
      { startAt: at('2026-09-07T11:00:00Z'), winnerSide: 'blue', side: 'red', kill: 6, death: 9 },
    ]
    const days = buildPlayerTrend(rows, at('2026-09-10T12:00:00Z'))
    expect(days.slice(0, 4).map((d) => d.win_rate)).toEqual([0, 0, 0, 0])
    expect(days[4]?.label).toBe('9/7')
    expect(days[4]?.games).toBe(2)
    expect(days[4]?.win_rate).toBe(50)
    expect(days[4]?.kd).toBe(53.3) // 16 / 30
  })

  it('하루 1판은 «안 찍힘» = 0% 이고, 누적에는 들어간다', () => {
    const rows = [{ startAt: at('2026-09-05T10:00:00Z'), winnerSide: 'red', side: 'red', kill: 10, death: 5 }]
    const days = buildPlayerTrend(rows, at('2026-09-10T12:00:00Z'))
    expect(days[2]?.games).toBe(1)
    expect(days[2]?.win_rate).toBe(0)
    expect(days[2]?.cum_win_rate).toBe(100)
    expect(days[3]?.cum_win_rate).toBe(100)
    expect(days[3]?.cum_games).toBe(1)
  })
})
