/**
 * 로스터 기반 경기 재구성 — **순수 함수** (Phase 8.2 · 9에서 인정 기준 변경).
 *
 * 문제
 *   넥슨 `/match-detail`은 참가자 일부만 준다(D-044). 그것만으로는 클랜전을 복원할 수 없다.
 *
 * 접근
 *   SACLOUD는 리그 운영자로서 **누가 어느 클랜 소속인지**를 안다(D-052).
 *   각 선수의 매치 목록에는 자기 자신의 기록이 들어 있다(D-048 관측값).
 *   같은 `match_id`를 여러 선수에게서 관측하면 참가자 구성을 **모을** 수 있다.
 *
 * ── 인정 기준이 바뀌었다 (2026-08-22 · D-057)
 *   기존: 양 팀 전원(5v5) 복원 + 인원 일치
 *   현재: **양측 클랜이 각각 3명 이상** 확인되면 경기로 인정한다
 *         5명 2명은 인정하지 않는다. 4명 3명은 인정한다
 *
 *   경기를 인정하는 것과, 그 경기의 전력을 계산하는 것은 **다른 문제**다.
 *   인정하되 확인 수준(`4v3` 등)과 근거 수를 함께 저장한다.
 *
 * 절대 규칙 (그대로다)
 *   1. **관측되지 않은 참가자를 만들지 않는다.**
 *   2. 닉네임·클랜명 문자열로 소속을 판정하지 않는다. **로스터 등록 기록**으로 판정한다.
 *   3. 상세와 관측값이 어긋나면 **자동 투영하지 않는다**(conflict).
 *   4. 확인되지 않은 선수의 개인 래더를 추정해 채우지 않는다 (D-067).
 */
import {
  DEFAULT_RATING_CONSTANTS,
  evaluateEligibility,
  lineupConfidence,
  type ConfirmedParticipant,
  type LineupConfidence,
  type RatingConstants,
} from '@sacloud/rating'

export type Outcome = 'win' | 'lose' | 'draw'
export type IdentityStatus = 'unresolved' | 'active' | 'superseded' | 'conflicted'

/** 경기 시점 소속 근거 (`LeagueRosterMembership`의 판정에 필요한 부분) */
export interface RosterMembership {
  playerId: string
  leagueClanId: string
  clanName: string
  division: number
  joinedAt: Date
  leftAt: Date | null
  verified: boolean
}

/** 매치 목록에서 온 개인 관측값 (`NexonMatchObservation`) */
export interface ObservationInput {
  ouid: string
  playerId: string | null
  userName: string | null
  identityStatus: IdentityStatus
  outcome: Outcome | null
  kill: number | null
  death: number | null
  assist: number | null
}

/** 매치 상세에서 온 참가자 (`NexonMatchParticipant`) — **보조 증거**다 (D-054) */
export interface DetailParticipantInput {
  slot: number
  teamId: string | null
  userName: string | null
  clanName: string | null
  outcome: Outcome | null
  kill: number | null
  death: number | null
  assist: number | null
  headshot: number | null
  damage: number | null
  resolvedPlayerId: string | null
}

export interface ReconstructionLeague {
  leagueId: string
  slug: string
  allowedMatchTypes: readonly string[]
  mapIdByName: ReadonlyMap<string, string>
  playerLimits: readonly number[]
  hasMockMatches: boolean
}

export interface ReconstructedParticipant {
  playerId: string
  leagueClanId: string
  side: 'red' | 'blue'
  outcome: 'win' | 'lose'
  kill: number
  death: number
  assist: number
  /** 상세에만 있는 값. 없으면 `null`(= 알 수 없음) */
  headshot: number | null
  damage: number | null
  /** 근거 출처 — `player_match_list` · `match_detail` */
  sources: string[]
}

export interface ReconstructionSidePlan {
  leagueClanId: string
  clanName: string
  division: number
  members: ReconstructedParticipant[]
}

export interface ReconstructionPlan {
  leagueId: string
  mapId: string
  mapName: string
  startAt: Date
  /** 리그 대전 인원. 확인 인원이 아니라 **리그가 정한 인원**이다 (아래 주석) */
  playerCount: number
  winnerSide: 'red' | 'blue'
  red: ReconstructionSidePlan
  blue: ReconstructionSidePlan
}

