/**
 * 경기 1건 → 래더 증감 — **순수 함수** (결정적 replay의 핵심).
 *
 * 같은 입력이면 몇 번을 돌려도 같은 값이 나온다. 시각·난수·DB를 쓰지 않는다.
 * 도메인 반영(`apps/worker`)은 이 함수의 결과를 **그대로 받아 적기만** 한다.
 *
 * ── 클랜과 개인을 분리한다 (D-075 · D-082)
 *   클랜 래더 : 그 경기를 치른 **두 클랜**만 변한다.
 *               용병의 **원소속 클랜은 아무 영향도 받지 않는다.**
 *   개인 래더 : 출전이 확인된 **전원**이 100% 받는다. 용병이라고 깎지 않는다
 *
 * ── D-145 에서 바뀐 것
 *   **official 게이트를 폐기했다.** 정상 5v5 + 참가자 10명이면 전부 래더 대상이다.
 *   클1용4 vs 클1용4 도 점수를 받는다. 클랜원 수는 증감을 깎지 않고,
 *   **최근 20경기 평균 본클랜원 수**가 상한 있는 구성 보정(최대 +50)으로만 반영된다.
 *   구성 보정은 이 함수가 아니라 replay 쪽에서 누적한다 — 한 경기로는 알 수 없기 때문이다.
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
  type AssignedParticipant,
  type ConfirmedParticipant,
  type EligibilityResult,
  type LineupConfidence,
  type ParticipantRole,
  type SideEvidence,
} from './eligibility.js'

export interface MatchRatingInput {
  /** 확인된 참가자 전원 (양 팀) — 확인되지 않은 사람은 **여기에 없어야 한다** */
  participants: readonly ConfirmedParticipant[]
  /** 경기 직전 클랜 래더 */
  clanRatings: Readonly<Record<string, number>>
  /** 배치고사 중인 클랜 */
  placementClanIds?: readonly string[]
  /** 배치고사 중인 선수 */
  placementPlayerIds?: readonly string[]
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
  /** 내부 Elo 증감 — **실수다** */
  ratingUpdate: number
  ratingAfter: number
  opponentAvgRating: number
  kUsed: number
  /** 적용된 일방적 경기 억제 비율 (1 = 그대로) */
  suppression: number
  expected: number
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
  isPlacement: boolean
  suppression: number
  expected: number
  /** 이 경기에 나온 본클랜원 수 — 구성 보정의 입력이다 (증감을 깎지 않는다) */
  members: number
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
 * **정상 5v5 + 참가자 10명**이면 래더 대상이다 (D-145).
 * 출전이 확인된 **전원**(용병 포함)이 개인 증감을 100% 받는다.
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
   * 래더 대상이 아니면 증감을 만들지 않는다 (D-145).
   *
   * 기준은 **정상 5v5 인가**뿐이다. `official` 라벨은 보지 않는다 —
   * "비공식이라 레이팅 0" 은 폐기됐다.
   * 대상이 아닌 경기도 기록 자체는 저장된다 — 그건 `apps/worker`가 한다.
   */
  if (
    !eligibility.recordable ||
    !eligibility.ratingEligible ||
    !eligibility.winnerSide ||
    !eligibility.loserSide
  ) {
    return { eligibility, confidence, players: [], clans: [] }
  }

  const placementClans = new Set(input.placementClanIds ?? [])
  const placementPlayers = new Set(input.placementPlayerIds ?? [])

  const sideOf = (leagueClanId: string): AssignedParticipant[] =>
    eligibility.assigned.filter((participant) => participant.leagueClanId === leagueClanId)

  const sides = [eligibility.winnerSide, eligibility.loserSide].map((summary) => {
    const members = sideOf(summary.leagueClanId)
    return {
      leagueClanId: summary.leagueClanId,
      members,
      outcome: summary.outcome,
      clanRating: input.clanRatings[summary.leagueClanId] ?? constants.initialRating,
      /** 이 경기에 나온 본클랜원 수 — 증감을 깎지 않고 **구성 보정의 입력**으로만 쓴다 */
      memberCount: summary.members,
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
        suppression: result.suppression,
        expected: result.expected,
        isPlacement,
        sources: [...member.sources],
        formulaVersion: PERSONAL_FORMULA_VERSION,
      })
    }
  }

  /* ---- 클랜 — 그 경기를 치른 두 클랜만 변한다 ----
     상대는 **상대 클랜 레이팅 하나**다. 라인업 평균을 섞지 않는다 (D-145). */
  const clans: ClanRatingResult[] = sides.map((side) => {
    const opponent = sides.find((other) => other.leagueClanId !== side.leagueClanId)!
    const isPlacement = placementClans.has(side.leagueClanId)
    const result = clanRatingUpdate({
      ratingBefore: side.clanRating,
      opponentRating: opponent.clanRating,
      outcome: side.outcome,
      isPlacement,
      constants,
    })

    return {
      leagueClanId: side.leagueClanId,
      outcome: side.outcome,
      ratingBefore: side.clanRating,
      ratingUpdate: result.ratingUpdate,
      ratingAfter: Math.max(constants.ratingFloor, side.clanRating + result.ratingUpdate),
      opponentRatingUsed: opponent.clanRating,
      isPlacement,
      suppression: result.suppression,
      expected: result.expected,
      members: side.memberCount,
      formulaVersion: CLAN_FORMULA_VERSION,
    }
  })

  return { eligibility, confidence, players, clans }
}
