/**
 * 주 경계 · 주간 추이 · 순위 얹기 (지시 #19 · 2026-09-02).
 *
 * 지키려는 것.
 *   ① 경계는 **목요일 00:00 KST** 이고 상수 한 곳(`WEEK_BOUNDARY.current`)에서 온다
 *   ② 옛 경계(월요일 07:00 KST)는 **그대로 살아 있다** — 새 함수에 `mon07` 을 주면 옛 함수와 같다
 *   ③ 서머타임이 없다 — 주 간격은 언제나 정확히 7일이고, 연말을 넘어가도 요일이 안 틀린다
 *   ④ 순위는 스냅샷이 있는 주만 채우고 **없으면 `null`** 이다. 0 으로 채우지 않는다
 *
 * ⚠ 이 파일이 생기기 전에는 `weekly.ts` 를 직접 재는 테스트가 없었다.
 *   경계를 월07 → 목00 으로 바꾼 것이 기존 테스트를 깨뜨리지 않은 이유는 그래서다 —
 *   화면 좌표 테스트(`packages/ui/src/__tests__/weekly-chart.test.ts`)는 날짜를 모른다.
 */
import { describe, expect, it } from 'vitest'
import { kstDayStart } from '../todayPerformance'
import {
  attachWeeklyRank,
  foldWeekly,
  foldWeeklyClan,
  graphedLeague,
  lineStyle,
  SOLID_LINE_MIN_MATCHES,
  WEEK_BOUNDARY,
  weekBoundariesBetween,
  weekEnds,
  weekStart,
  weekStartOf,
  weekStartsOf,
  type WeeklyTrend,
} from '../weekly'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const WEEK = 7 * DAY

/** KST 벽시계 → UTC Date. 테스트를 사람이 읽는 시각으로 적기 위한 것 */
const kst = (iso: string): Date => new Date(new Date(`${iso}Z`).getTime() - 9 * HOUR)

/** 그 UTC 시각이 KST 로 무슨 요일·몇 시인가 */
const kstWeekday = (d: Date): number => new Date(d.getTime() + 9 * HOUR).getUTCDay()
const kstHour = (d: Date): number => new Date(d.getTime() + 9 * HOUR).getUTCHours()

describe('주 경계 상수', () => {
  it('지금 경계는 목요일 00:00 KST 다 — 사장님 확인 완료 (2026-09-02): 수요일 23:59 → 목요일 00:00', () => {
    expect(WEEK_BOUNDARY.current).toBe('thu00')
  })

  it('옛 경계(월요일 07:00 KST)는 지우지 않았다', () => {
    expect(WEEK_BOUNDARY.legacy).toBe('mon07')
  })
})

describe('weekStartOf — 목요일 00:00 KST', () => {
  /* 2026-09-02 는 수요일, 2026-09-03 은 목요일이다 (2026-01-01 목요일 + 245일) */

  it('경계 직전 — 수요일 23:59:59 KST 는 지난 목요일에 시작한 주다', () => {
    const at = kst('2026-09-02T23:59:59')
    expect(weekStartOf(at)).toEqual(kst('2026-08-27T00:00:00'))
  })

  it('경계 정각 — 목요일 00:00:00 KST 는 새 주의 첫 순간이다', () => {
    const at = kst('2026-09-03T00:00:00')
    expect(weekStartOf(at)).toEqual(at)
  })

  it('경계 직후 — 목요일 00:00:01 KST 도 새 주다', () => {
    const at = kst('2026-09-03T00:00:01')
    expect(weekStartOf(at)).toEqual(kst('2026-09-03T00:00:00'))
  })

  it('UTC 로 자르면 틀리는 시각 — 목요일 08:00 KST 는 UTC 로 아직 수요일 23:00 이다', () => {
    /* 2026-09-02T23:00Z = 2026-09-03 08:00 KST (목). UTC 요일로 재면 수요일이라 한 주가 밀린다 */
    const at = new Date('2026-09-02T23:00:00Z')
    expect(weekStartOf(at)).toEqual(kst('2026-09-03T00:00:00'))
  })

  it('연말을 넘어간다 — 2027-01-01(금) 은 2026-12-31(목) 에 시작한 주다', () => {
    expect(weekStartOf(kst('2027-01-01T12:00:00'))).toEqual(kst('2026-12-31T00:00:00'))
    expect(weekStartOf(kst('2027-01-06T23:00:00'))).toEqual(kst('2026-12-31T00:00:00'))
    expect(weekStartOf(kst('2027-01-07T00:00:00'))).toEqual(kst('2027-01-07T00:00:00'))
  })

  it('서머타임이 없다 — 2026년 매일 재도 주 시작은 항상 목요일 00:00 KST 이고 간격은 정확히 7일이다', () => {
    let previous: Date | null = null
    for (let t = kst('2026-01-01T12:00:00').getTime(); t < kst('2027-01-01T00:00:00').getTime(); t += DAY) {
      const start = weekStartOf(new Date(t))
      expect(kstWeekday(start)).toBe(4)
      expect(kstHour(start)).toBe(0)
      expect(start.getTime()).toBeLessThanOrEqual(t)
      expect(t - start.getTime()).toBeLessThan(WEEK)
      if (previous && start.getTime() !== previous.getTime()) {
        expect(start.getTime() - previous.getTime()).toBe(WEEK)
      }
      previous = start
    }
  })
})

