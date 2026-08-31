/**
 * IPL 원문 → `Match` 투영 판정 테스트.
 *
 * 여기가 틀리면 **IPL 기록이 통째로 오염된다.** 특히 셋을 지킨다.
 *   ① 시각을 못 읽으면 지어내지 않는다 (시각이 틀리면 시즌 창 판정이 틀린다)
 *   ② 한쪽만 IPL 이면 IPL 경기가 아니다 (D-210 의 거울)
 *   ③ 무승부를 승리로 바꾸지 않는다
 */
import { describe, expect, it } from 'vitest'
import {
  IPL_LEAGUE_MAP_NAME,
  matchKeyToDate,
  planProjection,
  winnerSideOf,
} from '../lib/iplProject.js'

describe('matchKeyToDate — 앞 12자리(KST)를 UTC 로', () => {
  it('KST 를 UTC 로 9시간 당긴다', () => {
    // 2026-08-31 00:11:12 KST = 2026-08-30 15:11:12 UTC
    expect(matchKeyToDate('260831001112124001')?.toISOString()).toBe('2026-08-30T15:11:12.000Z')
  })

  it('낮 경기도 맞는다', () => {
    // 2026-04-16 23:04:47 KST = 2026-04-16 14:04:47 UTC
    expect(matchKeyToDate('260416230447119001')?.toISOString()).toBe('2026-04-16T14:04:47.000Z')
  })

  it('12자리가 안 되면 null', () => {
    expect(matchKeyToDate('26083100')).toBeNull()
  })

  it('숫자가 아니면 null', () => {
    expect(matchKeyToDate('26083100111X124001')).toBeNull()
  })

  it('말이 안 되는 달·일·시는 null — 억지로 만들지 않는다', () => {
    expect(matchKeyToDate('261331001112124001')).toBeNull() // 13월
    expect(matchKeyToDate('260832001112124001')).toBeNull() // 32일
    expect(matchKeyToDate('260831251112124001')).toBeNull() // 25시
  })

  it('존재하지 않는 날짜(2월 31일)를 걸러낸다', () => {
    expect(matchKeyToDate('260231120000124001')).toBeNull()
  })

  it('윤년 2월 29일은 통과한다', () => {
    expect(matchKeyToDate('280229120000124001')?.toISOString()).toBe('2028-02-29T03:00:00.000Z')
  })
})

describe('winnerSideOf — 무승부를 승리로 바꾸지 않는다', () => {
  it('많이 이긴 쪽이 승자다', () => {
    expect(winnerSideOf(10, 6)).toBe('red')
    expect(winnerSideOf(6, 10)).toBe('blue')
  })

  it('같으면 null 이다', () => {
    expect(winnerSideOf(9, 9)).toBeNull()
  })

  it('숫자가 아니면 null', () => {
    expect(winnerSideOf(Number.NaN, 3)).toBeNull()
  })
})

describe('planProjection — 못 하면 왜 못 하는지 돌려준다', () => {
  const RED = { leagueClanId: 'lc-red', division: 2 }
  const BLUE = { leagueClanId: 'lc-blue', division: 3 }
  const resolveClan = (name: string) =>
    name === 'amaryllis' ? RED : name === 'evermore' ? BLUE : null

  const base = {
    matchKey: '260831001112124001',
    mapName: IPL_LEAGUE_MAP_NAME,
    redClanName: 'amaryllis',
    blueClanName: 'evermore',
    redWinCount: 10,
    blueWinCount: 6,
    resolveClan,
    seasonFrom: new Date('2026-06-30T15:00:00.000Z'), // 2026-07-01 KST
  }

  it('다 갖춰지면 계획을 만든다', () => {
    const r = planProjection(base)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.plan.winnerSide).toBe('red')
      expect(r.plan.red).toEqual(RED)
      expect(r.plan.blue).toEqual(BLUE)
      expect(r.plan.startAt.toISOString()).toBe('2026-08-30T15:11:12.000Z')
    }
  })

  it('다른 맵이면 건너뛴다', () => {
    const r = planProjection({ ...base, mapName: '제2보급창고' })
    expect(r).toEqual({ ok: false, reason: 'other_map' })
  })

  it('맵 이름이 없어도 건너뛴다', () => {
    expect(planProjection({ ...base, mapName: null })).toEqual({ ok: false, reason: 'other_map' })
  })

  it('시각을 못 읽으면 건너뛴다', () => {
    expect(planProjection({ ...base, matchKey: 'XXXX' })).toEqual({ ok: false, reason: 'bad_time' })
  })

  it('시즌 창보다 앞이면 건너뛴다 — 7/1 이전 경기는 안 넣는다', () => {
    // 2026-04-16 경기
    const r = planProjection({ ...base, matchKey: '260416230447119001' })
    expect(r).toEqual({ ok: false, reason: 'before_season' })
  })

  it('시즌 창 시작 그 순간은 들어간다', () => {
    // 2026-07-01 00:00:00 KST
    const r = planProjection({ ...base, matchKey: '260701000000000001' })
    expect(r.ok).toBe(true)
  })

  it('양쪽 다 못 찾으면 unknown_clan', () => {
    const r = planProjection({ ...base, redClanName: '모르는곳', blueClanName: '여기도' })
    expect(r).toEqual({ ok: false, reason: 'unknown_clan' })
  })

  it('클랜명이 비어 있으면 unknown_clan', () => {
    expect(planProjection({ ...base, redClanName: '  ' })).toEqual({
      ok: false,
      reason: 'unknown_clan',
    })
  })

  it('한쪽만 IPL 이면 **IPL 경기가 아니다** — 넣으면 IPL 기록이 오염된다', () => {
    const r = planProjection({ ...base, blueClanName: 'IPL아닌클랜' })
    expect(r).toEqual({ ok: false, reason: 'not_ipl_pair' })
  })

  it('무승부는 투영하지 않는다', () => {
    expect(planProjection({ ...base, redWinCount: 9, blueWinCount: 9 })).toEqual({
      ok: false,
      reason: 'draw',
    })
  })

  it('승수 칸이 없으면 bad_score', () => {
    expect(planProjection({ ...base, redWinCount: null })).toEqual({
      ok: false,
      reason: 'bad_score',
    })
  })

  it('승수가 문자열 숫자여도 읽는다 — 원문이 문자열로 줄 때가 있다', () => {
    const r = planProjection({ ...base, redWinCount: '10', blueWinCount: '6' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.plan.winnerSide).toBe('red')
  })

  it('맵 판정이 시각 판정보다 먼저다 — 순서가 곧 우선순위다', () => {
    const r = planProjection({ ...base, mapName: '딴맵', matchKey: 'XXXX' })
    expect(r).toEqual({ ok: false, reason: 'other_map' })
  })
})
