/**
 * 투영(projection) 규칙 — **순수 함수**.
 *
 * 스테이징(`NexonMatch`)에서 운영(`Match`)으로 넘어가도 되는 경기인지만 판정한다.
 * DB를 건드리지 않으므로 규칙 자체를 네트워크·DB 없이 전량 테스트할 수 있다.
 *
 * 하나라도 어긋나면 **투영하지 않고 사유를 남긴다.** 부분 저장은 하지 않는다
 * (`docs/NEXON_INGEST_SPEC.md` 7장).
 */

export type Outcome = 'win' | 'lose' | 'draw'

export interface ProjectionParticipant {
  slot: number
  teamId: string | null
  userName: string | null
  clanName: string | null
  outcome: Outcome | null
  resolvedPlayerId: string | null
  kill: number | null
  death: number | null
  assist: number | null
  headshot: number | null
  damage: number | null
}

export interface ProjectionMatch {
  sourceMatchId: string
  matchType: string | null
  matchMap: string | null
  dateMatch: Date | null
  participants: readonly ProjectionParticipant[]
}

export interface LeagueClanProfile {
  leagueClanId: string
  clanId: string
  /** 경기 시점 스냅샷으로 기록할 현재 부리그 */
  division: number
}

export interface LeagueProfile {
  leagueId: string
  slug: string
  /** 리그가 인정하는 매치 유형 (기본: 클랜전 계열) */
  allowedMatchTypes: readonly string[]
  /** 맵 이름 → GameMap.id */
  mapIdByName: ReadonlyMap<string, string>
  /** 리그가 기록 대상으로 삼는 대전 인원 (5 / 6) */
  playerLimits: readonly number[]
  /** 클랜 이름 → 리그 소속 정보 */
  leagueClanByClanName: ReadonlyMap<string, LeagueClanProfile>
  /** 이 리그에 mock 시드 경기가 섞여 있는가 */
  hasMockMatches: boolean
}

export interface ProjectionSidePlan {
  leagueClanId: string
  clanId: string
  division: number
  clanName: string
  teamId: string
  members: readonly ProjectionParticipant[]
}

export interface ProjectionPlan {
  leagueId: string
  mapId: string
  mapName: string
  playerCount: number
  startAt: Date
  winnerSide: 'red' | 'blue'
  red: ProjectionSidePlan
  blue: ProjectionSidePlan
}

export type ProjectionResult =
  | { ok: true; plan: ProjectionPlan }
  | { ok: false; code: string; reason: string }

function skip(code: string, reason: string): ProjectionResult {
  return { ok: false, code, reason }
}

/**
 * 진영(red/blue) 배정.
 *
 * **넥슨은 진영 색을 주지 않는다.** `team_id`의 의미도 [미확인]이다.
 * 그래서 "원본이 이랬다"고 주장하지 않고, `team_id` 오름차순으로 red/blue를 배정하는
 * **내부 규칙**을 쓴다. 같은 경기를 다시 투영해도 결과가 같아야 하기 때문이다 (D-037).
 */
export function assignSides(teamIds: readonly string[]): { red: string; blue: string } | null {
  if (teamIds.length !== 2) return null
  const sorted = [...teamIds].sort()
  const [red, blue] = sorted
  if (!red || !blue) return null
  return { red, blue }
}