export interface ReconstructionSummary {
  observations: number
  observationsUsable: number
  detailParticipants: number
  confirmed: number
  perClan: Record<string, number>
  crossChecked: number
  conflicts: string[]
  ambiguousIdentities: number
  rosterMismatches: number
  /* ── 확인 수준 (Phase 9 · D-068) ── */
  clanAConfirmedCount: number
  clanBConfirmedCount: number
  observationParticipantCount: number
  detailParticipantCount: number
  /** `4v3` 처럼 실제 확인 수준 */
  participantCompleteness: string
  confidence: LineupConfidence
  /** 상세에는 있는데 목록 관측이 없는 사람 — **보류 사유가 아니라 참고 수치다** */
  missingObservations: number
}

export type ReconstructionResult =
  | { ok: true; plan: ReconstructionPlan; summary: ReconstructionSummary }
  | { ok: false; code: string; reason: string; summary: ReconstructionSummary }

/** 이 시각에 유효한 소속인가 (`joinedAt <= at < leftAt`) */
export function membershipAt(
  memberships: readonly RosterMembership[],
  playerId: string,
  at: Date,
): RosterMembership | null {
  const candidates = memberships.filter(
    (membership) =>
      membership.playerId === playerId &&
      membership.joinedAt.getTime() <= at.getTime() &&
      (membership.leftAt === null || membership.leftAt.getTime() > at.getTime()),
  )
  if (candidates.length !== 1) return null
  return candidates[0] ?? null
}

/**
 * 진영 배정.
 *
 * 상세가 `team_id`를 준 참가자가 양쪽에 있으면 그 값을 **증거로** 쓴다.
 * 없으면 `leagueClanId` 오름차순이라는 내부 규칙으로 결정한다 (D-037과 같은 이유).
 */
export function assignSidesByEvidence(
  clanIds: readonly [string, string],
  teamIdByClan: ReadonlyMap<string, string>,
): { red: string; blue: string } {
  const [first, second] = clanIds
  const firstTeam = teamIdByClan.get(first)
  const secondTeam = teamIdByClan.get(second)

  if (firstTeam !== undefined && secondTeam !== undefined && firstTeam !== secondTeam) {
    return firstTeam < secondTeam ? { red: first, blue: second } : { red: second, blue: first }
  }
  return first < second ? { red: first, blue: second } : { red: second, blue: first }
}

export interface ReconstructionInput {
  match: {
    sourceMatchId: string
    matchType: string | null
    matchMode: string | null
    matchMap: string | null
    dateMatch: Date | null
  }
  observations: readonly ObservationInput[]
  detail: readonly DetailParticipantInput[]
  memberships: readonly RosterMembership[]
  league: ReconstructionLeague
  options?: {
    allowMockLeague?: boolean
    /** 운영자가 확인한 로스터만 인정할지 (기본 true — 보수적으로) */
    requireVerifiedRoster?: boolean
    constants?: RatingConstants
  }
}

function emptySummary(input: ReconstructionInput): ReconstructionSummary {
  return {
    observations: input.observations.length,
    observationsUsable: 0,
    detailParticipants: input.detail.length,
    confirmed: 0,
    perClan: {},
    crossChecked: 0,
    conflicts: [],
    ambiguousIdentities: 0,
    rosterMismatches: 0,
    clanAConfirmedCount: 0,
    clanBConfirmedCount: 0,
    observationParticipantCount: 0,
    detailParticipantCount: 0,
    participantCompleteness: '0',
    confidence: 'low',
    missingObservations: 0,
  }
}

