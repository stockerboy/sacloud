/**
 * 경기 인정 기준과 참가자 처리 — **순수 함수**.
 *
 * ── 공식 통계 반영 기준 (D-079 — 2026-08-22 정책 변경)
 *   **양 팀 중 한쪽이라도** 같은 클랜 본클랜원 3명 이상이 확인되면 **공식 경기**다.
 *
 *     클3+용2 vs 클3+용2  → 공식
 *     클3+용2 vs 클2+용3  → 공식
 *     클3+용2 vs 클0+용5  → 공식
 *     클2+용3 vs 클2+용3  → **비공식 경기**
 *     클1+용4 vs 클1+용4  → **비공식 경기**
 *
 *   조건은 `home >= 3 OR away >= 3` 다. **AND가 아니다.**
 *   (기존 D-071의 AND 기준은 폐기한다.)
 *
 * ── 비공식 경기도 지우지 않는다 (D-080)
 *   양쪽 다 3명 미만이어도 **경기 자체는 남긴다.** 기록실에서 참가자·K/D/A·맵·결과를 볼 수 있다.
 *   다만 시즌 승패·킬뎃·평균킬·MVP·개인 래더·클랜 래더·랭킹에는 **전혀 반영하지 않는다.**
 *
 * ── 어느 팀으로 뛰었는가 (D-072 유지)
 *   승자가 하나뿐이므로 **승패가 곧 팀**이다. 추측하지 않는다.
 *   팀을 대표하는 클랜은 다음 순서로 정한다.
 *     1. 매치 상세의 `guild_name`이 리그 클랜과 **정확히** 일치하는 것의 다수 (D-043 근거)
 *     2. 없으면 그 팀 참가자들의 **등록 클랜 다수**
 *     3. 둘 다 없으면 팀을 식별하지 못한 것이다 — 사유를 남기고 기록하지 않는다
 *
 * ── 클랜 래더 반영률 (D-081)
 *   같은 공식 경기라도 팀마다 다르다. 자기 본클랜원을 몇 명 냈는지로 정한다.
 *     3명 이상 100% · 2명 70% · 1명 40% · 0명 0%
 *   개인 래더에는 이 차등을 적용하지 않는다 (D-082).
 */
import { DEFAULT_RATING_CONSTANTS, type RatingConstants } from './constants.js'

/** 확인 근거 */
export type EvidenceSource = 'player_match_list' | 'match_detail'

/** 이 경기에서의 역할 — 소속이 아니라 **이 경기 기준**이다 */
export type ParticipantRole = 'member' | 'mercenary'

export interface ConfirmedParticipant {
  playerId: string
  /**
   * 경기 시점 **등록 클랜** (`LeagueRosterMembership`). 없으면 `null`(무소속·타 리그).
   * 이 값은 "원래 소속"이고, 실제로 어느 팀으로 뛰었는지와는 다르다.
   */
  rosterLeagueClanId: string | null
  /**
   * 매치 상세의 `guild_name`이 리그 클랜과 **정확히** 일치할 때 그 클랜.
   * 팀 식별의 1차 근거다. 이름이 비슷하다는 이유로 넣으면 안 된다 (D-036 · 정책 20).
   */
  detailLeagueClanId?: string | null
  outcome: 'win' | 'lose'
  kill: number
  death: number
  assist: number
  /** 이 선수를 확인한 근거 (하나 이상) */
  sources: EvidenceSource[]
  /** 경기 시점 개인 래더 — 라인업 전력 계산에 쓴다 */
  ratingBefore?: number
}

/** 팀 배정까지 끝난 참가자 */
export interface AssignedParticipant extends ConfirmedParticipant {
  /** 이 경기에서 **뛴 팀** */
  leagueClanId: string
  role: ParticipantRole
}

export type ReconstructionStatus =
  /** 공식 경기 — 시즌 통계·래더에 반영한다 */
  | 'official'
  /** 비공식 경기 — 기록실에는 남기지만 공식 통계에 반영하지 않는다 */
  | 'reference'
  | 'unidentified_side'
  | 'single_clan'
  | 'no_winner'
  | 'inconsistent_outcome'
  | 'conflict_with_detail'

export interface EligibilityInput {
  participants: readonly ConfirmedParticipant[]
  constants?: RatingConstants
}

export interface SideSummary {
  leagueClanId: string
  /** 본클랜원 확인 인원 — **공식 여부와 클랜 반영률이 이 값으로 정해진다** */
  members: number
  /** 용병 확인 인원 */
  mercenaries: number
  /** 실제 확인된 출전 인원 = members + mercenaries */
  confirmed: number
  outcome: 'win' | 'lose'
  /** 이 팀의 클랜 래더 반영률 (0 ~ 1) */
  clanWeight: number
}

export interface EligibilityResult {
  status: ReconstructionStatus
  /** 경기를 기록으로 남길 수 있는가 (양 팀을 식별했는가) */
  recordable: boolean
  /** 공식 통계·래더에 반영하는가 */
  official: boolean
  winnerSide: SideSummary | null
  loserSide: SideSummary | null
  /**
   * `5v5` 처럼 **실제 확인된 출전 인원** 기준 (D-074).
   * 본클랜원만 세지 않는다 — 용병도 그 경기에 실제로 뛴 사람이다.
   */
  completeness: string
  observationParticipantCount: number
  detailParticipantCount: number
  winnerLeagueClanId: string | null
  /** 팀 배정이 끝난 참가자 (기록 가능한 경기에서만 채워진다) */
  assigned: AssignedParticipant[]
  reason: string
}

/**
 * 본클랜원 수 → 클랜 래더 반영률 (D-081).
 *
 * 자기 전력으로 얼마나 참가했는지를 클랜 점수에 반영한다.
 * 용병을 많이 쓸수록 클랜 래더 영향이 줄지만, **개인 래더에는 차등이 없다**.
 */
