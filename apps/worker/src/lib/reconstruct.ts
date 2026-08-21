/**
 * 로스터 기반 경기 재구성 — **순수 함수** (Phase 8.2).
 *
 * 문제
 *   넥슨 `/match-detail`은 참가자 일부만 준다(D-044). 그것만으로는 클랜전을 복원할 수 없다.
 *
 * 접근
 *   SACLOUD는 리그 운영자로서 **누가 어느 클랜 소속인지**를 안다.
 *   각 선수의 매치 목록에는 자기 자신의 기록이 들어 있다(D-048 관측값).
 *   따라서 같은 `match_id`를 여러 선수에게서 관측하면 참가자 구성을 **모을** 수 있다.
 *
 * 절대 규칙
 *   1. **관측되지 않은 참가자를 만들지 않는다.** 그 선수의 목록에서 그 경기가 실제로
 *      나왔을 때만 참가자로 인정한다.
 *   2. 닉네임·클랜명 문자열로 소속을 판정하지 않는다. **로스터 등록 기록**으로 판정한다.
 *   3. 하나라도 조건이 모자라면 투영하지 않고 사유를 남긴다. 부분 저장은 없다.
 *   4. 상세와 관측값이 어긋나면 **자동 투영하지 않는다**(conflict).
 */

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

/** 매치 상세에서 온 참가자 (`NexonMatchParticipant`) — **보조 증거**다 */
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
  outcome: Outcome
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
  /** 상세에는 있는데 관측이 없는 사람 수 (그 사람 폴링이 남았다는 뜻) */
  missingObservations: number
  ambiguousIdentities: number
  rosterMismatches: number
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
    missingObservations: 0,
    ambiguousIdentities: 0,
    rosterMismatches: 0,
  }
}

