/**
 * IPL 클랜 성적 계산 테스트.
 *
 * 이 값이 그대로 **클랜랭킹 화면**이 된다. 틀리면 순위가 통째로 틀린다.
 * 특히 셋을 지킨다.
 *   ① 배치고사(10판 미만) 동안은 래더가 **움직이지 않는다**
 *   ② 배치고사가 끝나야 랭킹에 올라간다 (`placement=false`)
 *   ③ 같은 입력이면 언제나 같은 값이다 (결정적 replay)
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_RATING_CONSTANTS } from '@sacloud/rating'
import {
  computeClanStandings,
  IPL_START_RATING,
  type StandingMatch,
} from '../lib/iplClanStanding.js'

const PLACEMENT = DEFAULT_RATING_CONSTANTS.placementMatches

const m = (winner: 'red' | 'blue', red = 'A', blue = 'B'): StandingMatch => ({
  redLeagueClanId: red,
  blueLeagueClanId: blue,
  winnerSide: winner,
})

describe('computeClanStandings — 승패', () => {
  it('경기가 없으면 아무것도 없다', () => {
    expect(computeClanStandings([]).size).toBe(0)
  })

  it('이긴 쪽은 win, 진 쪽은 lose', () => {
    const s = computeClanStandings([m('red')])
    expect(s.get('A')).toMatchObject({ win: 1, lose: 0, games: 1 })
    expect(s.get('B')).toMatchObject({ win: 0, lose: 1, games: 1 })
  })

  it('여러 판을 누적한다', () => {
    const s = computeClanStandings([m('red'), m('blue'), m('red')])
    expect(s.get('A')).toMatchObject({ win: 2, lose: 1, games: 3 })
    expect(s.get('B')).toMatchObject({ win: 1, lose: 2, games: 3 })
  })

  it('양쪽이 같은 클랜인 경기는 무시한다 — 있을 수 없는 경기다', () => {
    expect(computeClanStandings([m('red', 'A', 'A')]).size).toBe(0)
  })

  it('승자가 red/blue 가 아니면 무시한다', () => {
    const bad: StandingMatch = { redLeagueClanId: 'A', blueLeagueClanId: 'B', winnerSide: 'draw' }
    expect(computeClanStandings([bad]).size).toBe(0)
  })
})

describe('배치고사 — 10판을 채울 때까지 래더가 움직이지 않는다', () => {
  it('배치고사 중에는 래더가 시작값 그대로다', () => {
    const games = Array.from({ length: PLACEMENT - 1 }, () => m('red'))
    const s = computeClanStandings(games)
    expect(s.get('A')!.rating).toBe(IPL_START_RATING)
    expect(s.get('B')!.rating).toBe(IPL_START_RATING)
  })

  it('배치고사 중에도 승패는 쌓인다', () => {
    const games = Array.from({ length: 5 }, () => m('red'))
    expect(s5(games).get('A')).toMatchObject({ win: 5, lose: 0, games: 5 })
  })

  it('10판을 채우기 전에는 placement 가 참이다 — 랭킹에 안 올라간다', () => {
    const games = Array.from({ length: PLACEMENT - 1 }, () => m('red'))
    expect(computeClanStandings(games).get('A')!.placement).toBe(true)
  })

  it('10판을 채우면 placement 가 거짓이 된다', () => {
    const games = Array.from({ length: PLACEMENT }, () => m('red'))
    expect(computeClanStandings(games).get('A')!.placement).toBe(false)
  })

  it('배치고사가 끝난 뒤부터 래더가 움직인다', () => {
    const games = Array.from({ length: PLACEMENT + 1 }, () => m('red'))
    const s = computeClanStandings(games)
    expect(s.get('A')!.rating).toBeGreaterThan(IPL_START_RATING)
    expect(s.get('B')!.rating).toBeLessThan(IPL_START_RATING)
  })

  it('placementPlayed 는 10을 넘지 않는다', () => {
    const games = Array.from({ length: PLACEMENT + 5 }, () => m('red'))
    expect(computeClanStandings(games).get('A')!.placementPlayed).toBe(PLACEMENT)
  })
})

describe('래더', () => {
  const past = (n: number, winner: 'red' | 'blue' = 'red') =>
    Array.from({ length: PLACEMENT }, () => m('red', 'A', 'Z'))
      .concat(Array.from({ length: PLACEMENT }, () => m('red', 'B', 'Y')))
      .concat(Array.from({ length: n }, () => m(winner)))

  it('이기면 오르고 지면 내린다', () => {
    const won = computeClanStandings(past(1, 'red'))
    expect(won.get('A')!.rating).toBeGreaterThan(won.get('B')!.rating)
  })

  it('래더는 하한 밑으로 안 내려간다', () => {
    /* 계속 지기만 해도 바닥에서 멈춘다 */
    const many = past(500, 'red')
    const s = computeClanStandings(many)
    expect(s.get('B')!.rating).toBeGreaterThanOrEqual(DEFAULT_RATING_CONSTANTS.ratingFloor)
  })

  it('같은 입력이면 같은 값이다 — 결정적 replay', () => {
    const games = past(30, 'red')
    const a = computeClanStandings(games)
    const b = computeClanStandings(games)
    for (const [id, v] of a) expect(b.get(id)).toEqual(v)
  })

  it('시작 래더를 바꿀 수 있다', () => {
    const s = computeClanStandings([m('red')], { startRating: 2500 })
    expect(s.get('A')!.rating).toBe(2500)
  })
})

/** 위 테스트에서 쓰는 짧은 도우미 */
function s5(games: StandingMatch[]) {
  return computeClanStandings(games)
}
