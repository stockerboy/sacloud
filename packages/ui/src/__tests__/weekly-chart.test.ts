/**
 * 주간 추이 그래프의 **좌표 규칙**을 고정한다 (2026-09-02).
 *
 * 여기서 지키려는 것은 「예쁘게 그려지나」가 아니라 **거짓말을 안 하나**다.
 *
 *   1. 값이 없는 구간에 **선을 잇지 않는다** (없는 데이터를 이으면 거짓 상승선이 생긴다)
 *   2. 순위 축은 **뒤집혀 있다** — 1위가 화면 위다
 *   3. 값이 거의 안 움직이면 축을 **최소 폭**으로 잡는다 (0.2%p 가 급등락처럼 보이면 안 된다)
 *   4. 점 글자는 **마지막 점을 언제나** 적는다 (지금 값이 제일 궁금하다)
 */
import { describe, expect, it } from 'vitest'
import {
  weeklyPercentDomain,
  weeklyRankDomain,
  weeklyRankY,
  weeklySegments,
  weeklyShowsLabel,
  weeklyTail,
  weeklyX,
  weeklyY,
} from '../record/weeklyChart'

describe('퍼센트 축', () => {
  it('값이 하나도 없으면 축을 만들지 않는다 — 0 으로 채우지 않는다', () => {
    expect(weeklyPercentDomain([null, null])).toBeNull()
    expect(weeklyPercentDomain([])).toBeNull()
  })

  it('거의 안 움직이는 값은 최소 폭으로 담는다', () => {
    const domain = weeklyPercentDomain([50.1, 50.3, 50.2])!
    expect(domain.hi - domain.lo).toBeGreaterThanOrEqual(12)
  })

  it('0~100 밖으로 나가지 않는다', () => {
    const low = weeklyPercentDomain([1, 2])!
    expect(low.lo).toBeGreaterThanOrEqual(0)
    const high = weeklyPercentDomain([98, 99])!
    expect(high.hi).toBeLessThanOrEqual(100)
  })

  it('큰 값이 위에 온다 (SVG 는 위가 0)', () => {
    const domain = weeklyPercentDomain([20, 80])!
    expect(weeklyY(80, domain)).toBeLessThan(weeklyY(20, domain))
  })
})

describe('순위 축 — 뒤집혀 있다', () => {
  it('1위가 화면 위다', () => {
    const domain = weeklyRankDomain([1, 40, 120])!
    expect(weeklyRankY(1, domain)).toBeLessThan(weeklyRankY(120, domain))
  })

  it('한 주도 안 움직였으면 가운데로 붙지 않게 폭을 준다', () => {
    const domain = weeklyRankDomain([7, 7, 7])!
    expect(domain.hi).toBeGreaterThan(domain.lo)
  })

  it('순위는 1보다 작아지지 않는다', () => {
    const domain = weeklyRankDomain([1, 1])!
    expect(domain.lo).toBeGreaterThanOrEqual(1)
  })

  it('값이 없으면 축을 만들지 않는다', () => {
    expect(weeklyRankDomain([null, null])).toBeNull()
  })
})

describe('선 잇기 — ★없는 구간은 잇지 않는다★', () => {
  const y = (v: number) => v

  it('앞이 비어 있으면 값이 나온 곳부터 시작한다', () => {
    const segments = weeklySegments([null, null, 50, 60], y)
    expect(segments).toHaveLength(1)
    expect(segments[0]!.map((p) => p.index)).toEqual([2, 3])
  })

  it('가운데가 비면 선이 두 조각으로 끊긴다', () => {
    const segments = weeklySegments([10, 20, null, 40, 50], y)
    expect(segments).toHaveLength(2)
    expect(segments[0]!.map((p) => p.index)).toEqual([0, 1])
    expect(segments[1]!.map((p) => p.index)).toEqual([3, 4])
  })

  it('점 하나짜리 조각도 돌려준다 — 점은 찍혀야 한다', () => {
    const segments = weeklySegments([null, 30, null], y)
    expect(segments).toHaveLength(1)
    expect(segments[0]).toHaveLength(1)
  })

  it('전부 비면 조각이 없다', () => {
    expect(weeklySegments([null, null], y)).toEqual([])
  })
})

describe('가로 위치', () => {
  it('첫 점과 끝 점이 좌우 끝에 붙지 않는다 (잘리지 않게 여백을 둔다)', () => {
    expect(weeklyX(0, 5)).toBeGreaterThan(0)
    expect(weeklyX(4, 5)).toBeLessThan(100)
  })

  it('점이 하나면 가운데다', () => {
    expect(weeklyX(0, 1)).toBe(50)
  })

  it('왼쪽이 오래된 주다', () => {
    expect(weeklyX(0, 5)).toBeLessThan(weeklyX(4, 5))
  })
})

describe('점 글자', () => {
  it('마지막 점은 구간이 아무리 길어도 적는다', () => {
    for (const count of [5, 10, 15, 25]) {
      expect(weeklyShowsLabel(count - 1, count)).toBe(true)
    }
  })

  it('5주·10주는 전부 적는다', () => {
    for (let i = 0; i < 10; i += 1) expect(weeklyShowsLabel(i, 10)).toBe(true)
  })

  it('25주는 사이를 띄운다 — 다 적으면 겹쳐서 못 읽는다', () => {
    const shown = Array.from({ length: 25 }, (_, i) => weeklyShowsLabel(i, 25)).filter(Boolean)
    expect(shown.length).toBeLessThan(25)
    expect(shown.length).toBeGreaterThan(5)
  })
})

describe('구간 자르기', () => {
  const points = Array.from({ length: 25 }, (_, i) => ({
    start: `w${i}`,
    played: true,
    games: 1,
    sniper_kd: null,
    rifle_kd: null,
      kd: null,
    win_rate: i,
    rank: null,
    season_games: i + 1,
    line: 'dashed' as const,
  }))

  it('최근 쪽을 남긴다', () => {
    const tail = weeklyTail(points, 5)
    expect(tail).toHaveLength(5)
    expect(tail[4]!.win_rate).toBe(24)
  })

  it('가진 것보다 길게 요청하면 있는 만큼만 준다', () => {
    expect(weeklyTail(points.slice(0, 3), 25)).toHaveLength(3)
  })
})
