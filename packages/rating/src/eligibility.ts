/**
 * 경기 인정 기준과 개인 반영 기준 — **순수 함수**.
 *
 * ── 경기 인정 (D-057)
 *   같은 `sourceMatchId`에서 **양측 클랜이 각각 3명 이상** 확인되면 경기로 인정한다.
 *   5명 4명 → 인정 / 5명 2명 → 인정하지 않음.
 *
 * ── 확인(confirmed)의 정의
 *   그 선수의 **자기 기록**(승패·k/d/a) 근거가 그 경기에 있어야 한다.
 *     - 목록 관측값(`NexonMatchObservation`) 또는
 *     - 매치 상세의 본인 행(`NexonMatchParticipant`)
 *   그리고 신원이 확정돼 있고, 경기 시각에 그 클랜 로스터에 등록돼 있어야 한다.
 *
 *   **로스터 등록만으로는 확인이 아니다** (D-068). 로스터는 "이 선수의 매치 목록을
 *   확인해 봐야 한다"는 **후보 목록**이지, 출전했다는 증거가 아니다.
 *
 * ── 개인 점수 (D-067)
 *   경기가 인정돼도, **확인되지 않은 선수의 개인 점수는 만들지 않는다.**
 *   없는 참가자를 채우지 않는다.
 */
import { DEFAULT_RATING_CONSTANTS, type RatingConstants } from './constants.js'

/** 확인 근거 */
export type EvidenceSource = 'player_match_list' | 'match_detail'

export interface ConfirmedParticipant {
  playerId: string
  leagueClanId: string
  outcome: 'win' | 'lose'
  kill: number
  death: number
  assist: number
  /** 이 선수를 확인한 근거 (하나 이상) */
  sources: EvidenceSource[]
  /** 경기 시점 개인 래더 — 라인업 전력 계산에 쓴다 */
  ratingBefore?: number
}

export type ReconstructionStatus =
  | 'eligible'
  | 'insufficient_participants'
  | 'single_clan'
  | 'too_many_clans'
  | 'inconsistent_outcome'
  | 'no_winner'
  | 'conflict_with_detail'

export interface EligibilityInput {
  participants: readonly ConfirmedParticipant[]
  constants?: RatingConstants
}

export interface EligibilityResult {
  status: ReconstructionStatus
  eligible: boolean
  /** 클랜 두 곳의 확인 인원 (많은 쪽, 적은 쪽 순서가 아니라 실제 클랜 기준) */
  clanA: { leagueClanId: string; confirmed: number } | null
  clanB: { leagueClanId: string; confirmed: number } | null
  /** `4v3` 처럼 실제 확인 수준을 남긴다 (많은 쪽 먼저) */
  completeness: string
  /** 확인 근거별 인원 */
  observationParticipantCount: number
  detailParticipantCount: number
  /** 승리 클랜 (판정 불가면 null) */
  winnerLeagueClanId: string | null
  reason: string
}

/**
 * 경기를 인정할 수 있는가.
 *
 * 인원이 모자라면 **부분 저장하지 않는다.** 인정하지 않고 사유를 남긴다.
 */
export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const constants = input.constants ?? DEFAULT_RATING_CONSTANTS
  const byClan = new Map<string, ConfirmedParticipant[]>()
  for (const participant of input.participants) {
    const bucket = byClan.get(participant.leagueClanId)
    if (bucket) bucket.push(participant)
    else byClan.set(participant.leagueClanId, [participant])
  }

  const observationParticipantCount = input.participants.filter((participant) =>
    participant.sources.includes('player_match_list'),
  ).length
  const detailParticipantCount = input.participants.filter((participant) =>
    participant.sources.includes('match_detail'),
  ).length

  const clans = [...byClan.entries()].map(([leagueClanId, members]) => ({
    leagueClanId,
    confirmed: members.length,
    members,
  }))
  clans.sort((left, right) => right.confirmed - left.confirmed)

  const base = {
    observationParticipantCount,
    detailParticipantCount,
    clanA: clans[0] ? { leagueClanId: clans[0].leagueClanId, confirmed: clans[0].confirmed } : null,
    clanB: clans[1] ? { leagueClanId: clans[1].leagueClanId, confirmed: clans[1].confirmed } : null,
    completeness: clans.map((clan) => clan.confirmed).join('v') || '0',
    winnerLeagueClanId: null as string | null,
  }

  if (clans.length < 2) {
    return {
      ...base,
      status: 'single_clan',
      eligible: false,
      reason: '한쪽 클랜만 확인됐다. 상대 클랜 선수의 관측이 없다',
    }
  }
  if (clans.length > 2) {
    return {
      ...base,
      status: 'too_many_clans',
      eligible: false,
      reason: `확인된 클랜이 ${clans.length}곳이다. 클랜전으로 볼 수 없다`,
    }
  }

  const [first, second] = clans as [typeof clans[0], typeof clans[0]]
  if (
    first.confirmed < constants.minConfirmedPerSide ||
    second.confirmed < constants.minConfirmedPerSide
  ) {
    return {
      ...base,
      status: 'insufficient_participants',
      eligible: false,
      reason:
        `양측 각각 ${constants.minConfirmedPerSide}명 이상이 필요하다 ` +
        `(현재 ${first.confirmed} vs ${second.confirmed})`,
    }
  }

  const outcomeOf = (members: ConfirmedParticipant[]): 'win' | 'lose' | null => {
    const outcomes = new Set(members.map((member) => member.outcome))
    return outcomes.size === 1 ? [...outcomes][0]! : null
  }
  const firstOutcome = outcomeOf(first.members)
  const secondOutcome = outcomeOf(second.members)

  if (firstOutcome === null || secondOutcome === null) {
    return {
      ...base,
      status: 'inconsistent_outcome',
      eligible: false,
      reason: '같은 클랜 안에서 승패가 엇갈린다',
    }
  }
  if (firstOutcome === secondOutcome) {
    return {
      ...base,
      status: 'no_winner',
      eligible: false,
      reason: '양 팀의 승패가 같다. 승자를 판정할 수 없다',
    }
  }

  return {
    ...base,
    status: 'eligible',
    eligible: true,
    winnerLeagueClanId: firstOutcome === 'win' ? first.leagueClanId : second.leagueClanId,
    reason: '',
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
  clanAConfirmed: number,
  clanBConfirmed: number,
  squadSize = 5,
): LineupConfidence {
  const smaller = Math.min(clanAConfirmed, clanBConfirmed)
  if (smaller >= squadSize) return 'high'
  if (smaller >= squadSize - 1) return 'medium'
  return 'low'
}
