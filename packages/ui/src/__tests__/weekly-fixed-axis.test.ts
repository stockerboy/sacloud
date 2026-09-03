/**
 * **주간 그래프 — 고정 축과 실선/점선** (2026-09-04 사장님 지시).
 *
 * > ★「Y축을 0 20 30 40 50 60 70 80 100 ← 이 아홉 값 그대로」★
 * > ★「선은 빨간색」★
 * > ★「실선 기준은 25판 이상」★
 *
 * ★셋 다 화면까지 닿았는지 여기서 못박는다.★
 * ★특히 25판 규칙은 계약(`weekly.ts`)에만 있고 화면엔 안 붙어 있었다★ — 그래서 검사를 둔다.
 */
import { describe, expect, it } from 'vitest'
import { SOLID_LINE_MIN_MATCHES, lineStyle } from '@sacloud/contract'
import {
  WEEKLY_FIXED_DOMAIN,
  weeklyDashRuns,
  weeklyFixedTicks,
} from '../record/weeklyChart'

describe('고정 Y축', () => {
  it('★아홉 값 그대로다★ — 고르지 않다는 것이 핵심이다', () => {
    expect(weeklyFixedTicks()).toEqual([0, 20, 30, 40, 50, 60, 70, 80, 100])
  })

  it('★0 다음이 20 이고 80 다음이 100 이다★ — 「10 이 빠졌네」 하고 채우지 마라', () => {
    const t = weeklyFixedTicks()
    expect(t[1]! - t[0]!).toBe(20)
    expect(t[t.length - 1]! - t[t.length - 2]!).toBe(20)
  })

  it('축 범위는 눈금의 처음과 끝이다', () => {
    expect(WEEKLY_FIXED_DOMAIN).toEqual({ lo: 0, hi: 100 })
  })

  it('★주마다 달라지지 않는다★ — 몇 번을 불러도 같은 값이다', () => {
    expect(weeklyFixedTicks()).toEqual(weeklyFixedTicks())
  })
})

describe('실선/점선 — 25판 규칙이 화면까지 온다', () => {
  const pts = (n: number) => Array.from({ length: n }, (_, i) => ({ index: i }))
  /** 시즌 통산 판수 목록 → 그 점의 선 모양 */
  const linesOf = (games: number[]) => (index: number) => lineStyle(games[index] ?? 0)

  it('기준은 ★25판★ 이다', () => {
    expect(SOLID_LINE_MIN_MATCHES).toBe(25)
    expect(lineStyle(24)).toBe('dashed')
    expect(lineStyle(25)).toBe('solid')
  })

  it('★쭉 25판 아래면 통째로 점선이다★', () => {
    const runs = weeklyDashRuns(pts(4), linesOf([3, 8, 14, 20]))
    expect(runs).toHaveLength(1)
    expect(runs[0]!.dashed).toBe(true)
  })

  it('★쭉 25판 위면 통째로 실선이다★', () => {
    const runs = weeklyDashRuns(pts(4), linesOf([30, 40, 50, 60]))
    expect(runs).toHaveLength(1)
    expect(runs[0]!.dashed).toBe(false)
  })

  it('★넘기는 그 주부터 실선으로 바뀐다★ — 선 하나가 두 조각이 된다', () => {
    /* 0주 10판 · 1주 18판 · 2주 ★26판★ · 3주 33판 */
    const runs = weeklyDashRuns(pts(4), linesOf([10, 18, 26, 33]))
    expect(runs.map((r) => r.dashed)).toEqual([true, false])
    expect(runs[0]!.points.map((p) => p.index)).toEqual([0, 1])
    expect(runs[1]!.points.map((p) => p.index)).toEqual([1, 2, 3])
  })

  it('★바뀌는 자리에 틈이 없다★ — 앞 조각의 끝점이 뒤 조각의 첫 점이다', () => {
    const runs = weeklyDashRuns(pts(5), linesOf([5, 10, 30, 40, 50]))
    for (let i = 1; i < runs.length; i += 1) {
      const prev = runs[i - 1]!.points
      const next = runs[i]!.points
      expect(next[0]!.index).toBe(prev[prev.length - 1]!.index)
    }
  })

  it('점이 하나뿐이면 조각도 하나다 — 터지지 않는다', () => {
    expect(weeklyDashRuns(pts(1), linesOf([3]))).toHaveLength(1)
    expect(weeklyDashRuns([], linesOf([]))).toHaveLength(0)
  })

  it('★한 주도 안 뛰어도 25판을 넘겼으면 통산이 그대로다★ — 통산은 줄지 않는다', () => {
    /* 사장님: «일주일간 한판도 하지 않은 유저도 점선으로 이어라» 는 ★25판 아래일 때★ 의 말이다.
       통산 판수는 안 뛴 주에도 그대로 남으므로, 넘긴 뒤에는 실선이 이어진다 */
    const runs = weeklyDashRuns(pts(3), linesOf([30, 30, 30]))
    expect(runs.map((r) => r.dashed)).toEqual([false])
  })
})