export function evaluateReconstruction(input: ReconstructionInput): ReconstructionResult {
  const summary = emptySummary(input)
  const constants = input.options?.constants ?? DEFAULT_RATING_CONSTANTS
  const requireVerified = input.options?.requireVerifiedRoster !== false
  const fail = (code: string, reason: string): ReconstructionResult => ({
    ok: false,
    code,
    reason,
    summary,
  })

  if (input.league.hasMockMatches && input.options?.allowMockLeague !== true) {
    return fail('mock_league', 'mock 시드 경기가 있는 리그다. 실제 기록과 섞지 않는다')
  }
  if (input.match.dateMatch === null) return fail('no_date', '경기 시각을 알 수 없다')
  if (!input.match.matchType || !input.league.allowedMatchTypes.includes(input.match.matchType)) {
    return fail('match_type', `리그가 인정하지 않는 매치 유형이다: ${input.match.matchType ?? '없음'}`)
  }
  if (!input.match.matchMap) return fail('no_map', '맵 정보가 없다')
  const mapId = input.league.mapIdByName.get(input.match.matchMap)
  if (!mapId) return fail('map_not_in_league', `리그 기록 대상 맵이 아니다: ${input.match.matchMap}`)

  const at = input.match.dateMatch

  /* --- 1) 근거 모으기 — 관측(1차) + 상세(보조) ----------------------------- */
  interface Confirmed {
    playerId: string
    membership: RosterMembership
    outcome: 'win' | 'lose'
    kill: number
    death: number
    assist: number
    sources: ('player_match_list' | 'match_detail')[]
    headshot: number | null
    damage: number | null
  }
  const confirmedByPlayer = new Map<string, Confirmed>()

  const admit = (playerId: string): RosterMembership | null => {
    const membership = membershipAt(input.memberships, playerId, at)
    if (!membership || (requireVerified && !membership.verified)) {
      summary.rosterMismatches += 1
      return null
    }
    return membership
  }

  for (const observation of input.observations) {
    // 신원이 확정되지 않았으면 참가자로 인정하지 않는다 (닉네임 병합 금지 — D-036)
    if (observation.playerId === null || observation.identityStatus !== 'active') {
      summary.ambiguousIdentities += 1
      continue
    }
    if (confirmedByPlayer.has(observation.playerId)) {
      return fail('duplicate_player', '같은 플레이어의 관측값이 중복됐다')
    }
    const membership = admit(observation.playerId)
    if (!membership) continue

    if (observation.outcome === null || observation.outcome === 'draw') {
      summary.conflicts.push(`${observation.playerId}: 승패를 알 수 없는 관측값`)
      continue
    }
    if (observation.kill === null || observation.death === null || observation.assist === null) {
      summary.conflicts.push(`${observation.playerId}: k/d/a가 비어 있는 관측값`)
      continue
    }

    summary.observationsUsable += 1
    confirmedByPlayer.set(observation.playerId, {
      playerId: observation.playerId,
      membership,
      outcome: observation.outcome,
      kill: observation.kill,
      death: observation.death,
      assist: observation.assist,
      sources: ['player_match_list'],
      headshot: null,
      damage: null,
    })
  }

  /* --- 2) 상세와 교차검증 + 상세만 있는 사람도 근거로 인정 (D-054·D-057) --- */
  const detailByPlayer = new Map<string, DetailParticipantInput>()
  for (const participant of input.detail) {
    if (participant.resolvedPlayerId) detailByPlayer.set(participant.resolvedPlayerId, participant)
  }

  for (const [playerId, participant] of detailByPlayer) {
    const existing = confirmedByPlayer.get(playerId)

    if (existing) {
      summary.crossChecked += 1
      const mismatched: string[] = []
      if (participant.kill !== null && participant.kill !== existing.kill) mismatched.push('kill')
      if (participant.death !== null && participant.death !== existing.death) mismatched.push('death')
      if (participant.assist !== null && participant.assist !== existing.assist) {
        mismatched.push('assist')
      }
      if (participant.outcome !== null && participant.outcome !== existing.outcome) {
        mismatched.push('outcome')
      }
      if (mismatched.length > 0) {
        summary.conflicts.push(`${playerId}: 상세와 관측값 불일치 (${mismatched.join(', ')})`)
      } else {
        existing.sources.push('match_detail')
        // 상세에만 있는 값은 여기서만 얻을 수 있다
        existing.headshot = participant.headshot
        existing.damage = participant.damage
      }
      continue
    }

    // 목록 관측은 없지만 상세에 본인 기록이 있는 사람 — 그것도 **자기 기록**이다
    summary.missingObservations += 1
    if (
      participant.outcome === null ||
      participant.outcome === 'draw' ||
      participant.kill === null ||
      participant.death === null ||
      participant.assist === null
    ) {
      continue
    }
    const membership = admit(playerId)
    if (!membership) continue

    confirmedByPlayer.set(playerId, {
      playerId,
      membership,
      outcome: participant.outcome,
      kill: participant.kill,
      death: participant.death,
      assist: participant.assist,
      sources: ['match_detail'],
      headshot: participant.headshot,
      damage: participant.damage,
    })
  }

  const confirmed = [...confirmedByPlayer.values()]
  summary.confirmed = confirmed.length
  for (const entry of confirmed) {
    summary.perClan[entry.membership.leagueClanId] =
      (summary.perClan[entry.membership.leagueClanId] ?? 0) + 1
  }

  if (summary.conflicts.length > 0) {
    return fail(
      'conflict_with_detail',
      `상세와 관측값이 어긋난다 (${summary.conflicts.length}건). 자동 투영하지 않는다`,
    )
  }

  /* --- 3) 인정 기준 판정은 래더 엔진과 **같은 함수**를 쓴다 (D-057) --------- */
  const participants: ConfirmedParticipant[] = confirmed.map((entry) => ({
    playerId: entry.playerId,
    leagueClanId: entry.membership.leagueClanId,
    outcome: entry.outcome,
    kill: entry.kill,
    death: entry.death,
    assist: entry.assist,
    sources: entry.sources,
  }))
  const eligibility = evaluateEligibility({ participants, constants })

  summary.clanAConfirmedCount = eligibility.clanA?.confirmed ?? 0
  summary.clanBConfirmedCount = eligibility.clanB?.confirmed ?? 0
  summary.observationParticipantCount = eligibility.observationParticipantCount
  summary.detailParticipantCount = eligibility.detailParticipantCount
  summary.participantCompleteness = eligibility.completeness
  summary.confidence = lineupConfidence(
    summary.clanAConfirmedCount,
    summary.clanBConfirmedCount,
    input.league.playerLimits[0] ?? 5,
  )

  if (!eligibility.eligible || !eligibility.clanA || !eligibility.clanB) {
    return fail(eligibility.status, eligibility.reason)
  }

  /* --- 4) 진영 배정 + 계획 -------------------------------------------------- */
  const teamIdByClan = new Map<string, string>()
  for (const entry of confirmed) {
    const participant = detailByPlayer.get(entry.playerId)
    if (participant?.teamId) teamIdByClan.set(entry.membership.leagueClanId, participant.teamId)
  }
  const clanA = eligibility.clanA.leagueClanId
  const clanB = eligibility.clanB.leagueClanId
  const sides = assignSidesByEvidence([clanA, clanB], teamIdByClan)

  const buildSide = (clanId: string, side: 'red' | 'blue'): ReconstructionSidePlan => {
    const members = confirmed.filter((entry) => entry.membership.leagueClanId === clanId)
    const first = members[0]!
    return {
      leagueClanId: clanId,
      clanName: first.membership.clanName,
      division: first.membership.division,
      members: members.map((entry): ReconstructedParticipant => ({
        playerId: entry.playerId,
        leagueClanId: clanId,
        side,
        outcome: entry.outcome,
        kill: entry.kill,
        death: entry.death,
        assist: entry.assist,
        headshot: entry.headshot,
        damage: entry.damage,
        sources: entry.sources,
      })),
    }
  }

  /**
   * 대전 인원은 **리그가 정한 인원**을 쓴다.
   *
   * 확인 인원(예: 4명)을 그대로 쓰면 "4 vs 4 경기였다"고 잘못 말하게 된다.
   * 우리가 4명만 확인했을 뿐이지 4명이 뛴 것이 아니다.
   * 리그 대전 인원이 하나로 정해져 있으면 그 값을, 아니면 확인 인원의 최대값을 쓴다.
   */
  const playerCount =
    input.league.playerLimits.length === 1
      ? input.league.playerLimits[0]!
      : Math.max(summary.clanAConfirmedCount, summary.clanBConfirmedCount)

  return {
    ok: true,
    summary,
    plan: {
      leagueId: input.league.leagueId,
      mapId,
      mapName: input.match.matchMap,
      startAt: at,
      playerCount,
      winnerSide: eligibility.winnerLeagueClanId === sides.red ? 'red' : 'blue',
      red: buildSide(sides.red, 'red'),
      blue: buildSide(sides.blue, 'blue'),
    },
  }
}