describe('weekStartOf — 다른 해석도 같은 표에서 나온다', () => {
  it('wed00 — 「수요일 00시」를 글자대로 읽으면 화→수 경계다', () => {
    expect(weekStartOf(kst('2026-09-02T00:00:00'), 'wed00')).toEqual(kst('2026-09-02T00:00:00'))
    expect(weekStartOf(kst('2026-09-01T23:59:59'), 'wed00')).toEqual(kst('2026-08-26T00:00:00'))
  })

  it('mon07 — 옛 함수 `weekStart(at, kstDayStart)` 와 한 해 내내 같은 값이다', () => {
    for (let t = kst('2026-01-01T03:00:00').getTime(); t < kst('2027-01-01T00:00:00').getTime(); t += 11 * HOUR) {
      const at = new Date(t)
      expect(weekStartOf(at, 'mon07')).toEqual(weekStart(at, kstDayStart))
    }
  })

  it('mon07 — 월요일 06:59 KST 는 아직 지난주다 (하루 경계 07:00 위에 얹은 규칙)', () => {
    /* 2026-08-31 은 월요일 */
    expect(weekStartOf(kst('2026-08-31T06:59:00'), 'mon07')).toEqual(kst('2026-08-24T07:00:00'))
    expect(weekStartOf(kst('2026-08-31T07:00:00'), 'mon07')).toEqual(kst('2026-08-31T07:00:00'))
  })
})

describe('weekBoundariesBetween — 스냅샷을 찍을 시각들', () => {
  it('시즌0 시작(7/1 KST)부터 9/2 정오까지 지난 목요일 00:00 은 아홉 번이다', () => {
    const from = new Date('2026-06-30T15:00:00.000Z') /* = SEASON0_FROM */
    const to = kst('2026-09-02T12:00:00')
    const bounds = weekBoundariesBetween(from, to)
    expect(bounds).toHaveLength(9)
    expect(bounds[0]).toEqual(kst('2026-07-02T00:00:00'))
    expect(bounds[8]).toEqual(kst('2026-08-27T00:00:00'))
    for (let i = 1; i < bounds.length; i += 1) {
      expect(bounds[i]!.getTime() - bounds[i - 1]!.getTime()).toBe(WEEK)
    }
  })

  it('from 자체가 경계면 그것은 넣지 않는다 (from < t ≤ to)', () => {
    const from = kst('2026-07-02T00:00:00')
    expect(weekBoundariesBetween(from, kst('2026-07-09T00:00:00'))).toEqual([kst('2026-07-09T00:00:00')])
  })

  it('한 주가 안 지났으면 비어 있다', () => {
    expect(weekBoundariesBetween(kst('2026-09-03T01:00:00'), kst('2026-09-05T00:00:00'))).toEqual([])
  })
})

describe('weekEnds · weekStartsOf', () => {
  const now = kst('2026-09-03T21:00:00') /* 목요일 밤 — 새 주가 막 시작했다 */

  it('길이는 weeks 이고 마지막 끝은 now 다', () => {
    const ends = weekEnds(now, 5, kstDayStart)
    expect(ends).toHaveLength(5)
    expect(ends[4]).toEqual(now)
    expect(ends[3]).toEqual(kst('2026-09-03T00:00:00'))
  })

  it('i 번째 주의 끝은 i+1 번째 주의 시작이다', () => {
    const ends = weekEnds(now, 5, kstDayStart)
    const starts = weekStartsOf(now, 5, kstDayStart)
    for (let i = 0; i < 4; i += 1) expect(ends[i]).toEqual(starts[i + 1])
    expect(starts[4]).toEqual(kst('2026-09-03T00:00:00'))
  })

  it('옛 경계를 주면 월요일 07:00 으로 자른다', () => {
    const starts = weekStartsOf(now, 2, kstDayStart, 'mon07')
    expect(starts[1]).toEqual(kst('2026-08-31T07:00:00'))
  })
})