export function evaluateProjection(
  match: ProjectionMatch,
  league: LeagueProfile,
  options: { allowMockLeague?: boolean } = {},
): ProjectionResult {
  if (league.hasMockMatches && options.allowMockLeague !== true) {
    return skip(
      'mock_league',
      'mock 시드 경기가 있는 리그다. 실제 기록과 섞지 않는다 (--allow-mock-league 필요)',
    )
  }

  if (match.dateMatch === null) {
    return skip('no_date', '경기 시각을 알 수 없다')
  }

  if (!match.matchType || !league.allowedMatchTypes.includes(match.matchType)) {
    return skip('match_type', `리그가 인정하지 않는 매치 유형이다: ${match.matchType ?? '없음'}`)
  }

  if (!match.matchMap) {
    return skip('no_map', '맵 정보가 없다')
  }
  const mapId = league.mapIdByName.get(match.matchMap)
  if (!mapId) {
    return skip('map_not_in_league', `리그 기록 대상 맵이 아니다: ${match.matchMap}`)
  }

  if (match.participants.length === 0) {
    return skip('no_participants', '참가자가 없다')
  }

  const teams = new Map<string, ProjectionParticipant[]>()
  for (const participant of match.participants) {
    if (!participant.teamId) return skip('no_team_id', 'team_id가 없는 참가자가 있다')
    const bucket = teams.get(participant.teamId)
    if (bucket) bucket.push(participant)
    else teams.set(participant.teamId, [participant])
  }
  if (teams.size !== 2) {
    return skip('team_count', `팀이 2개가 아니다 (${teams.size}개)`)
  }

  const sides = assignSides([...teams.keys()])
  if (!sides) return skip('team_count', '진영을 배정할 수 없다')

  const built: Record<'red' | 'blue', ProjectionSidePlan> = {} as Record<
    'red' | 'blue',
    ProjectionSidePlan
  >

  for (const side of ['red', 'blue'] as const) {
    const teamId = sides[side]
    const members = teams.get(teamId) ?? []

    const clanNames = new Set(members.map((member) => member.clanName))
    if (clanNames.size !== 1) {
      return skip('mixed_clan', `한 팀에 클랜이 ${clanNames.size}개다`)
    }
    const [clanName] = [...clanNames]
    if (!clanName) {
      return skip('no_clan_name', '클랜 이름이 없다 (클랜전 계열이 아닐 수 있다)')
    }

    const leagueClan = league.leagueClanByClanName.get(clanName)
    if (!leagueClan) {
      return skip('clan_not_in_league', `리그 소속 클랜이 아니다: ${clanName}`)
    }

    if (!league.playerLimits.includes(members.length)) {
      return skip('player_limit', `리그 대전 인원이 아니다: ${members.length}`)
    }

    built[side] = {
      leagueClanId: leagueClan.leagueClanId,
      clanId: leagueClan.clanId,
      division: leagueClan.division,
      clanName,
      teamId,
      members,
    }
  }

  if (built.red.members.length !== built.blue.members.length) {
    return skip('uneven_teams', '양 팀 인원이 다르다')
  }
  if (built.red.clanName === built.blue.clanName) {
    return skip('same_clan', '양 팀 클랜이 같다')
  }

  const unresolved = match.participants.filter(
    (participant) => participant.resolvedPlayerId === null,
  )
  if (unresolved.length > 0) {
    return skip(
      'unresolved_participants',
      `플레이어로 해석되지 않은 참가자 ${unresolved.length}명 — 자동 병합하지 않는다`,
    )
  }

  const missingKda = match.participants.filter(
    (participant) =>
      participant.kill === null || participant.death === null || participant.assist === null,
  )
  if (missingKda.length > 0) {
    return skip(
      'missing_kda',
      `킬·데스·어시스트가 없는 참가자 ${missingKda.length}명 — 0으로 채우지 않는다`,
    )
  }

  const playerIds = match.participants.map((participant) => participant.resolvedPlayerId)
  if (new Set(playerIds).size !== playerIds.length) {
    return skip('duplicate_player', '같은 플레이어가 두 번 들어 있다')
  }

  const redOutcomes = new Set(built.red.members.map((member) => member.outcome))
  const blueOutcomes = new Set(built.blue.members.map((member) => member.outcome))
  if (redOutcomes.size !== 1 || blueOutcomes.size !== 1) {
    return skip('mixed_outcome', '같은 팀 안에서 승패가 엇갈린다')
  }
  const redOutcome = [...redOutcomes][0]
  const blueOutcome = [...blueOutcomes][0]
  const winnerSide =
    redOutcome === 'win' && blueOutcome === 'lose'
      ? 'red'
      : blueOutcome === 'win' && redOutcome === 'lose'
        ? 'blue'
        : null
  if (winnerSide === null) {
    return skip('no_winner', '승패를 판정할 수 없다 (무승부이거나 결과 코드가 엇갈린다)')
  }

  return {
    ok: true,
    plan: {
      leagueId: league.leagueId,
      mapId,
      mapName: match.matchMap,
      playerCount: built.red.members.length,
      startAt: match.dateMatch,
      winnerSide,
      red: built.red,
      blue: built.blue,
    },
  }
}
