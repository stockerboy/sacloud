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
import { DEFAULT_RATING_CONSTANTS, V2_RATING_CONSTANTS } from '@sacloud/rating'
import {
  CLAN_RANK_BY,
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

/*
 * ⚠ ★2026-09-21 — 아래 두 시험은 「옛 Elo 방식의 성질」 이다★
 *
 *   사장님이 「★그냥 기록순으로만★ 랭킹내기고」 라 하셔서 `CLAN_RANK_BY = 'record'`
 *   (승률을 판수로 누른 값)로 바꿨다. 기록순에서는 ★배치고사 중에도 점수가 움직이고★
 *   ★`startRating` 이 쓰이지 않는다★ — 그래서 이 둘이 깨진다.
 *
 *   ★지우지 않는다★ (`CLAUDE.md` 1-4). Elo 로 되돌리면 그대로 다시 지켜져야 한다.
 *   기록순의 성질은 아래 「기록순」 묶음이 따로 본다.
 */
describe.runIf(CLAN_RANK_BY === 'elo')('배치고사 — 10판을 채울 때까지 래더가 움직이지 않는다 (옛 Elo)', () => {
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

  it.runIf(CLAN_RANK_BY === 'elo')('시작 래더를 바꿀 수 있다 (옛 Elo)', () => {
    const s = computeClanStandings([m('red')], { startRating: 2500 })
    expect(s.get('A')!.rating).toBe(2500)
  })
})

/**
 * ★★기록순 — 사장님이 보시는 순서가 승률과 맞는가★★ (2026-09-21)
 *
 * > 「순위 이거 맞냐 진심」 — 48% 가 1위이고 63% 가 2위이던 화면을 보시고.
 *
 * 여기서 보는 것은 ★숫자가 아니라 성질★ 이다 — 상수를 바꿔도 그대로 통과한다.
 */
describe.runIf(CLAN_RANK_BY === 'record')('기록순 — 승률이 순서를 정한다', () => {
  /** A 가 n 번 이기고 B 가 m 번 이긴 판들 */
  function games(aWins: number, bWins: number): StandingMatch[] {
    return [
      ...Array.from({ length: aWins }, () => m('red')),
      ...Array.from({ length: bWins }, () => m('blue')),
    ]
  }

  it('★같은 판수면 많이 이긴 쪽이 위다★', () => {
    const s = computeClanStandings(games(30, 10))
    expect(s.get('A')!.rating).toBeGreaterThan(s.get('B')!.rating)
  })

  it('★48% 가 63% 를 못 넘는다★ — 그 화면이 다시 나오면 안 된다', () => {
    /* 판수를 실제 C1 만큼 벌려 둔다 — 많이 뛴 쪽이 유리하더라도 넘지는 못한다 */
    const many = computeClanStandings(games(72, 78)).get('A')!   // 48.0% · 150판
    const few = computeClanStandings(games(26, 15)).get('A')!    // 63.4% · 41판
    expect(many.rating).toBeLessThan(few.rating)
  })

  it('★판이 적으면 가운데로 눌린다★ — 두 판 이겨서 1등이 안 된다', () => {
    const tiny = computeClanStandings(games(2, 0)).get('A')!     // 100% · 2판
    const solid = computeClanStandings(games(120, 80)).get('A')! // 60% · 200판
    expect(tiny.rating).toBeLessThan(solid.rating)
  })

  it('★전부 이겨도 전부 진 쪽보다는 위다★ — 방향이 뒤집히지 않는다', () => {
    const all = computeClanStandings(games(20, 0))
    expect(all.get('A')!.rating).toBeGreaterThan(all.get('B')!.rating)
  })
})

/** 위 테스트에서 쓰는 짧은 도우미 */
function s5(games: StandingMatch[]) {
  return computeClanStandings(games)
}

/**
 * 배치고사 폐지를 IPL 클랜에도 건다 (2026-09-02 · D-258).
 *
 * `iplClanRollup` 이 상수를 안 넘기던 탓에 `DEFAULT_RATING_CONSTANTS`(10판)가 쓰였다.
 * 그러면 **10판 미만 클랜이 `placement=true` 가 되어 클랜랭킹에서 통째로 빠진다** —
 * `iplClanRollup.top` 이 `!r.placement` 로 거르고 화면도 같은 칸을 본다.
 *
 * 위 `describe` 들은 **옛 동작(10판)을 그대로 고정해 둔다.** 지우지 않는다 —
 * `DEFAULT` 를 쓰는 다른 경로가 남아 있고, 그 경로의 규칙은 바뀌지 않았다 (CLAUDE.md 10-4).
 */
describe('배치고사 폐지 — V2 상수를 넘겼을 때 (D-258)', () => {
  const v2 = { constants: V2_RATING_CONSTANTS }

  it('V2 는 배치고사가 0판이다', () => {
    expect(V2_RATING_CONSTANTS.placementMatches).toBe(0)
  })

  it('한 판만 뛰어도 랭킹에 올라간다 — 화면 문구 「한 경기부터 바로 반영」이 참이 된다', () => {
    expect(computeClanStandings([m('red')], v2).get('A')!.placement).toBe(false)
    expect(computeClanStandings([m('red')], v2).get('B')!.placement).toBe(false)
  })

  it('첫 판부터 래더가 움직인다 — 보류 구간이 없다', () => {
    const s = computeClanStandings([m('red')], v2)
    expect(s.get('A')!.rating).toBeGreaterThan(IPL_START_RATING)
    expect(s.get('B')!.rating).toBeLessThan(IPL_START_RATING)
  })

  it('상수를 안 넘기면 옛 동작(10판)이 그대로다 — 기본값을 바꾸지 않았다', () => {
    const games = Array.from({ length: PLACEMENT - 1 }, () => m('red'))
    expect(computeClanStandings(games).get('A')!.placement).toBe(true)
    expect(computeClanStandings(games, v2).get('A')!.placement).toBe(false)
  })
})
