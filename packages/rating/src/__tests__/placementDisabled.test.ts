/**
 * 배치고사 폐지 회귀 테스트 (2026-09-01 사장님 지시).
 *
 * > "배치고사 모드 삭제 배치고사 없이 바로 시작점수부터 1판하자마자 바로바로 시작"
 *
 * 여기서 고정하는 것은 세 가지다.
 *   1. 운영 상수(`V2_RATING_CONSTANTS`)의 배치고사는 **0경기**다
 *   2. **옛 값(10경기)은 지워지지 않았다** (`CLAUDE.md` 10-4) — `PLACEMENT_MATCHES_V1`
 *   3. 첫 경기부터 **래더가 실제로 움직인다** — `rating_update = 0` 이 아니다
 *
 * 3번이 이 파일의 진짜 목적이다. 상수만 0 으로 내려 두고 호출자가
 * `placementPlayerIds` 를 계속 채우면 화면은 그대로 배치고사로 남는다.
 * 실제로 `jobs/season0.ts` 에 `const PLACEMENT = 10` 이 박혀 있어서 그런 상태였다.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RATING_CONSTANTS,
  PLACEMENT_MATCHES,
  PLACEMENT_MATCHES_V1,
  V2_RATING_CONSTANTS,
  personalRatingUpdate,
  rateMatch,
  type ConfirmedParticipant,
} from '../index.js'

const RED = 'LC-RED'
const BLUE = 'LC-BLUE'

/** 정상 5v5 — 래더 대상 조건이다 (D-145 · eligibility) */
function match(): ConfirmedParticipant[] {
  const make = (
    id: string,
    leagueClanId: string,
    outcome: 'win' | 'lose',
  ): ConfirmedParticipant => ({
    playerId: id,
    rosterLeagueClanId: leagueClanId,
    outcome,
    kill: null,
    death: null,
    assist: null,
    sources: ['player_match_list'],
    ratingBefore: V2_RATING_CONSTANTS.initialRating,
  })
  return [
    ...Array.from({ length: 5 }, (_, i) => make(`R${i}`, RED, 'win')),
    ...Array.from({ length: 5 }, (_, i) => make(`B${i}`, BLUE, 'lose')),
  ]
}

describe('배치고사 폐지 (2026-09-01)', () => {
  it('운영 상수의 배치고사는 0경기다', () => {
    expect(PLACEMENT_MATCHES).toBe(0)
    expect(V2_RATING_CONSTANTS.placementMatches).toBe(0)
  })

  it('옛 값 10경기는 지워지지 않았다 (CLAUDE.md 10-4)', () => {
    expect(PLACEMENT_MATCHES_V1).toBe(10)
    /* IPL 클랜 집계(`lib/iplClanStanding.ts`)가 아직 이 상수를 쓴다.
       같이 움직이면 안 되므로 DEFAULT 는 옛 값 그대로여야 한다 */
    expect(DEFAULT_RATING_CONSTANTS.placementMatches).toBe(10)
  })

  it('배치고사 대상이 아무도 없으면 첫 경기부터 래더가 움직인다', () => {
    const rated = rateMatch({
      participants: match(),
      clanRatings: {
        [RED]: V2_RATING_CONSTANTS.initialRating,
        [BLUE]: V2_RATING_CONSTANTS.initialRating,
      },
      /* 배치고사가 폐지되면 호출자는 이 목록을 **빈 배열**로 넘긴다
         (`games < 0` 이 항상 거짓이라 아무도 담기지 않는다) */
      placementPlayerIds: [],
      placementClanIds: [],
      constants: V2_RATING_CONSTANTS,
      playerGames: Object.fromEntries(match().map((p) => [p.playerId, 0])),
    })

    expect(rated.eligibility.ratingEligible).toBe(true)
    expect(rated.players).toHaveLength(10)
    for (const player of rated.players) {
      expect(player.isPlacement).toBe(false)
      /* 첫 경기(0판)인데도 증감이 붙는다 — 이게 "1판하자마자 바로바로" 다 */
      expect(player.ratingUpdate).not.toBe(0)
    }
    /* 제로섬 — 같은 점수끼리 붙었으니 이긴 쪽과 진 쪽이 정확히 상쇄된다 */
    const drift = rated.players.reduce((sum, p) => sum + p.ratingUpdate, 0)
    expect(Math.abs(drift)).toBeLessThan(1e-9)
  })

  it('배치고사로 표시하면 여전히 0이다 — 규칙 자체를 지운 것은 아니다', () => {
    /* 폐지는 "판정 기준값을 0 으로 내린 것" 이지 공식에서 규칙을 뜯어낸 것이 아니다.
       옛 결과를 다시 재야 할 때 `PLACEMENT_MATCHES_V1` 로 그대로 재현된다 */
    const held = personalRatingUpdate({
      ratingBefore: 3000,
      opponentRating: 3200,
      outcome: 'win',
      isPlacement: true,
      constants: V2_RATING_CONSTANTS,
    })
    expect(held.ratingUpdate).toBe(0)
  })
})