describe('foldWeekly — 경계가 바뀌면 칸이 바뀐다', () => {
  const kd = (k: number, d: number): number => (d === 0 ? k * 100 : Math.round((k / d) * 1000) / 10)
  const wr = (w: number, l: number): number => Math.round((w / (w + l)) * 1000) / 10
  const now = kst('2026-09-03T21:00:00')
  const rows = [
    { matchId: 'a', startAt: kst('2026-09-02T23:00:00'), side: 'red', winnerSide: 'red', weapon: 0, kill: 10, death: 5 },
    { matchId: 'b', startAt: kst('2026-09-03T01:00:00'), side: 'red', winnerSide: 'blue', weapon: 0, kill: 4, death: 8 },
  ]

  it('목00 — 수요일 밤 경기와 목요일 새벽 경기는 다른 주다', () => {
    const trend = foldWeekly(rows, now, 2, kstDayStart, kd, wr)
    expect(trend.points.map((p) => p.games)).toEqual([1, 1])
    expect(trend.points[0]!.win_rate).toBe(100)
    expect(trend.points[1]!.win_rate).toBe(50) /* 누적이다 */
  })

  it('월07(옛) — 같은 두 경기가 한 주에 들어간다', () => {
    const trend = foldWeekly(rows, now, 2, kstDayStart, kd, wr, 'mon07')
    expect(trend.points.map((p) => p.games)).toEqual([0, 2])
    expect(trend.points[0]!.win_rate).toBeNull() /* 아직 한 판도 없던 주 */
  })

  it('순위는 여기서 채우지 않는다 — 전부 null', () => {
    const trend = foldWeekly(rows, now, 2, kstDayStart, kd, wr)
    expect(trend.points.every((p) => p.rank === null)).toBe(true)
    expect(trend.has_rank).toBe(false)
  })

  it('클랜도 같은 경계다', () => {
    const clan = foldWeeklyClan(
      rows.map((r) => ({ matchId: r.matchId, startAt: r.startAt, won: r.side === r.winnerSide })),
      now,
      2,
      kstDayStart,
      wr,
    )
    expect(clan.points.map((p) => p.games)).toEqual([1, 1])
    expect(clan.points.map((p) => p.start)).toEqual(
      foldWeekly(rows, now, 2, kstDayStart, kd, wr).points.map((p) => p.start),
    )
  })
})

describe('attachWeeklyRank — 스냅샷이 있는 주만 채운다', () => {
  const s0 = kst('2026-08-13T00:00:00')
  const point = (start: Date): WeeklyTrend['points'][number] => ({
    start: start.toISOString(),
    played: true,
    games: 1,
    sniper_kd: null,
    rifle_kd: null,
    win_rate: 50,
    season_games: 1,
    line: 'dashed',
    rank: null,
  })
  const trend: WeeklyTrend = {
    points: [point(s0), point(new Date(s0.getTime() + WEEK)), point(new Date(s0.getTime() + 2 * WEEK))],
    has_rank: false,
  }

  it('점 i 의 순위는 다음 주 시작 경계의 스냅샷이고, 마지막 점은 지금 순위다', () => {
    const out = attachWeeklyRank(
      trend,
      [
        { weekStartAt: new Date(s0.getTime() + WEEK), rank: 5 },
        { weekStartAt: new Date(s0.getTime() + 2 * WEEK), rank: 3 },
      ],
      2,
    )
    expect(out.points.map((p) => p.rank)).toEqual([5, 3, 2])
    expect(out.has_rank).toBe(true)
  })

  it('없는 주는 null 이다 — 0 이 아니다', () => {
    const out = attachWeeklyRank(trend, [{ weekStartAt: new Date(s0.getTime() + 2 * WEEK), rank: 7 }], null)
    expect(out.points.map((p) => p.rank)).toEqual([null, 7, null])
    expect(out.has_rank).toBe(true)
  })

  it('스냅샷도 지금 순위도 없으면 has_rank 가 거짓이다 — 화면이 순위 선을 안 그린다', () => {
    const out = attachWeeklyRank(trend, [], null)
    expect(out.points.every((p) => p.rank === null)).toBe(true)
    expect(out.has_rank).toBe(false)
  })

  it('입력을 바꾸지 않는다', () => {
    attachWeeklyRank(trend, [{ weekStartAt: new Date(s0.getTime() + WEEK), rank: 1 }], 1)
    expect(trend.points.every((p) => p.rank === null)).toBe(true)
  })
})

