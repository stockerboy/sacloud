/**
 * 경기 인정 기준과 개인 반영 기준 — **순수 함수**.
 *
 * ── 경기 인정 (D-057 · D-071에서 정밀화)
 *   같은 `sourceMatchId`에서 **양 팀의 본클랜원이 각각 3명 이상** 확인되면 공식전으로 인정한다.
 *   **용병은 이 3명을 채우는 데 쓰지 않는다.**
 *
 *     베리타스 본클랜원 3 + 용병 2  vs  메쏘드 본클랜원 4 + 용병 1  → 인정
 *     베리타스 본클랜원 2 + 용병 3  vs  메쏘드 본클랜원 5          → 불인정
 *
 * ── 확인(confirmed)의 정의
 *   그 선수의 **자기 기록**(승패·k/d/a) 근거가 그 경기에 있어야 한다.
 *     - 목록 관측값(`NexonMatchObservation`) 또는
 *     - 매치 상세의 본인 행(`NexonMatchParticipant`)
 *   그리고 신원이 확정돼 있어야 한다.
 *
 *   **로스터 등록만으로는 확인이 아니다** (D-068). 로스터는 "이 선수의 매치 목록을
 *   확인해 봐야 한다"는 **후보 목록**이지, 출전했다는 증거가 아니다.
 *
 * ── 어느 팀으로 뛰었는가 (D-072)
 *   "원래 소속 클랜"과 "이 경기에서 뛴 팀"은 **다른 값**이다.
 *
 *   1. 본클랜원 3명 이상이 모인 클랜 **두 곳**이 그 경기의 두 팀이다
 *   2. 각 팀의 승패는 그 팀 본클랜원들의 기록으로 정해진다
 *   3. 나머지 확인된 선수는 **자기 승패와 같은 팀**으로 배정한다 — 추측이 아니라 근거다
 *      (승자가 하나뿐이므로 승패가 곧 팀을 가리킨다)
 *   4. 배정된 팀이 자기 등록 클랜과 다르면 그 경기의 역할은 **용병**이다
 *
 * ── 개인 기록 (D-073)
 *   경기가 인정되면 **출전이 확인된 전원**이 개인 기록을 받는다. 용병도 받는다.
 *   본클랜원이 아니라는 이유로 개인 기록을 만들지 않는 일은 없다.
 *   반대로 확인되지 않은 사람은 만들지 않는다. 로스터에 있다고 출전을 추정하지 않는다.
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
  | 'eligible'
  | 'insufficient_members'
  | 'single_clan'
  | 'too_many_clans'
  | 'inconsistent_outcome'
  | 'no_winner'
  | 'conflict_with_detail'

export interface EligibilityInput {
  participants: readonly ConfirmedParticipant[]
  constants?: RatingConstants
}

export interface SideSummary {
  leagueClanId: string
  /** 본클랜원 확인 인원 — **공식전 인정 기준은 이 값이다** */
  members: number
  /** 용병 확인 인원 */
  mercenaries: number
  /** 실제 확인된 출전 인원 = members + mercenaries */
  confirmed: number
  outcome: 'win' | 'lose'
}

export interface EligibilityResult {
  status: ReconstructionStatus
  eligible: boolean
  /** 이긴 팀 */
  winnerSide: SideSummary | null
  /** 진 팀 */
  loserSide: SideSummary | null
  /**
   * `5v5` 처럼 **실제 확인된 출전 인원** 기준 (D-074).
   * 본클랜원만 세지 않는다 — 용병도 그 경기에 실제로 뛴 사람이다.
   */
  completeness: string
  observationParticipantCount: number
  detailParticipantCount: number
  winnerLeagueClanId: string | null
  /** 팀 배정이 끝난 참가자 (인정된 경기에서만 채워진다) */
  assigned: AssignedParticipant[]
  reason: string
}

/**
 * 그 클랜 **본클랜원들의 다수 결과**로 클랜의 승패를 정한다.
 *
 * 등록은 이 클랜인데 상대 팀 용병으로 뛴 사람이 있을 수 있다. 그 한 명 때문에
 * 클랜 전체를 "승패 불명"으로 버리지 않는다. 대신 **다수가 아닌 쪽은 그 경기에서
 * 다른 팀으로 뛴 것**으로 본다 (승패가 곧 팀을 가리키므로 추측이 아니다).
 *
 * 정확히 반반이면 판정하지 않는다 — 그때는 근거가 없다.
 */
function majorityOutcome(
  members: readonly ConfirmedParticipant[],
): { outcome: 'win' | 'lose'; coherent: number } | null {
  const wins = members.filter((member) => member.outcome === 'win').length
  const loses = members.length - wins
  if (wins === loses) return null
  return wins > loses ? { outcome: 'win', coherent: wins } : { outcome: 'lose', coherent: loses }
}

/**
 * 경기를 인정할 수 있는가, 그리고 누가 어느 팀이었는가.
 *
 * 인원이 모자라면 **부분 저장하지 않는다.** 인정하지 않고 사유를 남긴다.
 */
