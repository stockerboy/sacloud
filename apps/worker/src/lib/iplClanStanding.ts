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

/**
 * ★클랜 순위를 무엇으로 세우나★ (2026-09-21 사장님: 「그냥 기록순으로만」)
 *
 *   `'record'`  ★승률을 판수로 누른 값★ — 지금 이것
 *   `'elo'`     옛 방식. 상대가 세면 더 받는다 (`CLAUDE.md` 1-4 · 한 글자로 돌아온다)
 */
type ClanRankBy = 'record' | 'elo'
export const CLAN_RANK_BY = 'record' as ClanRankBy

/**
 * ★판수 수축★ — 판이 이만큼일 때 「제 승률 반, 리그 평균 반」 이 된다.
 *
 * 실측(C1 2026-09-21)으로 고른 값이다. 클랜 판수가 ★41 ~ 320판★ 으로 벌어져 있어서
 * 수축이 없으면 ★41판짜리가 320판짜리를 넘는다.★ 40 이면 —
 * ```
 * grave   26승15패(41판)  63.4% → 56.8%
 * igloo  131승89패(220판) 59.5% → 58.1%   ← 많이 뛴 쪽이 덜 깎인다
 * ```
 */
export const CLAN_SHRINK_GAMES = 40
/**
 * ★★판수를 한 번 더 곱한다★★ (2026-09-21 사장님: 「클랜랭킹 grave ★5등이랑 6등 사이★ 에
 * 넣는 점수 시스템 생각해봐」)
 *
 * ── 수축만으로는 안 됐다 (실측)
 *
 *   grave 는 ★41판에 63.4%★ 다. 수축(`CLAN_SHRINK_GAMES`)을 40 → 400 까지 올려 봤지만
 *   ★4위에서 더 안 내려갔다.★ 승률이 워낙 높아 눌려도 위에 남는다.
 *   ```
 *   C=40   grave 3위      C=150  grave 4위
 *   C=100  grave 4위      C=400  grave 4위   ← 더 올려도 그대로
 *   ```
 *
 * ── 그래서 ★신뢰★ 를 곱한다 — 개인 점수와 ★같은 모양★ 이다
 *
 *   ```
 *   신뢰 = 판 / (판 + CLAN_TRUST_GAMES)
 *   점수 = 기준점 + (눌린승률 − 0.5) × SPREAD × ★신뢰★
 *   ```
 *   판이 적으면 ★평균(기준점) 쪽으로 끌려온다.★ 승률이 높아도 적게 뛰었으면 못 올라간다.
 *
 *   ★실측 — 160 에서 사장님이 말씀하신 자리가 나온다★
 *   ```
 *   4위 〃veritas 53.8% (160판)
 *   5위 grave     63.4% ( 41판)   ← 5등과 6등 사이
 *   6위 hardcores 53.2% ( 62판)
 *   ```
 *
 * ⚠ IPL·PL 은 클랜 판수가 ★수천 판★ 이라 신뢰가 0.98 을 넘는다 — 사실상 안 바뀐다.
 *   이 값이 실제로 일하는 곳은 ★판수가 41~320 으로 벌어진 C1★ 이다.
 */
export const CLAN_TRUST_GAMES = 160

/** 승률 50% 가 받는 점수. 화면은 100 으로 나눠 «30.0층» 으로 적는다 */
export const CLAN_RATING_BASE = 3000
/**
 * 승률 1.0 과 0.0 의 거리.
 * ⚠ ★2026-09-21 — 2000 → 4000★ 으로 키웠다. 위 「신뢰」 가 점수를 가운데로 끌어당겨
 *   ★열 클랜이 28.6~30.9층 안에 다 몰렸다.★ 사람이 차이를 못 읽는다.
 *   키우니 27.2~31.9층으로 벌어진다 — ★순서는 그대로고 간격만 넓어진다.★
 */
export const CLAN_RATING_SPREAD = 4000

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

  /*
   * ★★클랜 순위를 「기록순」 으로 센다★★ (2026-09-21 사장님)
   *
   * > 「★그냥 기록순으로만★ 랭킹내기고 c1에서도 기록순으로 매기면 된다」
   * > 「순위 이거 맞냐 진심 그리고 어케 이렇게 되는거야」  ← 48% 가 1위인 화면을 보시고
   *
   * ── 무엇이 문제였나
   *   클랜 점수는 ★Elo★ 였다 — 상대가 세면 더 받고 약하면 덜 받는다.
   *   그래서 ★승률과 순서가 따로 놀았다.★ 실측(C1 2026-09-21) —
   *   ```
   *   1위 methodcrew 48.0% (72승78패)      6위 amaryllis 35.6%
   *   2위 grave      63.4% (26승15패)      5위 vuvuzela  44.4%
   *   ```
   *   ★1위가 2위보다 승률이 15%p 낮다.★ 사람이 볼 수 있는 순서가 아니다.
   *
   * ── 새 셈 — 개인과 ★같은 원리★ 다 (승률을 판수로 누른다)
   *   ```
   *   눌린승률 = (승 + 리그평균승률 × C) / (판 + C)      C = CLAN_SHRINK_GAMES
   *   점수     = 기준점 + (눌린승률 − 0.5) × SPREAD
   *   ```
   *   판이 적으면 리그 평균 쪽으로 끌려온다 — ★두 판 이겨서 1위★ 가 안 나온다.
   *   (그 위에 랭킹 목록이 20판 문턱을 따로 건다 — 사장님: 「판수 없는 클랜 싫어해」)
   *
   * ⚠ ★옛 Elo 를 지우지 않았다★ (`CLAUDE.md` 1-4) — 위 루프가 그대로 돌고 있고,
   *   `CLAN_RANK_BY = 'elo'` 한 글자로 돌아온다. DB 값도 다시 돌리면 복구된다.
   */
  const ranked = [...state.values()].filter((s) => s.games >= placementMatches)
  const totalGames = ranked.reduce((n, s) => n + s.games, 0)
  const leagueWinRate = totalGames > 0 ? ranked.reduce((n, s) => n + s.win, 0) / totalGames : 0.5

  const out = new Map<string, ClanStanding>()
  for (const [leagueClanId, s] of state) {
    const shrunk =
      s.games > 0
        ? (s.win + leagueWinRate * CLAN_SHRINK_GAMES) / (s.games + CLAN_SHRINK_GAMES)
        : leagueWinRate
    /* ★판이 적으면 평균 쪽으로 끌려온다★ — 개인 점수의 `shrink` 와 같은 모양이다 */
    const trust = s.games > 0 ? s.games / (s.games + CLAN_TRUST_GAMES) : 0
    const record = CLAN_RATING_BASE + (shrunk - 0.5) * CLAN_RATING_SPREAD * trust
    out.set(leagueClanId, {
      leagueClanId,
      win: s.win,
      lose: s.lose,
      games: s.games,
      rating: roundHalfUp(CLAN_RANK_BY === 'record' ? record : s.rating),
      placement: s.games < placementMatches,
      placementPlayed: Math.min(s.games, placementMatches),
    })
  }
  return out
}
