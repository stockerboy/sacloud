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
  SEASON0_ORIGINS_V2,
  SEASON0_TO,
  SEASON0_TYPE,
  season0MatchWhere,
  season0Scope,
} from '../lib/season0Window.js'

describe('시즌0 창 (D-175)', () => {
  /*
   * ⚠ ★2026-09-04 · 창을 옮겼다★ (사장님)
   *   > «IPL은 전 기록 다 버리고 ★9월3일 오전 7시를 기준으로 그 이후의 기록만★ 기록한다»
   *   > «시즌0 ★10월 첫째 목★ 까지 가자»
   *   옛 값(7/1 시작 · 끝 없음)은 `SEASON0_FROM_V2` · `SEASON0_TO_V2` 로 남겼다 (1-4).
   */
  it('★2026-09-03 07:00 KST★ 에서 시작한다', () => {
    expect(SEASON0_FROM.toISOString()).toBe('2026-09-02T22:00:00.000Z')
    const kst = new Date(SEASON0_FROM.getTime() + 9 * 60 * 60 * 1000)
    expect(kst.toISOString()).toBe('2026-09-03T07:00:00.000Z')
  })

  it('★2026-10-01 00:00 KST 에 끝난다★ — 10월 첫째 목요일', () => {
    expect(SEASON0_TO?.toISOString()).toBe('2026-09-30T15:00:00.000Z')
    const kst = new Date((SEASON0_TO as Date).getTime() + 9 * 60 * 60 * 1000)
    expect(kst.toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })

  it('★창 밖은 앞뒤 양쪽으로 잘린다★ — 끝이 생겼으므로 상한도 붙는다', () => {
    const where = season0MatchWhere()
    expect(where.startAt.gte.getTime()).toBe(SEASON0_FROM.getTime())
    expect(where.startAt.lt?.getTime()).toBe((SEASON0_TO as Date).getTime())
  })

  /**
   * ⚠ 2026-09-01 — `nexon_barracks` 를 더했다. 이 단언이 그 자물쇠다.
   *
   * IPL(`nolink`)의 경기는 병영수첩에서 왔고 `origin='nexon_barracks'` 다.
   * 이 목록에 없어서 **시즌0 집계에서 통째로 빠져 있었다** — `season0 --leagues nolink`
   * 가 선수 0명·클랜 0개를 돌려줬다. 맨 뒤에 둔 것은 중복 제거에서 미러·넥슨이
   * 먼저 이기게 하기 위해서다. 옛 값은 `SEASON0_ORIGINS_V1` 에 남아 있다.
   */
  /**
   * ⚠ ★2026-09-20 — `sacloud` 를 더했다★ (C1 리그). 같은 병을 두 번째로 밟은 날이다.
   *
   *   C1 경기는 우리가 직접 담아 `Match.origin` 기본값 `sacloud` 가 박히는데
   *   이 목록에 없어서 ★「선수 0 · 클랜 0」★ 이 나왔다 — 2026-09-01 의 IPL 과 판박이다.
   *
   * ⚠ ★이 시험은 「목록을 통째로 외우는」 꼴이었다.★ 그래서 2026-09-20 에
   *   ★옳은 수정을 막았다★ (비판 검수가 짚은 그대로다). 이제 외우지 않고
   *   ★지켜야 할 것 둘★ 만 본다 —
   *     ① 아는 출처가 ★빠지지 않았는가★ (빠지면 그 리그가 통째로 사라진다)
   *     ② ★미러가 맨 앞인가★ (중복이면 앞이 이긴다 — 원본이 이겨야 한다)
   *   새 출처를 더하는 것은 ★막지 않는다.★ 더할 때마다 이 시험을 고치게 하면
   *   사람이 시험을 미워하게 된다.
   */
  it('아는 출처가 하나도 빠지지 않았다 · 미러가 맨 앞이다', () => {
    const 있어야 = ['3rd.supply', 'nexon', 'nexon_barracks', 'sacloud']
    for (const o of 있어야) {
      expect([...SEASON0_ORIGINS], `★${o} 가 빠지면 그 경기가 집계에서 통째로 사라진다★`).toContain(o)
    }
    /* 중복이면 앞이 이긴다 — 미러가 맨 앞이어야 원본이 남는다 */
    expect(SEASON0_ORIGINS[0]).toBe('3rd.supply')
    /* 조회 조건과 상수가 ★한 곳에서 나온다★ */
    expect(season0MatchWhere().origin.in).toEqual([...SEASON0_ORIGINS])
  })

  it('옛 목록을 지우지 않았다 (CLAUDE.md 1-4)', () => {
    expect([...SEASON0_ORIGINS_V1]).toEqual(['3rd.supply', 'nexon'])
    /* 2026-09-20 판 — `sacloud` 를 더하기 직전 */
    expect([...SEASON0_ORIGINS_V2]).toEqual(['3rd.supply', 'nexon', 'nexon_barracks'])
  })

  it('replay 범위와 조회 범위가 같은 값에서 나온다', () => {
    const scope = season0Scope()
    const where = season0MatchWhere()
    expect(scope.origins).toEqual(where.origin.in)
    expect(scope.from.getTime()).toBe(where.startAt.gte.getTime())
    expect(scope.to?.getTime()).toBe((SEASON0_TO as Date).getTime())
  })

  it('시즌0 은 Season 표에서 번호 0 · beta 다', () => {
    expect(SEASON0_NUMBER).toBe(0)
    expect(SEASON0_TYPE).toBe('beta')
  })
})
