/**
 * 시즌0 창 회귀 테스트 (D-175).
 *
 * 지키려는 사고 — 창 끝이 `2026-07-01` 로 박혀 있어서 **그 뒤 경기가 시즌0 집계에
 * 하나도 들어가지 않았다.** 7월 이후에만 뛴 선수는 승률 0% · 0킬 0데스 ·
 * 래더 `배치고사` 로 보였다. 끝을 다시 고정값으로 박으면 같은 사고가 난다.
 */
import { describe, expect, it } from 'vitest'
import {
  SEASON0_FROM,
  SEASON0_NUMBER,
  SEASON0_ORIGINS,
  SEASON0_ORIGINS_V1,
  SEASON0_TO,
  SEASON0_TYPE,
  season0MatchWhere,
  season0Scope,
} from '../lib/season0Window.js'

describe('시즌0 창 (D-175)', () => {
  it('2026-07-01 00:00 KST 에서 시작한다 (2026-08-31 정정 · 옛 값 4/1)', () => {
    expect(SEASON0_FROM.toISOString()).toBe('2026-06-30T15:00:00.000Z')
    // KST 로 환산하면 4월 1일 0시다
    const kst = new Date(SEASON0_FROM.getTime() + 9 * 60 * 60 * 1000)
    expect(kst.toISOString()).toBe('2026-07-01T00:00:00.000Z')
  })

  it('끝이 없다 — 시즌1 오픈일은 사용자가 정한다', () => {
    expect(SEASON0_TO).toBeNull()
  })

  it('창 밖(2026-03-31 이전) 경기는 창에 들어오지 않는다', () => {
    const where = season0MatchWhere()
    expect(where.startAt.gte.getTime()).toBe(SEASON0_FROM.getTime())
    // 상한이 붙으면 그 뒤 경기가 조용히 빠진다
    expect(where.startAt.lt).toBeUndefined()
  })

  /**
   * ⚠ 2026-09-01 — `nexon_barracks` 를 더했다. 이 단언이 그 자물쇠다.
   *
   * IPL(`nolink`)의 경기는 병영수첩에서 왔고 `origin='nexon_barracks'` 다.
   * 이 목록에 없어서 **시즌0 집계에서 통째로 빠져 있었다** — `season0 --leagues nolink`
   * 가 선수 0명·클랜 0개를 돌려줬다. 맨 뒤에 둔 것은 중복 제거에서 미러·넥슨이
   * 먼저 이기게 하기 위해서다. 옛 값은 `SEASON0_ORIGINS_V1` 에 남아 있다.
   */
  it('미러 · 넥슨 · 병영수첩을 **셋 다** 본다. 미러가 앞이다(중복이면 미러가 남는다)', () => {
    expect([...SEASON0_ORIGINS]).toEqual(['3rd.supply', 'nexon', 'nexon_barracks'])
    expect(season0MatchWhere().origin.in).toEqual(['3rd.supply', 'nexon', 'nexon_barracks'])
  })

  it('옛 목록을 지우지 않았다 (CLAUDE.md 10-4)', () => {
    expect([...SEASON0_ORIGINS_V1]).toEqual(['3rd.supply', 'nexon'])
  })

  it('replay 범위와 조회 범위가 같은 값에서 나온다', () => {
    const scope = season0Scope()
    const where = season0MatchWhere()
    expect(scope.origins).toEqual(where.origin.in)
    expect(scope.from.getTime()).toBe(where.startAt.gte.getTime())
    expect(scope.to).toBeNull()
  })

  it('시즌0 은 Season 표에서 번호 0 · beta 다', () => {
    expect(SEASON0_NUMBER).toBe(0)
    expect(SEASON0_TYPE).toBe('beta')
  })
})