export function clanWeightForMembers(
  members: number,
  constants: RatingConstants = DEFAULT_RATING_CONSTANTS,
): number {
  const weights = constants.clanWeightByMembers
  if (members >= 3) return weights.full
  if (members === 2) return weights.two
  if (members === 1) return weights.one
  return weights.none
}

/** 가장 많이 나온 값 (동률이면 null — 추측하지 않는다) */
function plurality(values: readonly (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>()
  for (const value of values) {
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  if (counts.size === 0) return null
  const sorted = [...counts.entries()].sort((left, right) => right[1] - left[1])
  if (sorted.length > 1 && sorted[0]![1] === sorted[1]![1]) return null
  return sorted[0]![0]
}

/**
 * 경기를 기록할 수 있는가, 공식인가, 그리고 누가 어느 팀이었는가.
 *
 * 참가자가 모자라도 **경기를 버리지 않는다.** 공식이 아닐 뿐이다 (D-080).
 */
export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const constants = input.constants ?? DEFAULT_RATING_CONSTANTS

  const observationParticipantCount = input.participants.filter((participant) =>
    participant.sources.includes('player_match_list'),
  ).length
  const detailParticipantCount = input.participants.filter((participant) =>
    participant.sources.includes('match_detail'),
  ).length

  const winners = input.participants.filter((participant) => participant.outcome === 'win')
  const losers = input.participants.filter((participant) => participant.outcome === 'lose')

  const base = {
    observationParticipantCount,
    detailParticipantCount,
    winnerSide: null as SideSummary | null,
    loserSide: null as SideSummary | null,
    completeness:
      winners.length >= losers.length
        ? `${winners.length}v${losers.length}`
        : `${losers.length}v${winners.length}`,
    winnerLeagueClanId: null as string | null,
    assigned: [] as AssignedParticipant[],
    recordable: false,
    official: false,
  }

  if (winners.length === 0 || losers.length === 0) {
    return {
      ...base,
      status: 'single_clan',
      reason: '한쪽 결과만 확인됐다. 상대 팀 선수의 관측이 없다',
    }
  }

  /* --- 팀을 대표하는 클랜 식별 — 추측하지 않는다 --- */
  const identify = (side: readonly ConfirmedParticipant[]): string | null =>
    plurality(side.map((participant) => participant.detailLeagueClanId)) ??
    plurality(side.map((participant) => participant.rosterLeagueClanId))

  const winnerClanId = identify(winners)
  const loserClanId = identify(losers)

  if (winnerClanId === null || loserClanId === null) {
    return {
      ...base,
      status: 'unidentified_side',
      reason: '어느 클랜의 팀인지 근거로 정할 수 없다 (상세 클랜명·등록 클랜 모두 불충분)',
    }
  }
  if (winnerClanId === loserClanId) {
    return {
      ...base,
      status: 'single_clan',
      reason: '양 팀이 같은 클랜으로 판정됐다. 클랜전으로 볼 수 없다',
    }
  }

  const assign = (
    side: readonly ConfirmedParticipant[],
    leagueClanId: string,
  ): AssignedParticipant[] =>
    side.map((participant) => ({
      ...participant,
      leagueClanId,
      // 뛴 팀이 자기 등록 클랜과 다르면 그 경기의 역할은 용병이다
      role: participant.rosterLeagueClanId === leagueClanId ? 'member' : 'mercenary',
    }))

  const assigned = [...assign(winners, winnerClanId), ...assign(losers, loserClanId)]

  const summarize = (leagueClanId: string, outcome: 'win' | 'lose'): SideSummary => {
    const side = assigned.filter((participant) => participant.leagueClanId === leagueClanId)
    const members = side.filter((participant) => participant.role === 'member').length
    return {
      leagueClanId,
      members,
      mercenaries: side.length - members,
      confirmed: side.length,
      outcome,
      clanWeight: clanWeightForMembers(members, constants),
    }
  }

  const winnerSide = summarize(winnerClanId, 'win')
  const loserSide = summarize(loserClanId, 'lose')

  // **OR 조건** — 한쪽만 본클랜원 3명을 채워도 공식 경기다 (D-079)
  const official =
    winnerSide.members >= constants.minConfirmedPerSide ||
    loserSide.members >= constants.minConfirmedPerSide

  return {
    observationParticipantCount,
    detailParticipantCount,
    status: official ? 'official' : 'reference',
    recordable: true,
    official,
    winnerSide,
    loserSide,
    completeness:
      winnerSide.confirmed >= loserSide.confirmed
        ? `${winnerSide.confirmed}v${loserSide.confirmed}`
        : `${loserSide.confirmed}v${winnerSide.confirmed}`,
    winnerLeagueClanId: winnerClanId,
    assigned,
    reason: official
      ? ''
      : `양 팀 모두 본클랜원이 ${constants.minConfirmedPerSide}명 미만이다 ` +
        `(${winnerSide.members} / ${loserSide.members}). 비공식 경기으로만 남긴다`,
  }
}

export type LineupConfidence = 'high' | 'medium' | 'low'

/**
 * 확인 수준을 등급으로.
 *
 * 화면에 "이 기록이 얼마나 확실한가"를 보여 주기 위한 값이다.
 * 숫자를 감추지 않는다 — 등급과 원본 인원 수를 함께 남긴다.
 */
export function lineupConfidence(
  winnerConfirmed: number,
  loserConfirmed: number,
  squadSize = 5,
): LineupConfidence {
  const smaller = Math.min(winnerConfirmed, loserConfirmed)
  if (smaller >= squadSize) return 'high'
  if (smaller >= squadSize - 1) return 'medium'
  return 'low'
}
