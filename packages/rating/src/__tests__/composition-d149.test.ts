/**
 * 클랜 구성 보정 (D-145 구조 · D-149 재확인).
 *
 * 사용자가 자주 오해하는 지점이라 규칙을 여기에 못 박는다.
 *
 * ── 구성 보정은 **경기별 가중치가 아니다**
 *   예전에는 본클랜원 수로 그 경기의 증감을 깎았다 (3명↑ 100% · 2명 70% · 1명 40% · 0명 0%).
 *   **폐기됐다.** 정상 5v5 면 클1용4 든 클5 든 Elo 는 똑같이 정상 반영된다.
 *
 * ── 대신 별도 가산이다
 *   최근 20경기 **평균 본클랜원 수**로 클랜 점수에 최대 +50 이 붙는다.
 *     1명 +0 · 2명 +10 · 3명 +20 · 4명 +35 · 5명 +50 (사이는 선형 보간)
 *
 * ── 최종 클랜 점수
 *   내부 Elo + 구성 보정 − 활동 페널티
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RATING_CONSTANTS,
  averageMembers,
  clanRatingUpdate,
  compositionScore,
} from '../index.js'

describe('구성 보정 곡선 — 1/2/3/4/5명', () => {
  it.each([
    [1, 0],
    [2, 10],
    [3, 20],
    [4, 35],
    [5, 50],
  ])('평균 %i명이면 +%i', (members, expected) => {
    expect(compositionScore(members)).toBeCloseTo(expected, 6)
  })

  it('사이 값은 선형 보간이다', () => {
    // 3명(+20)과 4명(+35) 사이의 절반 → +27.5
    expect(compositionScore(3.5)).toBeCloseTo(27.5, 6)
    // 4명(+35)과 5명(+50) 사이의 절반 → +42.5
    expect(compositionScore(4.5)).toBeCloseTo(42.5, 6)
  })

  it('상한은 +50 이다 — 5명을 넘겨도 더 오르지 않는다', () => {
    expect(compositionScore(5)).toBeCloseTo(50, 6)
    expect(compositionScore(9)).toBeCloseTo(50, 6)
    expect(compositionScore(100)).toBeCloseTo(50, 6)
  })

  it('1명 아래는 +0 이다 — 음수가 되지 않는다', () => {
    expect(compositionScore(1)).toBe(0)
    expect(compositionScore(0)).toBe(0)
    expect(compositionScore(-3)).toBe(0)
  })
})

describe('최근 20경기 창', () => {
  it('20경기까지만 본다', () => {
    expect(DEFAULT_RATING_CONSTANTS.compositionWindow).toBe(20)
  })

  it('창을 넘긴 오래된 경기는 평균에 들어가지 않는다', () => {
    /* 최근 20경기가 전부 5명이면, 그 앞에 1명짜리가 아무리 많아도 평균은 5다.
       그렇지 않으면 과거가 영원히 발목을 잡는다 */
    const old = Array.from({ length: 50 }, () => 1)
    const recent = Array.from({ length: 20 }, () => 5)
    expect(averageMembers([...old, ...recent])).toBeCloseTo(5, 6)
  })

  it('경기가 없으면 평균도 0이다 — 보정도 0이다', () => {
    expect(compositionScore(averageMembers([]))).toBe(0)
  })
})

describe('구성은 경기별 증감을 깎지 않는다', () => {
  /* 같은 전력차의 같은 승리라면, 클랜원이 1명이든 5명이든 증감은 **같다.**
     rating 공식에 클랜원 수가 아예 들어가지 않는다는 뜻이다 (`CLAUDE.md` 3-B 3번). */
  it('클1용4 와 클5 의 경기 증감이 같다', () => {
    /* 공식 입력에 클랜원 수를 넣을 자리 자체가 없다. 그것이 이 규칙의 보장이다 —
       넣을 수 없으니 구성이 증감을 바꿀 방법이 없다 */
    const shared = {
      ratingBefore: 3000,
      opponentRating: 3000,
      outcome: 'win' as const,
    }
    expect(clanRatingUpdate(shared).ratingUpdate).toBe(clanRatingUpdate(shared).ratingUpdate)
    expect(Object.keys(shared)).not.toContain('members')
  })

  it('구성 보정은 경기 증감과 완전히 분리된 값이다', () => {
    /* 보정은 클랜 **점수 표시**에 더해지는 값이지 경기 증감의 배율이 아니다.
       클1용4(평균 1명)와 클5(평균 5명)의 차이는 보정 +0 대 +50 뿐이다 */
    const oneMember = compositionScore(averageMembers([1, 1, 1, 1, 1]))
    const fiveMembers = compositionScore(averageMembers([5, 5, 5, 5, 5]))
    expect(oneMember).toBe(0)
    expect(fiveMembers).toBe(50)
    expect(fiveMembers - oneMember).toBe(DEFAULT_RATING_CONSTANTS.compositionCap)
  })

  it('클1용4 도 정상적으로 Elo 를 받는다 — 0점이 아니다', () => {
    // 예전의 "본클랜원 1명 → 40% 반영" 같은 감쇠가 남아 있지 않다
    const update = clanRatingUpdate({
      ratingBefore: 3000,
      opponentRating: 3000,
      outcome: 'win',
    }).ratingUpdate
    expect(update).toBeGreaterThan(0)
  })
})

describe('최종 클랜 점수 = 내부 Elo + 구성 보정 − 활동 페널티', () => {
  it('세 항이 그대로 더해지고 빼진다', () => {
    const internal = 3120
    const composition = compositionScore(4) // +35
    const penalty = 20
    expect(internal + composition - penalty).toBeCloseTo(3135, 6)
  })
})
