/**
 * 주간 순위 스냅샷 — 줄 세우기와 차이 계산 (지시 #19).
 *
 *   ① 순위는 화면(`playerRankOf`)과 같은 정의다 — 정수 점수 내림차순 · 동점은 id 오름차순
 *   ② 배치고사 중은 모집단에서 빠진다
 *   ③ 같은 값을 다시 계산하면 **한 줄도 쓰지 않는다** (운영은 왕복이 곧 시간이다)
 */
import { describe, expect, it } from 'vitest'
import {
  diffWeeklyRank,
  estimateRows,
  rankAtBoundary,
  roundRating,
  weeklyRankKey,
} from '../lib/weeklyRankSnapshot.js'

describe('rankAtBoundary', () => {
  it('정수로 반올림한 점수로 줄 세운다 — 3000.4 와 3000.2 는 같은 자리다', () => {
    const rows = rankAtBoundary(
      [
        { id: 'b', display: 3000.4, games: 3 },
        { id: 'a', display: 3000.2, games: 3 },
        { id: 'c', display: 3120.6, games: 3 },
      ],
      0,
    )
    expect(rows.map((r) => r.id)).toEqual(['c', 'a', 'b'])
    expect(rows.map((r) => r.rating)).toEqual([3121, 3000, 3000])
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3])
    expect(rows.every((r) => r.rankCount === 3)).toBe(true)
  })

  it('배치고사 중(판수 < placementMatches)은 모집단에서 뺀다', () => {
    const rows = rankAtBoundary(
      [
        { id: 'x', display: 3500, games: 9 },
        { id: 'y', display: 3100, games: 10 },
      ],
      10,
    )
    expect(rows).toEqual([{ id: 'y', rank: 1, rankCount: 1, rating: 3100 }])
  })

  it('한 판도 없으면 배치고사 0 이어도 빠진다', () => {
    expect(rankAtBoundary([{ id: 'z', display: 3000, games: 0 }], 0)).toEqual([])
  })

  it('반올림은 season0Apply 와 같다 — 0.5 는 0 에서 먼 쪽으로', () => {
    expect(roundRating(3000.5)).toBe(3001)
    expect(roundRating(2999.5)).toBe(3000)
    expect(roundRating(-0.5)).toBe(-1)
    expect(roundRating(2999.49)).toBe(2999)
  })
})

describe('diffWeeklyRank', () => {
  const computed = rankAtBoundary(
    [
      { id: 'a', display: 3200, games: 5 },
      { id: 'b', display: 3100, games: 5 },
    ],
    0,
  )

  it('처음이면 전부 create 다', () => {
    const diff = diffWeeklyRank([], computed)
    expect(diff.create.map((r) => r.id)).toEqual(['a', 'b'])
    expect(diff.update).toEqual([])
    expect(diff.remove).toEqual([])
  })

  it('같은 값이면 한 줄도 안 쓴다', () => {
    const stored = computed.map((r) => ({ subjectId: r.id, rank: r.rank, rankCount: r.rankCount, rating: r.rating }))
    const diff = diffWeeklyRank(stored, computed)
    expect(diff).toEqual({ create: [], update: [], remove: [] })
  })

  it('순위가 바뀐 줄만 update 하고, 사라진 선수는 remove 한다', () => {
    const stored = [
      { subjectId: 'a', rank: 2, rankCount: 3, rating: 3200 },
      { subjectId: 'b', rank: 1, rankCount: 3, rating: 3300 },
      { subjectId: 'gone', rank: 3, rankCount: 3, rating: 3000 },
    ]
    const diff = diffWeeklyRank(stored, computed)
    expect(diff.create).toEqual([])
    expect(diff.update.map((r) => r.id)).toEqual(['a', 'b'])
    expect(diff.remove).toEqual(['gone'])
  })
})

describe('키 · 행 수', () => {
  it('키에 경계 규칙이 들어간다 — 규칙이 바뀌어도 옛 행과 섞이지 않는다', () => {
    const at = new Date('2026-08-26T15:00:00.000Z')
    expect(weeklyRankKey('L', 'player', at)).toEqual({ leagueId: 'L', kind: 'player', boundary: 'thu00', weekStartAt: at })
    expect(weeklyRankKey('L', 'clan', at, 'mon07').boundary).toBe('mon07')
  })

  it('행 수는 경계별 모집단의 합이다', () => {
    expect(estimateRows([10, 20, 30])).toBe(60)
    expect(estimateRows([])).toBe(0)
  })
})
