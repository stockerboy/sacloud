/**
 * 경기 1건 → 래더 증감 — **순수 함수** (결정적 replay의 핵심).
 *
 * 같은 입력이면 몇 번을 돌려도 같은 값이 나온다. 시각·난수·DB를 쓰지 않는다.
 * 도메인 반영(`apps/worker`)은 이 함수의 결과를 **그대로 받아 적기만** 한다.
 */
import {
  CLAN_FORMULA_VERSION,
  DEFAULT_RATING_CONSTANTS,
  PERSONAL_FORMULA_VERSION,
  type RatingConstants,
} from './constants.js'
import { clanRatingUpdate, personalRatingUpdate } from './formula.js'
import {
  evaluateEligibility,
  lineupConfidence,
  type ConfirmedParticipant,
  type EligibilityResult,
  type LineupConfidence,
} from './eligibility.js'
import { effectiveOpponentRating, lineupStrength } from './lineup.js'

export interface MatchRatingInput {
  /** 확인된 참가자 전원 (양 클랜) — 확인되지 않은 사람은 **여기에 없어야 한다** */
  participants: readonly ConfirmedParticipant[]
  /** 경기 직전 클랜 래더 */
  clanRatings: Readonly<Record<string, number>>
  /** 배치고사 중인 클랜 */
  placementClanIds?: readonly string[]
  /** 배치고사 중인 선수 */
  placementPlayerIds?: readonly string[]
  /** 기간 안에서 **같은 방향**으로 이미 나온 두 클랜의 경기 수 */
  priorSameOutcome?: number
  constants?: RatingConstants
}

export interface PlayerRatingResult {
  playerId: string
  leagueClanId: string
  outcome: 'win' | 'lose'
  ratingBefore: number
  ratingUpdate: number
  ratingAfter: number
  opponentAvgRating: number
  kUsed: number
  capFactor: number
  repeatFactor: number
  isPlacement: boolean
  sources: string[]
  formulaVersion: string
}

export interface ClanRatingResult {
  leagueClanId: string
  outcome: 'win' | 'lose'
  ratingBefore: number
  ratingUpdate: number
  ratingAfter: number
  opponentRatingUsed: number
  lineupBlended: boolean
  isPlacement: boolean
  formulaVersion: string
}

export interface MatchRatingResult {
  eligibility: EligibilityResult
  confidence: LineupConfidence
  players: PlayerRatingResult[]
  clans: ClanRatingResult[]
}

/**
 * 경기 하나를 계산한다.
 *
 * 인정 기준(양측 3명 이상)을 만족하지 못하면 **증감을 하나도 만들지 않는다.**
 * 인정되더라도 개인 점수는 **확인된 선수에게만** 생긴다 (없는 참가자를 만들지 않는다).
 */
export function rateMatch(input: MatchRatingInput): MatchRatingResult {
  const constants = input.constants ?? DEFAULT_RATING_CONSTANTS
  const eligibility = evaluateEligibility({ participants: input.participants, constants })
  const confidence = lineupConfidence(
    eligibility.clanA?.confirmed ?? 0,
    eligibility.clanB?.confirmed ?? 0,
  )

  if (!eligibility.eligible || !eligibility.clanA || !eligibility.clanB) {
    return { eligibility, confidence, players: [], clans: [] }
  }

  const placementClans = new Set(input.placementClanIds ?? [])
  const placementPlayers = new Set(input.placementPlayerIds ?? [])
  const priorSameOutcome = input.priorSameOutcome ?? 0

  const sideOf = (leagueClanId: string): ConfirmedParticipant[] =>
    input.participants.filter((participant) => participant.leagueClanId === leagueClanId)

  const clanIds = [eligibility.clanA.leagueClanId, eligibility.clanB.leagueClanId] as const
  const sides = clanIds.map((leagueClanId) => {
    const members = sideOf(leagueClanId)
    return {
      leagueClanId,
      members,
      outcome: members[0]!.outcome,
      lineup: lineupStrength(members, constants),
      clanRating: input.clanRatings[leagueClanId] ?? constants.initialRating,
    }
  })

  /* ---- 개인 ----
     상대 평균은 **확인된 상대 선수들의 개인 래더 평균**이다.
     확인되지 않은 상대를 추정해 채우지 않는다. 개인 래더가 없는 상대는 초기값으로 본다 */
  const players: PlayerRatingResult[] = []
  for (const side of sides) {
    const opponent = sides.find((other) => other.leagueClanId !== side.leagueClanId)!
    const opponentRatings = opponent.members.map(
      (member) => member.ratingBefore ?? constants.initialRating,
    )
    const opponentAvg =
      opponentRatings.length > 0
        ? opponentRatings.reduce((sum, rating) => sum + rating, 0) / opponentRatings.length
        : constants.initialRating

    for (const member of side.members) {
      const ratingBefore = member.ratingBefore ?? constants.initialRating
      const isPlacement = placementPlayers.has(member.playerId)
      const result = personalRatingUpdate({
        ratingBefore,
        opponentRating: opponentAvg,
        outcome: member.outcome,
        isPlacement,
        priorSameOutcome,
        constants,
      })

      players.push({
        playerId: member.playerId,
        leagueClanId: side.leagueClanId,
        outcome: member.outcome,
        ratingBefore,
        ratingUpdate: result.ratingUpdate,
        ratingAfter: Math.max(constants.ratingFloor, ratingBefore + result.ratingUpdate),
        opponentAvgRating: opponentAvg,
        kUsed: result.kUsed,
        capFactor: result.capFactor,
        repeatFactor: result.repeatFactor,
        isPlacement,
        sources: [...member.sources],
        formulaVersion: PERSONAL_FORMULA_VERSION,
      })
    }
  }

  /* ---- 클랜 ---- */
  const clans: ClanRatingResult[] = sides.map((side) => {
    const opponent = sides.find((other) => other.leagueClanId !== side.leagueClanId)!
    const effective = effectiveOpponentRating({
      opponentClanRating: opponent.clanRating,
      opponentLineup: opponent.lineup,
      ownLineup: side.lineup,
      constants,
    })
    const isPlacement = placementClans.has(side.leagueClanId)
    const result = clanRatingUpdate({
      ratingBefore: side.clanRating,
      opponentRating: effective.rating,
      outcome: side.outcome,
      isPlacement,
      priorSameOutcome,
      constants,
    })

    return {
      leagueClanId: side.leagueClanId,
      outcome: side.outcome,
      ratingBefore: side.clanRating,
      ratingUpdate: result.ratingUpdate,
      ratingAfter: Math.max(constants.ratingFloor, side.clanRating + result.ratingUpdate),
      opponentRatingUsed: effective.rating,
      lineupBlended: effective.blended,
      isPlacement,
      formulaVersion: CLAN_FORMULA_VERSION,
    }
  })

  return { eligibility, confidence, players, clans }
}
