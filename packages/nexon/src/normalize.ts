/**
 * 정규화 — 넥슨 응답 → 스테이징 입력.
 *
 * **순수 함수만 둔다.** 네트워크도 DB도 건드리지 않는다. 그래야 저장해 둔 응답 픽스처로
 * 네트워크 없이 전량 테스트할 수 있고, 원본을 다시 받지 않고도 재변환할 수 있다.
 *
 * 규칙
 * - 없는 값은 `null`이다. 기본값으로 채우지 않는다 (`docs/NEXON_INGEST_SPEC.md` 1-3).
 * - 원본 코드(`match_result` 등)는 해석값과 **함께** 보존한다. 해석이 틀려도 원본이 남는다.
 */
import { toMatchOutcome, type MatchOutcome } from './endpoints'
import type { NexonMatchDetailResponse, NexonMatchListResponse } from './schemas'

export interface NormalizedMatchListEntry {
  sourceMatchId: string
  matchMode: string | null
  matchType: string | null
  dateMatch: Date | null
  /** 원본 코드 그대로 (1/2/3) */
  matchResult: string | null
  /** 해석값. 모드에 따라 승패가 아닐 수 있어 `null`이 정상이다 */
  outcome: MatchOutcome | null
  kill: number | null
  death: number | null
  assist: number | null
}

export interface NormalizedParticipant {
  /** 응답 배열 순서. 넥슨이 참가자 식별자를 주지 않아 슬롯이 유일한 안정 키다 */
  slot: number
  teamId: string | null
  matchResult: string | null
  outcome: MatchOutcome | null
  userName: string | null
  seasonGrade: string | null
  /** 클랜전 계열에서만 내려온다 */
  clanName: string | null
  kill: number | null
  death: number | null
  assist: number | null
  headshot: number | null
  damage: number | null
}

export interface NormalizedMatchDetail {
  sourceMatchId: string
  matchMode: string | null
  matchType: string | null
  dateMatch: Date | null
  matchMap: string | null
  participants: NormalizedParticipant[]
}

/**
 * 넥슨 시각 문자열 → Date.
 *
 * 스펙 표기는 `2023-12-14T08:28:35Z` (UTC0)다. 타임존 표기가 빠진 값이 오면
 * **스펙대로 UTC로 해석한다.** (로컬 시간으로 읽으면 9시간이 밀린다)
 */
export function parseNexonDateTime(value: string | null | undefined): Date | null {
  if (!value) return null
  const text = value.trim().replace(' ', 'T')
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(text)
  const parsed = new Date(hasZone ? text : `${text}Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** 매치 목록 정규화. `match_id`가 없는 항목은 버리지 않고 `skipped`로 보고한다. */
export function normalizeMatchList(response: NexonMatchListResponse): {
  entries: NormalizedMatchListEntry[]
  skipped: number
} {
  const entries: NormalizedMatchListEntry[] = []
  let skipped = 0

  for (const item of response.match) {
    if (!item.match_id) {
      skipped += 1
      continue
    }
    entries.push({
      sourceMatchId: item.match_id,
      matchMode: item.match_mode,
      matchType: item.match_type,
      dateMatch: parseNexonDateTime(item.date_match),
      matchResult: item.match_result,
      outcome: toMatchOutcome(item.match_result),
      kill: item.kill,
      death: item.death,
      assist: item.assist,
    })
  }

  return { entries, skipped }
}

/** 매치 상세 정규화. `match_id`가 없으면 스테이징에 넣을 수 없으므로 `null`. */
export function normalizeMatchDetail(
  response: NexonMatchDetailResponse,
  fallbackMatchId?: string,
): NormalizedMatchDetail | null {
  const sourceMatchId = response.match_id ?? fallbackMatchId ?? null
  if (!sourceMatchId) return null

  return {
    sourceMatchId,
    matchMode: response.match_mode,
    matchType: response.match_type,
    dateMatch: parseNexonDateTime(response.date_match),
    matchMap: response.match_map,
    participants: response.match_detail.map((item, index) => ({
      slot: index,
      teamId: item.team_id,
      matchResult: item.match_result,
      outcome: toMatchOutcome(item.match_result),
      userName: item.user_name,
      seasonGrade: item.season_grade,
      clanName: item.clan_name,
      kill: item.kill,
      death: item.death,
      assist: item.assist,
      headshot: item.headshot,
      damage: item.damage,
    })),
  }
}

/* --------------------------------------------------------------------- 검증 --- */

export interface ValidationIssue {
  code: string
  message: string
}

/**
 * 스테이징 단계 검증.
 *
 * 여기서 하는 일은 **"우리가 다룰 수 있는 형태인가"** 판정뿐이다.
 * 리그 소속·맵·인원 같은 도메인 조건은 투영 규칙에서 따진다.
 */
export function validateMatchDetail(detail: NormalizedMatchDetail): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (detail.participants.length === 0) {
    issues.push({ code: 'no_participants', message: '참가자가 한 명도 없다' })
  }
  if (detail.dateMatch === null) {
    issues.push({ code: 'no_date', message: 'date_match를 해석할 수 없다' })
  }
  if (detail.participants.some((participant) => !participant.userName)) {
    issues.push({ code: 'participant_without_name', message: '닉네임이 없는 참가자가 있다' })
  }

  const teamIds = new Set(
    detail.participants.map((participant) => participant.teamId).filter((id): id is string => !!id),
  )
  if (teamIds.size === 0) {
    issues.push({ code: 'no_team_id', message: 'team_id가 없다' })
  }

  return issues
}

/** `teamId` → 참가자. `teamId`가 없는 참가자는 `""` 키로 모인다. */
export function groupByTeam(
  participants: readonly NormalizedParticipant[],
): Map<string, NormalizedParticipant[]> {
  const teams = new Map<string, NormalizedParticipant[]>()
  for (const participant of participants) {
    const key = participant.teamId ?? ''
    const bucket = teams.get(key)
    if (bucket) bucket.push(participant)
    else teams.set(key, [participant])
  }
  return teams
}

/**
 * 승리 팀 판정.
 *
 * 팀 안의 결과가 엇갈리거나(개인전 모드 등) 승리 팀이 하나로 좁혀지지 않으면 **`null`** 이다.
 * 억지로 정하지 않는다 — 모르는 것은 모른다고 둔다.
 */
export function deriveWinnerTeamId(participants: readonly NormalizedParticipant[]): string | null {
  const teams = groupByTeam(participants)
  if (teams.size !== 2) return null

  let winner: string | null = null
  for (const [teamId, members] of teams) {
    if (teamId === '') return null
    const outcomes = new Set(members.map((member) => member.outcome))
    if (outcomes.size !== 1) return null
    const [outcome] = [...outcomes]
    if (outcome === 'win') {
      if (winner !== null) return null
      winner = teamId
    } else if (outcome !== 'lose') {
      return null
    }
  }
  return winner
}
