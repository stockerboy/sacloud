/**
 * IPL **클랜 성적** 계산 (순수 함수).
 *
 * ── 왜 새로 만드나
 *   클랜랭킹은 `LeagueClan.{rating, win, lose, placement}` 를 **직접 읽는다**
 *   (`getClanRanks`). 그 값을 채워 주는 경로가 IPL 에는 없었다 —
 *   ```
 *   season0Apply   origin 필터에 `nexon_barracks` 가 없어 nolink 가 통째로 빠진다
 *   rate.ts        origin='nexon' + **참가자**가 있어야 돈다. IPL 은 둘 다 없다
 *   supplyRollup   3rd.supply 가 준 클랜랭킹을 옮기는 것. IPL 은 우리 리그라 원본이 없다
 *   ```
 *   그래서 IPL 은 경기 결과만으로 클랜 성적을 만든다.
 *
 * ── 참가자 없이도 되는 이유
 *   래더 공식은 **킬·데스·MVP·딜량을 쓰지 않는다** (`CLAUDE.md` 3-B 3번).
 *   쓰는 것은 양 클랜의 래더와 승패뿐이다. 그래서 라인업을 몰라도 클랜 래더는 계산된다.
 *
 * ── ⚠ 구성 가중치는 **걸지 않는다** (그리고 그것을 숨기지 않는다)
 *   D-172 는 그 경기에 나간 **본클랜원 수**로 증감을 곱한다 — 용병 4명으로 이겨도 점수를
 *   다 받지 못하게 하는 규칙이다. 그런데 IPL 원문에는 **참가자가 없다** (칸 44개에 선수 칸 0개).
 *   모르는 값을 1 로 가정하지 않고, **가중치를 아예 적용하지 않는다**고 명시한다.
 *   배틀로그가 모이면 그때 다시 계산한다 — replay 가 결정적이라 언제든 다시 매길 수 있다.
 *
 * ── 결정적 replay
 *   `startAt` 오름차순으로 처음부터 다시 계산한다. "이번에 들어온 경기만 증분" 하지 않는다 —
 *   그러면 순서에 따라 값이 달라진다 (`rate.ts` 와 같은 원칙).
 *   래더는 **실수로 누적**하고 **마지막에 한 번만 반올림**한다. 경기마다 반올림하면 제로섬이 깨진다.
 */
import {
  DEFAULT_RATING_CONSTANTS,
  clanRatingUpdate,
  roundHalfUp,
  type RatingConstants,
} from '@sacloud/rating'

/** 계산에 필요한 것만. `startAt` 오름차순으로 들어와야 한다 */
export interface StandingMatch {
  redLeagueClanId: string
  blueLeagueClanId: string
  winnerSide: string
}

export interface ClanStanding {
  leagueClanId: string
  win: number
  lose: number
  games: number
  /** 반올림한 최종 래더 */
  rating: number
  /** 아직 배치고사 중인가 — 랭킹에 올라가지 않는다 */
  placement: boolean
  /** 배치고사로 치른 판수 */
  placementPlayed: number
}

interface Running {
  win: number
  lose: number
  games: number
  /** 실수로 들고 있는다. 마지막에 한 번만 반올림한다 */
  rating: number
}

export interface StandingOptions {
  constants?: RatingConstants
  /** 시작 래더. `LeagueClan.rating` 의 기본값과 같아야 한다 */
  startRating?: number
}

export const IPL_START_RATING = 3000

/**
 * 경기들을 순서대로 재생해 클랜 성적을 만든다.
 *
 * @param matches `startAt` 오름차순
 */
export function computeClanStandings(
  matches: readonly StandingMatch[],
  options: StandingOptions = {},
): Map<string, ClanStanding> {
  const constants = options.constants ?? DEFAULT_RATING_CONSTANTS
  const startRating = options.startRating ?? IPL_START_RATING
  const placementMatches = constants.placementMatches

  const state = new Map<string, Running>()
  const of = (id: string): Running => {
    let s = state.get(id)
    if (!s) {
      s = { win: 0, lose: 0, games: 0, rating: startRating }
      state.set(id, s)
    }
    return s
  }

  for (const m of matches) {
    if (m.redLeagueClanId === m.blueLeagueClanId) continue // 있을 수 없는 경기다
    if (m.winnerSide !== 'red' && m.winnerSide !== 'blue') continue // 무승부는 애초에 안 들어온다

    const red = of(m.redLeagueClanId)
    const blue = of(m.blueLeagueClanId)

    /* 배치고사 여부는 **그 경기 직전**의 판수로 정한다 */
    const redPlacement = red.games < placementMatches
    const bluePlacement = blue.games < placementMatches

    const redWon = m.winnerSide === 'red'

    const redResult = clanRatingUpdate({
      ratingBefore: red.rating,
      opponentRating: blue.rating,
      outcome: redWon ? 'win' : 'lose',
      isPlacement: redPlacement,
      constants,
    })
    const blueResult = clanRatingUpdate({
      ratingBefore: blue.rating,
      opponentRating: red.rating,
      outcome: redWon ? 'lose' : 'win',
      isPlacement: bluePlacement,
      constants,
    })

    /* 하한 밑으로 내려가지 않는다 */
    red.rating = Math.max(constants.ratingFloor, red.rating + redResult.ratingUpdate)
    blue.rating = Math.max(constants.ratingFloor, blue.rating + blueResult.ratingUpdate)

    red.games += 1
    blue.games += 1
    if (redWon) {
      red.win += 1
      blue.lose += 1
    } else {
      blue.win += 1
      red.lose += 1
    }
  }

  const out = new Map<string, ClanStanding>()
  for (const [leagueClanId, s] of state) {
    out.set(leagueClanId, {
      leagueClanId,
      win: s.win,
      lose: s.lose,
      games: s.games,
      rating: roundHalfUp(s.rating),
      placement: s.games < placementMatches,
      placementPlayed: Math.min(s.games, placementMatches),
    })
  }
  return out
}
