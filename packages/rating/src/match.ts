/**
 * 경기 1건 → 래더 증감 — **순수 함수** (결정적 replay의 핵심).
 *
 * 같은 입력이면 몇 번을 돌려도 같은 값이 나온다. 시각·난수·DB를 쓰지 않는다.
 * 도메인 반영(`apps/worker`)은 이 함수의 결과를 **그대로 받아 적기만** 한다.
 *
 * ── 클랜과 개인을 분리한다 (D-075 · D-081 · D-082)
 *   클랜 래더 : 그 경기를 치른 **두 클랜**만 변한다.
 *               용병의 **원소속 클랜은 아무 영향도 받지 않는다.**
 *               반영률은 **팀마다 다르다** — 자기 본클랜원을 몇 명 냈는지로 정해진다
 *               (3명↑ 100% · 2명 70% · 1명 40% · 0명 0%)
 *   개인 래더 : 출전이 확인된 **전원**이 100% 받는다. 용병이라고 깎지 않는다
 *
 * ── 비공식 경기 (D-080)
 *   양 팀 모두 본클랜원 3명 미만이면 **아무 증감도 만들지 않는다.**
 *   경기 자체는 저장되지만 공식 통계·래더·랭킹에 들어가지 않는다.
 */
import {
  CLAN_FORMULA_VERSION,
  DEFAULT_RATING_CONSTANTS,
  PERSONAL_FORMULA_VERSION,
  roundHalfUp,
  type RatingConstants,
} from './constants.js'
import { clanRatingUpdate, personalRatingUpdate } from './formula.js'
import {
  evaluateEligibility,
  lineupConfidence,
  type AssignedParticipant,
  type ConfirmedParticipant,
  type EligibilityResult,
  type LineupConfidence,
  type ParticipantRole,
  type SideEvidence,
} from './eligibility.js'
import { effectiveOpponentRating, lineupStrength } from './lineup.js'

export interface MatchRatingInput {
  /** 확인된 참가자 전원 (양 팀) — 확인되지 않은 사람은 **여기에 없어야 한다** */
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
  /**
   * 팀 식별 보조 증거 (D-133).
   * replay 는 **저장된 팀 배정**을 그대로 넘겨 재구성과 같은 판정을 재현한다.
   */
  sideEvidence?: SideEvidence | null
}

export interface PlayerRatingResult {
  playerId: string
  /** 이 경기에서 **뛴 팀** */
  leagueClanId: string
  /** 이 경기에서의 역할. 용병이어도 개인 기록은 정상 반영된다 */
  role: ParticipantRole
  /** 원소속 클랜 (없으면 null). **이 클랜의 래더는 변하지 않는다** */
  rosterLeagueClanId: string | null
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
  /** 반영률을 곱한 **실제** 증감 */
  ratingUpdate: number
  ratingAfter: number
  opponentRatingUsed: number
  lineupBlended: boolean
  isPlacement: boolean
  /** 이 팀의 본클랜원 수에서 나온 반영률 (1 / 0.7 / 0.4 / 0) */
  clanWeight: number
  /** 반영률을 곱하기 전의 증감 */
  rawRatingUpdate: number
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
 * 인정 기준(양 팀 **본클랜원** 3명 이상)을 만족하지 못하면 **증감을 하나도 만들지 않는다.**
 * 인정되면 출전이 확인된 **전원**(용병 포함)이 개인 증감을 받는다.
 */
export function rateMatch(input: MatchRatingInput): MatchRatingResult {
  const constants = input.constants ?? DEFAULT_RATING_CONSTANTS
  /* replay 는 재구성 때 **이미 확정된 팀**을 그대로 써야 한다 (D-133).
     같은 경기를 두 단계가 다르게 판정하면 재구성에서 인정한 경기가 래더에서 빠진다. */
  const eligibility = evaluateEligibility({
    participants: input.participants,
    constants,
    sideEvidence: input.sideEvidence ?? null,
  })
  const confidence = lineupConfidence(
    eligibility.winnerSide?.confirmed ?? 0,
    eligibility.loserSide?.confirmed ?? 0,
  )

  /**
   * 기록할 수 없거나(팀 식별 실패) **비공식 경기**이면 증감을 하나도 만들지 않는다 (D-080).
   *
   * 비공식 경기도 경기 자체는 저장된다 — 그건 `apps/worker`가 한다.
   * 여기서는 "공식 통계에 무엇을 반영할지"만 정한다.
   */
  if (!eligibility.recordable || !eligibility.official || !eligibility.winnerSide || !eligibility.loserSide) {
    return { eligibility, confidence, players: [], clans: [] }
  }

  const placementClans = new Set(input.placementClanIds ?? [])
  const placementPlayers = new Set(input.placementPlayerIds ?? [])
  const priorSameOutcome = input.priorSameOutcome ?? 0

  const sideOf = (leagueClanId: string): AssignedParticipant[] =>
    eligibility.assigned.filter((participant) => participant.leagueClanId === leagueClanId)

  const sides = [eligibility.winnerSide, eligibility.loserSide].map((summary) => {
    const members = sideOf(summary.leagueClanId)
    return {
      leagueClanId: summary.leagueClanId,
      members,
      outcome: summary.outcome,
      // 라인업 전력에는 **실제 출전이 확인된 전원**이 들어간다 — 용병도 그 경기의 전력이다 (D-076)
      lineup: lineupStrength(members, constants),
      clanRating: input.clanRatings[summary.leagueClanId] ?? constants.initialRating,
      // 본클랜원 수에 따른 클랜 래더 반영률. **팀마다 독립적이다** (D-081)
      clanWeight: summary.clanWeight,
    }
  })

  /* ---- 개인 ----
     상대 평균은 **확인된 상대 선수들의 개인 래더 평균**이다.
     확인되지 않은 상대를 추정해 채우지 않는다. */
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
        role: member.role,
        rosterLeagueClanId: member.rosterLeagueClanId,
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

  /* ---- 클랜 — 그 경기를 치른 두 클랜만 변한다 ---- */
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

    /**
     * 반영률을 곱한다 (D-081).
     *
     * 승리·패배 양쪽에 같은 배율을 쓴다. 팀마다 배율이 다르므로 **한 경기의 증감 합이
     * 0이 아닐 수 있다** — 의도된 것이고, 장기 영향은 시뮬레이션으로 확인했다(D-083).
     */
    const weighted = roundHalfUp(result.ratingUpdate * side.clanWeight)

    return {
      leagueClanId: side.leagueClanId,
      outcome: side.outcome,
      ratingBefore: side.clanRating,
      ratingUpdate: weighted,
      ratingAfter: Math.max(constants.ratingFloor, side.clanRating + weighted),
      opponentRatingUsed: effective.rating,
      lineupBlended: effective.blended,
      isPlacement,
      /** 이 팀에 적용된 반영률 — 화면·검증에서 그대로 볼 수 있어야 한다 */
      clanWeight: side.clanWeight,
      /** 반영률을 곱하기 전의 원래 증감 */
      rawRatingUpdate: result.ratingUpdate,
      formulaVersion: CLAN_FORMULA_VERSION,
    }
  })

  return { eligibility, confidence, players, clans }
}
