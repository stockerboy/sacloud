/**
 * 시즌 종류별 예외 회귀 테스트 (D-112).
 *
 * 여기서 고정하는 것은 두 가지다.
 *   1. **Beta는 1경기부터** 래더를 계산한다 (배치고사 면제)
 *   2. **정식 시즌은 기존 배치고사 10경기 그대로다** — Beta 때문에 깨지면 안 된다
 *
 * 2번이 이 파일의 진짜 목적이다. 예외를 넣을 때 가장 위험한 것은
 * "예외가 본 규칙까지 바꿔 버리는 것"이다.
 */
import { describe, expect, it } from 'vitest'
import {
  constantsForSeason,
  DEFAULT_RATING_CONSTANTS,
  DEFAULT_SEASON_POLICY,
  rateMatch,
  type ConfirmedParticipant,
} from '../index.js'

const OFFICIAL_SEASON = { seasonType: 'official' }
const BETA_SEASON = { seasonType: 'beta' }
const LEGACY_SEASON = { seasonType: 'legacy' }

const RED = 'LC-RED'
const BLUE = 'LC-BLUE'

/** 3v3 공식 경기 하나 (양 팀 본클랜원 3명 → D-079 충족) */
function match(): ConfirmedParticipant[] {
  const make = (
    id: string,
    clan: string,
    outcome: 'win' | 'lose',
  ): ConfirmedParticipant => ({
    playerId: id,
    rosterLeagueClanId: clan,
    detailLeagueClanId: clan,
    outcome,
    kill: 10,
    death: 8,
    assist: 2,
    sources: ['player_match_list'],
    ratingBefore: 1500,
  })
  return [
    make('R1', RED, 'win'),
    make('R2', RED, 'win'),
    make('R3', RED, 'win'),
    make('B1', BLUE, 'lose'),
    make('B2', BLUE, 'lose'),
    make('B3', BLUE, 'lose'),
  ]
}

describe('시즌 종류에 따른 상수', () => {
  it('Beta는 배치고사를 면제한다 (1경기부터 래더 계산)', () => {
    const constants = constantsForSeason(DEFAULT_RATING_CONSTANTS, BETA_SEASON)
    expect(constants.placementMatches).toBe(0)
  })

  it('정식 시즌은 기존 배치고사 기준을 그대로 쓴다', () => {
    const constants = constantsForSeason(DEFAULT_RATING_CONSTANTS, OFFICIAL_SEASON)
    expect(constants.placementMatches).toBe(DEFAULT_RATING_CONSTANTS.placementMatches)
    expect(constants.placementMatches).toBe(10)
  })

  it('과거(legacy) 시즌도 건드리지 않는다', () => {
    expect(constantsForSeason(DEFAULT_RATING_CONSTANTS, LEGACY_SEASON).placementMatches).toBe(10)
  })

  it('시즌을 모르면 기본값 그대로다', () => {
    expect(constantsForSeason(DEFAULT_RATING_CONSTANTS, null).placementMatches).toBe(10)
    expect(constantsForSeason(DEFAULT_RATING_CONSTANTS, undefined).placementMatches).toBe(10)
  })

  it('예외를 끄면 Beta도 기존 정책을 따른다 (스위치가 실제로 동작한다)', () => {
    const off = constantsForSeason(DEFAULT_RATING_CONSTANTS, BETA_SEASON, {
      ...DEFAULT_SEASON_POLICY,
      betaImmediateRating: false,
    })
    expect(off.placementMatches).toBe(10)
  })

  it('배치고사 말고 다른 상수는 바꾸지 않는다', () => {
    const beta = constantsForSeason(DEFAULT_RATING_CONSTANTS, BETA_SEASON)
    const { placementMatches: _betaPlacement, ...betaRest } = beta
    const { placementMatches: _basePlacement, ...baseRest } = DEFAULT_RATING_CONSTANTS
    expect(betaRest).toEqual(baseRest)
  })
})

describe('실제 계산에 미치는 영향', () => {
  it('Beta — 첫 경기부터 래더가 움직인다', () => {
    const constants = constantsForSeason(DEFAULT_RATING_CONSTANTS, BETA_SEASON)
    const rated = rateMatch({
      participants: match(),
      clanRatings: { [RED]: 1500, [BLUE]: 1500 },
      // 첫 경기이므로 원래대로면 전원 배치고사 대상이다
      placementPlayerIds: [],
      placementClanIds: [],
      constants,
    })

    expect(rated.eligibility.official).toBe(true)
    expect(rated.players.every((player) => player.isPlacement)).toBe(false)
    expect(rated.players.some((player) => player.ratingUpdate !== 0)).toBe(true)
    expect(rated.clans.some((clan) => clan.ratingUpdate !== 0)).toBe(true)
  })

  it('정식 시즌 — 배치고사 중이면 래더가 0이다 (기존 정책 유지)', () => {
    const constants = constantsForSeason(DEFAULT_RATING_CONSTANTS, OFFICIAL_SEASON)
    const participants = match()
    const rated = rateMatch({
      participants,
      clanRatings: { [RED]: 1500, [BLUE]: 1500 },
      // 10경기 미만이면 배치고사 대상이다
      placementPlayerIds: participants.map((participant) => participant.playerId),
      placementClanIds: [RED, BLUE],
      constants,
    })

    expect(rated.eligibility.official).toBe(true)
    expect(rated.players.every((player) => player.isPlacement)).toBe(true)
    expect(rated.players.every((player) => player.ratingUpdate === 0)).toBe(true)
    expect(rated.clans.every((clan) => clan.ratingUpdate === 0)).toBe(true)
  })

  it('Beta 예외가 정식 시즌의 배치고사 판정을 바꾸지 않는다', () => {
    const beta = constantsForSeason(DEFAULT_RATING_CONSTANTS, BETA_SEASON)
    const official = constantsForSeason(DEFAULT_RATING_CONSTANTS, OFFICIAL_SEASON)

    // 같은 base에서 뽑아도 서로 영향을 주지 않는다 (객체를 공유해 오염되면 안 된다)
    expect(beta.placementMatches).toBe(0)
    expect(official.placementMatches).toBe(10)
    expect(DEFAULT_RATING_CONSTANTS.placementMatches).toBe(10)
  })
})