export function evaluateReconstruction(input: ReconstructionInput): ReconstructionResult {
  const summary = emptySummary(input)
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
  if (input.match.dateMatch === null) {
    return fail('no_date', '경기 시각을 알 수 없다')
  }
  if (!input.match.matchType || !input.league.allowedMatchTypes.includes(input.match.matchType)) {
    return fail('match_type', `리그가 인정하지 않는 매치 유형이다: ${input.match.matchType ?? '없음'}`)
  }
  if (!input.match.matchMap) return fail('no_map', '맵 정보가 없다')
  const mapId = input.league.mapIdByName.get(input.match.matchMap)
  if (!mapId) {
    return fail('map_not_in_league', `리그 기록 대상 맵이 아니다: ${input.match.matchMap}`)
  }

  const at = input.match.dateMatch

  /* --- 1) 관측값 → 확정 참가자 --------------------------------------------- */
  interface Confirmed {
    playerId: string
    membership: RosterMembership
    outcome: Outcome
    kill: number
    death: number
    assist: number
    sources: string[]
  }
  const confirmed: Confirmed[] = []

  for (const observation of input.observations) {
    // 신원이 확정되지 않았으면 참가자로 인정하지 않는다 (닉네임 병합 금지 — D-036)
    if (observation.playerId === null || observation.identityStatus !== 'active') {
      summary.ambiguousIdentities += 1
      continue
    }
    const membership = membershipAt(input.memberships, observation.playerId, at)
    if (!membership || (requireVerified && !membership.verified)) {
      summary.rosterMismatches += 1
      continue
    }
    if (observation.outcome === null) {
      summary.conflicts.push(`${observation.playerId}: 승패를 알 수 없는 관측값`)
      continue
    }
    if (observation.kill === null || observation.death === null || observation.assist === null) {
      summary.conflicts.push(`${observation.playerId}: k/d/a가 비어 있는 관측값`)
      continue
    }

    summary.observationsUsable += 1
    confirmed.push({
      playerId: observation.playerId,
      membership,
      outcome: observation.outcome,
      kill: observation.kill,
      death: observation.death,
      assist: observation.assist,
      sources: ['player_match_list'],
    })
  }

  const playerIds = confirmed.map((entry) => entry.playerId)
  if (new Set(playerIds).size !== playerIds.length) {
    return fail('duplicate_player', '같은 플레이어의 관측값이 중복됐다')
  }
  summary.confirmed = confirmed.length

  /* --- 2) 상세와 교차검증 (상세는 보조 증거다 — D-054) ---------------------- */
  const detailByPlayer = new Map<string, DetailParticipantInput>()
  for (const participant of input.detail) {
    if (participant.resolvedPlayerId) detailByPlayer.set(participant.resolvedPlayerId, participant)
  }

  for (const entry of confirmed) {
    const participant = detailByPlayer.get(entry.playerId)
    if (!participant) continue
    summary.crossChecked += 1

    const mismatched: string[] = []
    if (participant.kill !== null && participant.kill !== entry.kill) mismatched.push('kill')
    if (participant.death !== null && participant.death !== entry.death) mismatched.push('death')
    if (participant.assist !== null && participant.assist !== entry.assist) mismatched.push('assist')
    if (participant.outcome !== null && participant.outcome !== entry.outcome) {
      mismatched.push('outcome')
    }
    if (mismatched.length > 0) {
      summary.conflicts.push(`${entry.playerId}: 상세와 관측값 불일치 (${mismatched.join(', ')})`)
    } else {
      entry.sources.push('match_detail')
      // 상세에만 있는 값은 여기서만 얻을 수 있다
    }
  }

  // 상세에 나왔고 로스터 소속인데 관측이 없는 사람 = 아직 폴링하지 못한 선수
  for (const participant of input.detail) {
    if (!participant.resolvedPlayerId) continue
    if (playerIds.includes(participant.resolvedPlayerId)) continue
    const membership = membershipAt(input.memberships, participant.resolvedPlayerId, at)
    if (membership && (!requireVerified || membership.verified)) summary.missingObservations += 1
  }

  if (summary.conflicts.length > 0) {
    return fail(
      'conflict_with_detail',
      `상세와 관측값이 어긋난다 (${summary.conflicts.length}건). 자동 투영하지 않는다`,
    )
  }

  /* --- 3) 클랜별 구성 ------------------------------------------------------ */
  const byClan = new Map<string, Confirmed[]>()
  for (const entry of confirmed) {
    const bucket = byClan.get(entry.membership.leagueClanId)
    if (bucket) bucket.push(entry)
    else byClan.set(entry.membership.leagueClanId, [entry])
  }
  for (const [clanId, members] of byClan) summary.perClan[clanId] = members.length

  if (summary.missingObservations > 0) {
    return fail(
      'missing_observation',
      `상세에 나왔지만 목록 관측이 없는 선수 ${summary.missingObservations}명 — 폴링이 더 필요하다`,
    )
  }
  if (byClan.size < 2) {
    return fail(
      'incomplete_roster',
      `확정된 클랜이 ${byClan.size}곳뿐이다 (관측 ${summary.confirmed}명). 상대 클랜 선수의 관측이 없다`,
    )
  }
  if (byClan.size > 2) {
    return fail('roster_mismatch', `클랜이 ${byClan.size}곳이다. 클랜전으로 볼 수 없다`)
  }

  const [clanA, clanB] = [...byClan.keys()] as [string, string]
  const sizeA = byClan.get(clanA)?.length ?? 0
  const sizeB = byClan.get(clanB)?.length ?? 0

  if (sizeA !== sizeB) {
    return fail('incomplete_roster', `양 팀 인원이 다르다 (${sizeA} vs ${sizeB})`)
  }
  if (!input.league.playerLimits.includes(sizeA)) {
    return fail(
      'incomplete_roster',
      `리그 대전 인원(${input.league.playerLimits.join('/')})이 아니다: ${sizeA}명`,
    )
  }

  /* --- 4) 승패 일관성 ------------------------------------------------------ */
  const outcomesA = new Set((byClan.get(clanA) ?? []).map((entry) => entry.outcome))
  const outcomesB = new Set((byClan.get(clanB) ?? []).map((entry) => entry.outcome))
  if (outcomesA.size !== 1 || outcomesB.size !== 1) {
    return fail('inconsistent_outcome', '같은 클랜 안에서 승패가 엇갈린다')
  }
  const outcomeA = [...outcomesA][0]
  const outcomeB = [...outcomesB][0]
  const winnerClan =
    outcomeA === 'win' && outcomeB === 'lose'
      ? clanA
      : outcomeB === 'win' && outcomeA === 'lose'
        ? clanB
        : null
  if (winnerClan === null) {
    return fail('no_winner', '승패를 판정할 수 없다 (무승부이거나 결과가 엇갈린다)')
  }

  /* --- 5) 진영 배정 + 계획 -------------------------------------------------- */
  const teamIdByClan = new Map<string, string>()
  for (const entry of confirmed) {
    const participant = detailByPlayer.get(entry.playerId)
    if (participant?.teamId) teamIdByClan.set(entry.membership.leagueClanId, participant.teamId)
  }
  const sides = assignSidesByEvidence([clanA, clanB], teamIdByClan)

  const buildSide = (clanId: string, side: 'red' | 'blue'): ReconstructionSidePlan => {
    const members = byClan.get(clanId) ?? []
    const first = members[0]!
    return {
      leagueClanId: clanId,
      clanName: first.membership.clanName,
      division: first.membership.division,
      members: members.map((entry): ReconstructedParticipant => {
        const participant = detailByPlayer.get(entry.playerId)
        return {
          playerId: entry.playerId,
          leagueClanId: clanId,
          side,
          outcome: entry.outcome,
          kill: entry.kill,
          death: entry.death,
          assist: entry.assist,
          headshot: participant?.headshot ?? null,
          damage: participant?.damage ?? null,
          sources: entry.sources,
        }
      }),
    }
  }

  return {
    ok: true,
    summary,
    plan: {
      leagueId: input.league.leagueId,
      mapId,
      mapName: input.match.matchMap,
      startAt: at,
      playerCount: sizeA,
      winnerSide: winnerClan === sides.red ? 'red' : 'blue',
      red: buildSide(sides.red, 'red'),
      blue: buildSide(sides.blue, 'blue'),
    },
  }
}