/* ========================================================================== */
/* 선 규칙 (O-045 · 2026-09-03 사장님 회의)                                     */
/* ========================================================================== */

describe('O-045 선 규칙', () => {
  it('★25판 이상이고 그 주에 뛰었으면 실선★', () => {
    expect(lineStyle(25, 1)).toBe('solid')
  })

  it('★24판이면 그 주에 열 판을 뛰어도 점선★ — «25판이 넘을때까지 쭉 점선이다»', () => {
    expect(lineStyle(24, 10)).toBe('dashed')
  })

  it('★★25판을 훨씬 넘겨도 그 주 0판이면 점선★★ — 두 조건은 AND 다', () => {
    expect(lineStyle(999, 0)).toBe('dashed')
  })

  it('★일부러 깨뜨려★ — 기준을 24로 낮추면 24판이 실선이 되어 위 검사가 깨진다', () => {
    /* ORDERS 확인 6번을 검사로 굳힌다. 기준값이 바뀌면 여기서 먼저 걸린다 */
    const broken = (season: number, week: number): string =>
      season >= 24 && week >= 1 ? 'solid' : 'dashed'
    expect(broken(24, 10)).toBe('solid')
    expect(lineStyle(24, 10)).toBe('dashed')
    expect(SOLID_LINE_MIN_MATCHES).toBe(25)
  })

  it('★열산은 그래프를 안 찍는다★ — «열산은 찍지도 말아라»', () => {
    expect(graphedLeague('sanply')).toBe(false)
    expect(graphedLeague('nolink')).toBe(true)
    expect(graphedLeague('supply')).toBe(true)
    /* ★대룰도 안 찍는다★ — 「없는 리그」다 (O-042) */
    expect(graphedLeague('daerule')).toBe(false)
  })
})

describe('O-045 접기가 선 규칙을 채운다', () => {
  /* 위 describe 안의 것과 같은 helper — 블록 밖에서는 안 보인다 */
  const kd = (k: number, d: number): number =>
    d === 0 ? k * 100 : Math.round((k / d) * 1000) / 10
  const wr = (w: number, l: number): number => Math.round((w / (w + l)) * 1000) / 10
  const row = (matchId: string, at: string, won: boolean) => ({
    matchId,
    startAt: new Date(`${at}+09:00`),
    side: 'red',
    winnerSide: won ? 'red' : 'blue',
    weapon: 0,
    kill: 10,
    death: 5,
  })

  it('★season_games 는 시즌 누적이고 games 는 그 주만이다★', () => {
    const now = new Date('2026-07-22T12:00:00+09:00')
    const rows = [
      ...Array.from({ length: 30 }, (_, i) => row(`a${i}`, '2026-07-03T12:00:00', true)),
      row('b0', '2026-07-17T12:00:00', true), /* 마지막 칸(7/16~7/23) 안 */
    ]
    const trend = foldWeekly(rows, now, 3, kstDayStart, kd, wr)
    const last = trend.points[trend.points.length - 1]!
    expect(last.season_games).toBe(31)
    expect(last.games).toBe(1)
    expect(last.line).toBe('solid')
  })

  it('★한 판도 안 한 주는 25판을 넘겨도 점선★ — 안 뛴 게 눈에 보여야 한다', () => {
    const now = new Date('2026-07-22T12:00:00+09:00')
    const rows = Array.from({ length: 30 }, (_, i) => row(`a${i}`, '2026-07-03T12:00:00', true))
    const trend = foldWeekly(rows, now, 3, kstDayStart, kd, wr)
    const last = trend.points[trend.points.length - 1]!
    expect(last.games).toBe(0)
    expect(last.season_games).toBe(30)
    expect(last.line).toBe('dashed')
  })
})