export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const constants = input.constants ?? DEFAULT_RATING_CONSTANTS

  const observationParticipantCount = input.participants.filter((participant) =>
    participant.sources.includes('player_match_list'),
  ).length
  const detailParticipantCount = input.participants.filter((participant) =>
    participant.sources.includes('match_detail'),
  ).length

  /* --- 1) 본클랜원만으로 두 팀을 찾는다 (용병은 팀을 만들지 못한다) --- */
  const byRosterClan = new Map<string, ConfirmedParticipant[]>()
  for (const participant of input.participants) {
    if (participant.rosterLeagueClanId === null) continue
    const bucket = byRosterClan.get(participant.rosterLeagueClanId)
    if (bucket) bucket.push(participant)
    else byRosterClan.set(participant.rosterLeagueClanId, [participant])
  }

  /**
   * 인정되지 않은 경기의 확인 수준.
   *
   * 팀을 배정하지 못했으므로 **등록 클랜 기준**으로라도 남긴다.
   * "왜 모자랐는지"를 숫자로 봐야 다음 판단을 할 수 있기 때문이다.
   */
  const rosterCounts = [...byRosterClan.values()]
    .map((members) => members.length)
    .sort((left, right) => right - left)

  const base = {
    observationParticipantCount,
    detailParticipantCount,
    winnerSide: null as SideSummary | null,
    loserSide: null as SideSummary | null,
    completeness: rosterCounts.length > 0 ? rosterCounts.join('v') : '0',
    winnerLeagueClanId: null as string | null,
    assigned: [] as AssignedParticipant[],
  }

  // 다수가 갈리지 않는 클랜(정확히 반반)은 근거가 없다. 인원이 충분한데 반반이면 사유를 남긴다
  const tied = [...byRosterClan.entries()].find(
    ([, members]) =>
      members.length >= constants.minConfirmedPerSide && majorityOutcome(members) === null,
  )
  if (tied) {
    return {
      ...base,
      status: 'inconsistent_outcome',
      eligible: false,
      reason: `${tied[0]} 본클랜원의 승패가 정확히 반반이라 팀을 판정할 수 없다`,
    }
  }

  const qualified = [...byRosterClan.entries()]
    .map(([leagueClanId, members]) => ({ leagueClanId, members, majority: majorityOutcome(members) }))
    .filter(
      (clan): clan is { leagueClanId: string; members: ConfirmedParticipant[]; majority: { outcome: 'win' | 'lose'; coherent: number } } =>
        clan.majority !== null && clan.majority.coherent >= constants.minConfirmedPerSide,
    )
    .sort((left, right) => right.majority.coherent - left.majority.coherent)

  if (qualified.length === 0) {
    return {
      ...base,
      status: 'insufficient_members',
      eligible: false,
      reason: `본클랜원이 ${constants.minConfirmedPerSide}명 이상 확인된 클랜이 없다`,
    }
  }
  if (qualified.length === 1) {
    const only = qualified[0]!
    return {
      ...base,
      status: byRosterClan.size > 1 ? 'insufficient_members' : 'single_clan',
      eligible: false,
      reason:
        byRosterClan.size > 1
          ? `한쪽만 본클랜원 ${constants.minConfirmedPerSide}명을 채웠다 (${only.majority.coherent}명)`
          : '한쪽 클랜만 확인됐다. 상대 클랜 본클랜원의 관측이 없다',
    }
  }
  if (qualified.length > 2) {
    return {
      ...base,
      status: 'too_many_clans',
      eligible: false,
      reason: `본클랜원 조건을 채운 클랜이 ${qualified.length}곳이다. 클랜전으로 볼 수 없다`,
    }
  }

  const [first, second] = qualified as [typeof qualified[0], typeof qualified[0]]
  const firstOutcome = first.majority.outcome
  const secondOutcome = second.majority.outcome

  if (firstOutcome === secondOutcome) {
    return {
      ...base,
      status: 'no_winner',
      eligible: false,
      reason: '양 팀의 승패가 같다. 승자를 판정할 수 없다',
    }
  }

  /* --- 2) 나머지 확인된 선수를 **자기 승패와 같은 팀**으로 배정한다 --- */
  const sideByOutcome = new Map<'win' | 'lose', string>([
    [firstOutcome, first.leagueClanId],
    [secondOutcome, second.leagueClanId],
  ])

  const assigned: AssignedParticipant[] = input.participants.map((participant) => {
    const leagueClanId = sideByOutcome.get(participant.outcome)!
    return {
      ...participant,
      leagueClanId,
      // 뛴 팀이 자기 등록 클랜과 다르면 그 경기의 역할은 용병이다
      role: participant.rosterLeagueClanId === leagueClanId ? 'member' : 'mercenary',
    }
  })

  const summarize = (leagueClanId: string, outcome: 'win' | 'lose'): SideSummary => {
    const side = assigned.filter((participant) => participant.leagueClanId === leagueClanId)
    const members = side.filter((participant) => participant.role === 'member').length
    return {
      leagueClanId,
      members,
      mercenaries: side.length - members,
      confirmed: side.length,
      outcome,
    }
  }

  const firstSide = summarize(first.leagueClanId, firstOutcome)
  const secondSide = summarize(second.leagueClanId, secondOutcome)
  const winnerSide = firstOutcome === 'win' ? firstSide : secondSide
  const loserSide = firstOutcome === 'win' ? secondSide : firstSide

  return {
    observationParticipantCount,
    detailParticipantCount,
    status: 'eligible',
    eligible: true,
    winnerSide,
    loserSide,
    // 확인 수준은 **실제 출전자 전원** 기준이다 (D-074)
    completeness:
      winnerSide.confirmed >= loserSide.confirmed
        ? `${winnerSide.confirmed}v${loserSide.confirmed}`
        : `${loserSide.confirmed}v${winnerSide.confirmed}`,
    winnerLeagueClanId: firstOutcome === 'win' ? first.leagueClanId : second.leagueClanId,
    assigned,
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
  homeConfirmed: number,
  awayConfirmed: number,
  squadSize = 5,
): LineupConfidence {
  const smaller = Math.min(homeConfirmed, awayConfirmed)
  if (smaller >= squadSize) return 'high'
  if (smaller >= squadSize - 1) return 'medium'
  return 'low'
}
