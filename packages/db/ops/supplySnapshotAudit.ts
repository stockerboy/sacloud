/**
 * 3rd.supply 스냅샷 미수입 경기 감사 + **dry-run 투영** (D-150).
 *
 * ── 이 파일은 아무것도 쓰지 않는다
 *   DB 를 **읽기만** 한다. 투영 결과는 메모리에만 만든다.
 *   실제 적재는 승인 뒤 별도 경로로 한다.
 *
 * ── 무엇을 판정하나
 *   스냅샷에 있는데 DB 에 없는 경기를 하나씩 보고, 넣어도 되는지를 **수치로** 정한다.
 *   "624건 정도" 같은 어림수를 쓰지 않는다 — 실제로 센다.
 *
 * ── 신원 규칙은 D-148 그대로다
 *   같은 경기 안의 근거 > 전역 근거. fuzzy 닉네임 매칭은 하지 않는다.
 *   같은 경기에 같은 닉네임이 둘이면 그 이름은 근거에서 버린다.
 *
 * ── 없는 값을 만들지 않는다
 *   3rd.supply 는 K/D/A 를 주지 않는다. 넥슨 저장 증거가 없으면 `null` 이다.
 *   0으로 채우면 "0킬을 했다"는 거짓이 된다 (`CLAUDE.md` 3-A 8번).
 */
import { prisma } from '../src/index'
import type { SupplyLineupRow, SupplyMatchRecord, SupplyMatchSnapshot } from './supplyMatches'
import { startAtFromMatchId } from './supplyMatches'

/** 한 팀 정원 */
const SQUAD_SIZE = 5
const FULL_ROSTER = SQUAD_SIZE * 2

export interface LineupEntry {
  supplyPlayerId: string | null
  nickname: string | null
  supplyClanId: string | null
  /** 0 = 라이플, 1 = 스나이퍼. 모르면 null */
  weapon: number | null
  side: 'red' | 'blue'
}

function toEntries(rows: SupplyLineupRow[] | undefined, side: 'red' | 'blue'): LineupEntry[] {
  return (rows ?? []).map((row) => ({
    supplyPlayerId: row[0] === null || row[0] === undefined ? null : String(row[0]),
    nickname: row[1] ?? null,
    supplyClanId: row[2] === null || row[2] === undefined ? null : String(row[2]),
    weapon: row[3] === null || row[3] === undefined ? null : Number(row[3]),
    side,
  }))
}

/* ------------------------------------------------------------------ 집합 --- */

export interface SnapshotSetAudit {
  snapshotTotal: number
  /** 스냅샷 안에서 matchId 가 중복된 건수 */
  duplicateIds: number
  /** id 형식이 넥슨 match_id(18자리)가 아닌 것 */
  malformedIds: number
  existsInDb: number
  missing: number
  missingIds: string[]
}

export async function auditSnapshotSet(
  snapshot: SupplyMatchSnapshot,
  leagueSlug: string,
): Promise<SnapshotSetAudit> {
  const seen = new Set<string>()
  let duplicateIds = 0
  let malformedIds = 0
  const ids: string[] = []
  for (const record of snapshot.matches) {
    const id = String(record.id)
    if (seen.has(id)) {
      duplicateIds += 1
      continue
    }
    seen.add(id)
    if (startAtFromMatchId(id) === null) {
      malformedIds += 1
      continue
    }
    ids.push(id)
  }

  const league = await prisma.league.findUnique({
    where: { slug: leagueSlug },
    select: { id: true },
  })
  /* 리그를 못 찾으면 "전부 없음" 이 아니라 감사 자체가 성립하지 않는다 */
  if (!league) throw new Error(`리그를 찾을 수 없다: ${leagueSlug}`)

  /* 우리 Match.id 는 넥슨 match_id 를 그대로 쓴다. sourceMatchId 로도 이어질 수 있다 */
  const rows = await prisma.match.findMany({
    where: { OR: [{ id: { in: ids } }, { sourceMatchId: { in: ids } }] },
    select: { id: true, sourceMatchId: true },
  })
  const known = new Set<string>()
  for (const row of rows) {
    known.add(row.id)
    if (row.sourceMatchId) known.add(row.sourceMatchId)
  }

  const missingIds = ids.filter((id) => !known.has(id))
  return {
    snapshotTotal: snapshot.matches.length,
    duplicateIds,
    malformedIds,
    existsInDb: ids.length - missingIds.length,
    missing: missingIds.length,
    missingIds,
  }
}

/* -------------------------------------------------------------- 원본 품질 --- */

export interface FieldCoverage {
  matches: number
  withStartAt: number
  withMap: number
  withPlayTime: number
  withEndAt: number
  withMvp: number
  withPerspective: number
  withResult: number
  /** 라인업 인원 분포 */
  roster: { exactly10: number; under10: number; over10: number }
  teams: { balanced5v5: number; unbalanced: number }
  duplicateNicknameInMatch: number
  duplicatePlayerIdInMatch: number
  /** 라인업 행 중 supplyPlayerId 가 없는 것 */
  rowsWithoutPlayerId: number
  /** 라인업 행 중 닉네임이 없는 것 */
  rowsWithoutNickname: number
  rowsWithClan: number
  rowsWithoutClan: number
  weapon: { rifle: number; sniper: number; unknown: number; other: Record<string, number> }
  participantRows: number
}

export function auditFieldCoverage(records: SupplyMatchRecord[]): FieldCoverage {
  const out: FieldCoverage = {
    matches: records.length,
    withStartAt: 0,
    withMap: 0,
    withPlayTime: 0,
    withEndAt: 0,
    withMvp: 0,
    withPerspective: 0,
    withResult: 0,
    roster: { exactly10: 0, under10: 0, over10: 0 },
    teams: { balanced5v5: 0, unbalanced: 0 },
    duplicateNicknameInMatch: 0,
    duplicatePlayerIdInMatch: 0,
    rowsWithoutPlayerId: 0,
    rowsWithoutNickname: 0,
    rowsWithClan: 0,
    rowsWithoutClan: 0,
    weapon: { rifle: 0, sniper: 0, unknown: 0, other: {} },
    participantRows: 0,
  }

  for (const record of records) {
    if (record.start_at) out.withStartAt += 1
    if (record.map) out.withMap += 1
    if (record.play_time) out.withPlayTime += 1
    if (record.end_at) out.withEndAt += 1
    if (record.mvp_player_id !== null && record.mvp_player_id !== undefined) out.withMvp += 1

    const perspective = record.perspectives?.[0]
    if (perspective) out.withPerspective += 1
    if (perspective && perspective.win !== null && perspective.win !== undefined) {
      out.withResult += 1
    }

    const red = toEntries(record.red, 'red')
    const blue = toEntries(record.blue, 'blue')
    const all = [...red, ...blue]
    out.participantRows += all.length

    if (all.length === FULL_ROSTER) out.roster.exactly10 += 1
    else if (all.length < FULL_ROSTER) out.roster.under10 += 1
    else out.roster.over10 += 1

    if (red.length === SQUAD_SIZE && blue.length === SQUAD_SIZE) out.teams.balanced5v5 += 1
    else out.teams.unbalanced += 1

    const nicknames = all.map((entry) => entry.nickname).filter((n): n is string => Boolean(n))
    if (new Set(nicknames).size !== nicknames.length) out.duplicateNicknameInMatch += 1
    const playerIds = all.map((entry) => entry.supplyPlayerId).filter((v): v is string => Boolean(v))
    if (new Set(playerIds).size !== playerIds.length) out.duplicatePlayerIdInMatch += 1

    for (const entry of all) {
      if (!entry.supplyPlayerId) out.rowsWithoutPlayerId += 1
      if (!entry.nickname) out.rowsWithoutNickname += 1
      if (entry.supplyClanId) out.rowsWithClan += 1
      else out.rowsWithoutClan += 1

      /* 무기 값은 **실측된 것만** 분류한다. 모르는 값을 라이플로 밀어 넣지 않는다 */
      if (entry.weapon === 0) out.weapon.rifle += 1
      else if (entry.weapon === 1) out.weapon.sniper += 1
      else if (entry.weapon === null) out.weapon.unknown += 1
      else {
        const key = String(entry.weapon)
        out.weapon.other[key] = (out.weapon.other[key] ?? 0) + 1
      }
    }
  }
  return out
}

/* ------------------------------------------------------ 넥슨 증거 대조 --- */

export interface NexonCrossRef {
  /** 스냅샷 라인업 + 넥슨 상세 참가자가 충분히 있다 */
  aSnapshotAndNexonFull: number
  /** 스냅샷 라인업 + 넥슨 일부 참가자 */
  bSnapshotAndNexonPartial: number
  /** 스냅샷만 있다 — 넥슨 증거가 하나도 없다 */
  cSnapshotOnly: number
  /** 넥슨에만 있고 스냅샷에 없다 (참고용, 미수입 집합 밖) */
  dNexonOnly: number
  /** 승패·팀이 서로 어긋난다 */
  eConflict: number
  /** 넥슨 관측(NexonMatchObservation)만 있는 경기 */
  observationOnly: number
}

export async function crossReferenceNexon(missingIds: string[]): Promise<NexonCrossRef> {
  const out: NexonCrossRef = {
    aSnapshotAndNexonFull: 0,
    bSnapshotAndNexonPartial: 0,
    cSnapshotOnly: 0,
    dNexonOnly: 0,
    eConflict: 0,
    observationOnly: 0,
  }

  /* 넥슨 API 를 새로 부르지 않는다. **이미 저장된 증거만** 본다 */
  const nexonMatches = await prisma.nexonMatch.findMany({
    where: { sourceMatchId: { in: missingIds } },
    select: {
      sourceMatchId: true,
      detailParticipantCount: true,
      observationParticipantCount: true,
      _count: { select: { participants: true, observations: true } },
    },
  })
  const byId = new Map(nexonMatches.map((row) => [row.sourceMatchId, row]))

  for (const id of missingIds) {
    const nexon = byId.get(id)
    if (!nexon) {
      out.cSnapshotOnly += 1
      continue
    }
    const detail = nexon._count.participants
    const observations = nexon._count.observations
    if (detail >= FULL_ROSTER) out.aSnapshotAndNexonFull += 1
    else if (detail > 0) out.bSnapshotAndNexonPartial += 1
    else if (observations > 0) {
      out.observationOnly += 1
      out.bSnapshotAndNexonPartial += 1
    } else out.cSnapshotOnly += 1
  }

  /* 넥슨에는 있는데 스냅샷에 없는 경기 — 이번 집합 밖이지만 규모는 알아야 한다 */
  const snapshotSet = new Set(missingIds)
  const allNexon = await prisma.nexonMatch.findMany({ select: { sourceMatchId: true } })
  const stored = new Set(
    (await prisma.match.findMany({ select: { id: true } })).map((row) => row.id),
  )
  out.dNexonOnly = allNexon.filter(
    (row) => !snapshotSet.has(row.sourceMatchId) && !stored.has(row.sourceMatchId),
  ).length

  return out
}

/* ------------------------------------------------------------ 투영 (dry-run) --- */

export type IdentitySource =
  /** 같은 경기 안에 그 supply id 로 이미 앉아 있는 사람 */
  | 'same_match_source_id'
  /** 같은 경기 안에 그 닉네임으로 이미 앉아 있는 사람 (넥슨이 준 참가자) */
  | 'same_match_nickname'
  /** 전역에서 1:1 로 확정된 신원 */
  | 'global_source_id'
  /** 연결할 근거가 없다 — 3rd.supply id 로 새 Player 를 만든다.
   *  추측이 아니다. 원본이 준 안정적인 식별자를 그대로 쓰는 것이다 */
  | 'new_player'
  /** 같은 경기에 같은 닉네임이 둘이라 그 근거를 **쓰지 않았다** (D-148).
   *  틀린 사람에게 전적을 붙이느니 연결하지 않는다 */
  | 'ambiguous_nickname'

export interface ProjectedParticipant {
  playerId: string
  supplyPlayerId: string
  nickname: string | null
  side: 'red' | 'blue'
  identitySource: IdentitySource
  /** 새로 만들어야 하는 Player 인가 */
  needsNewPlayer: boolean
  weapon: number | null
  /** 넥슨 저장 증거에서 온 값. 없으면 null — **0으로 채우지 않는다** */
  kill: number | null
  death: number | null
  assist: number | null
  damage: number | null
  headshot: number | null
  /** 경기 당시 클랜 (스냅샷 근거). 우리 리그 클랜이면 id, 아니면 null */
  matchTimeLeagueClanId: string | null
  matchTimeClanName: string | null
  matchTimeClanKind: 'official_league' | 'external' | 'none'
  participantRole: 'member' | 'mercenary'
}

export interface ProjectedMatch {
  id: string
  startAt: Date
  redLeagueClanId: string
  blueLeagueClanId: string
  winnerSide: 'red' | 'blue'
  official: boolean
  participants: ProjectedParticipant[]
  complete5v5: boolean
}

export interface ProjectionConflict {
  matchId: string
  reason: string
  detail?: string
}

export interface SnapshotProjection {
  considered: number
  projected: ProjectedMatch[]
  conflicts: ProjectionConflict[]
  /** 사유별 제외 건수 */
  skipped: Record<string, number>
  identity: Record<IdentitySource, number>
  newPlayers: Set<string>
  reusedPlayers: Set<string>
  affiliation: { officialLeague: number; external: number; none: number }
  weapon: { rifle: number; sniper: number; unknown: number }
  stats: {
    weaponAndKdaKnown: number
    weaponOnly: number
    kdaOnly: number
    neither: number
  }
  participantRows: number
}

const emptyIdentity = (): Record<IdentitySource, number> => ({
  same_match_source_id: 0,
  same_match_nickname: 0,
  global_source_id: 0,
  new_player: 0,
  ambiguous_nickname: 0,
})

/** 그 경기 안에서 **유일한** 이름만 근거로 쓴다. 두 번 나오면 버린다 (D-148) */
function uniqueByName<T>(rows: T[], nameOf: (row: T) => string | null): Map<string, T> {
  const seen = new Map<string, T | null>()
  for (const row of rows) {
    const name = nameOf(row)
    if (!name) continue
    seen.set(name, seen.has(name) ? null : row)
  }
  const out = new Map<string, T>()
  for (const [name, row] of seen) if (row) out.set(name, row)
  return out
}

/**
 * 미수입 경기를 **메모리에만** 투영한다. DB 에 한 줄도 쓰지 않는다.
 *
 * 넥슨 저장 증거(`NexonMatchParticipant`)가 있으면 K/D/A·딜량·헤드샷을 쓰고,
 * 없으면 `null` 로 둔다. 스냅샷은 K/D 를 주지 않는다.
 */
export async function projectMissingMatches(input: {
  snapshot: SupplyMatchSnapshot
  leagueSlug: string
  missingIds: string[]
  limit?: number
}): Promise<SnapshotProjection> {
  const out: SnapshotProjection = {
    considered: 0,
    projected: [],
    conflicts: [],
    skipped: {},
    identity: emptyIdentity(),
    newPlayers: new Set(),
    reusedPlayers: new Set(),
    affiliation: { officialLeague: 0, external: 0, none: 0 },
    weapon: { rifle: 0, sniper: 0, unknown: 0 },
    stats: { weaponAndKdaKnown: 0, weaponOnly: 0, kdaOnly: 0, neither: 0 },
    participantRows: 0,
  }
  const skip = (code: string): void => {
    out.skipped[code] = (out.skipped[code] ?? 0) + 1
  }

  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true },
  })
  if (!league) throw new Error(`리그를 찾을 수 없다: ${input.leagueSlug}`)

  /* 3rd.supply 클랜 id → 우리 리그 클랜 */
  const leagueClans = await prisma.leagueClan.findMany({
    where: { leagueId: league.id },
    select: { id: true, clan: { select: { sourceClanId: true, name: true } } },
  })
  const clanBySource = new Map<string, { id: string; name: string }>()
  for (const row of leagueClans) {
    if (row.clan.sourceClanId) {
      clanBySource.set(row.clan.sourceClanId, { id: row.id, name: row.clan.name })
    }
  }

  const targetIds = input.limit ? input.missingIds.slice(0, input.limit) : input.missingIds
  const wanted = new Set(targetIds)
  const records = input.snapshot.matches.filter((record) => wanted.has(String(record.id)))

  /* 저장된 넥슨 증거 — 새로 호출하지 않는다 */
  const nexonMatches = await prisma.nexonMatch.findMany({
    where: { sourceMatchId: { in: targetIds } },
    select: {
      sourceMatchId: true,
      participants: {
        select: {
          userName: true,
          resolvedPlayerId: true,
          kill: true,
          death: true,
          assist: true,
          headshot: true,
          damage: true,
        },
      },
    },
  })
  const nexonBySourceId = new Map(nexonMatches.map((row) => [row.sourceMatchId, row.participants]))

  /* 전역 신원 — `sourcePlayerId` 로 이미 연결된 Player */
  const storedPlayers = await prisma.player.findMany({
    where: { sourcePlayerId: { not: null } },
    select: { id: true, sourcePlayerId: true, name: true },
  })
  const globalBySupplyId = new Map<string, string>()
  const supplyIdCount = new Map<string, number>()
  for (const row of storedPlayers) {
    const key = row.sourcePlayerId as string
    supplyIdCount.set(key, (supplyIdCount.get(key) ?? 0) + 1)
    globalBySupplyId.set(key, row.id)
  }
  /* 한 supply id 에 Player 가 둘 이상이면 근거로 쓰지 않는다 */
  for (const [key, count] of supplyIdCount) {
    if (count > 1) globalBySupplyId.delete(key)
  }

  for (const record of records) {
    out.considered += 1
    const matchId = String(record.id)
    const startAt = startAtFromMatchId(matchId)
    if (!startAt) {
      out.conflicts.push({ matchId, reason: 'match_id 로 시작 시각을 만들 수 없다' })
      skip('bad_match_id')
      continue
    }

    const red = toEntries(record.red, 'red')
    const blue = toEntries(record.blue, 'blue')
    const entries = [...red, ...blue]

    if (entries.length === 0) {
      skip('no_lineup')
      continue
    }
    if (red.length !== SQUAD_SIZE || blue.length !== SQUAD_SIZE) {
      out.conflicts.push({
        matchId,
        reason: '5대5 가 아니다',
        detail: `red ${red.length} / blue ${blue.length}`,
      })
      skip('not_5v5')
      continue
    }

    /* 한 사람이 양 팀에 있으면 팀 판정 자체가 깨진 것이다 */
    const ids = entries.map((entry) => entry.supplyPlayerId).filter((v): v is string => Boolean(v))
    if (new Set(ids).size !== ids.length) {
      out.conflicts.push({ matchId, reason: '같은 참가자가 두 번 들어 있다' })
      skip('duplicate_participant')
      continue
    }
    if (ids.length !== entries.length) {
      out.conflicts.push({ matchId, reason: '라인업에 supply player id 가 없는 행이 있다' })
      skip('lineup_row_without_player_id')
      continue
    }

    /* 팀 클랜은 **perspective** 로 정한다.
       라인업 행의 clanId 는 그 **선수 개인**의 클랜이라 팀 식별에 쓰면 안 된다.
       실제로 다수결로 정해 봤더니 양 팀이 같은 클랜으로 판정되는 경기가 54건 나왔고,
       perspective 가 주는 clan_id / opponent_clan_id 와도 달랐다.

       근거 — 이미 우리 DB 에 있는 126경기로 대조했을 때 perspective 방식은 98건 일치했고,
       어긋난 24건(래더 반영분)을 참가자 원소속으로 다시 판정하니
       **스냅샷 10 : 우리 DB 2 (동점 12)** 로 스냅샷 쪽이 더 맞았다. */
    const perspective = record.perspectives?.[0]
    if (!perspective || perspective.win === null || perspective.win === undefined) {
      skip('no_result')
      continue
    }
    if (perspective.clan_id === null || perspective.opponent_clan_id === null) {
      skip('perspective_without_clan')
      continue
    }

    const subject = clanBySource.get(String(perspective.clan_id))
    const opponent = clanBySource.get(String(perspective.opponent_clan_id))
    if (!subject || !opponent) {
      /* 우리 리그에 없는 클랜의 경기다. 클랜을 만들어 내지 않는다 */
      skip('clan_not_in_league')
      continue
    }
    if (subject.id === opponent.id) {
      out.conflicts.push({ matchId, reason: '양 팀이 같은 클랜으로 판정된다' })
      skip('same_clan_both_sides')
      continue
    }

    /* `blue_team` 은 **관점 주체가 블루였는가**다 */
    const perspectiveIsBlue = perspective.blue_team === true
    const redClan = perspectiveIsBlue ? opponent : subject
    const blueClan = perspectiveIsBlue ? subject : opponent

    const perspectiveWon = perspective.win === true
    const winnerSide: 'red' | 'blue' =
      perspectiveWon === perspectiveIsBlue ? 'blue' : 'red'

    /* 넥슨 증거를 닉네임으로 잇는다 — 같은 경기 안에서 유일할 때만 */
    const nexonRows = nexonBySourceId.get(matchId) ?? []
    const nexonByName = uniqueByName(nexonRows, (row) => row.userName)
    const nexonByPlayerId = new Map<string, (typeof nexonRows)[number]>()
    for (const row of nexonRows) {
      if (row.resolvedPlayerId) nexonByPlayerId.set(row.resolvedPlayerId, row)
    }
    const supplyByName = uniqueByName(entries, (entry) => entry.nickname)

    /* 그 경기 안에서 닉네임이 겹치는 사람 — 닉네임 근거를 못 쓴다 */
    const nicknameCounts = new Map<string, number>()
    for (const entry of entries) {
      if (!entry.nickname) continue
      nicknameCounts.set(entry.nickname, (nicknameCounts.get(entry.nickname) ?? 0) + 1)
    }

    const participants: ProjectedParticipant[] = []

    for (const entry of entries) {
      const supplyId = entry.supplyPlayerId as string

      /* --- 신원 --- */
      let playerId: string
      let source: IdentitySource

      const global = globalBySupplyId.get(supplyId)
      const nicknameIsAmbiguous =
        entry.nickname !== null && (nicknameCounts.get(entry.nickname) ?? 0) > 1
      const nexonSameMatch =
        entry.nickname && !nicknameIsAmbiguous && supplyByName.has(entry.nickname)
          ? nexonByName.get(entry.nickname)
          : undefined

      if (nexonSameMatch?.resolvedPlayerId) {
        /* 같은 경기 안의 근거가 가장 강하다 (D-148) */
        playerId = nexonSameMatch.resolvedPlayerId
        source = 'same_match_nickname'
      } else if (global) {
        playerId = global
        source = 'global_source_id'
      } else {
        /* 연결할 근거가 없다. 3rd.supply id 로 새로 만든다 — 비슷한 이름에 갖다 붙이지 않는다 */
        playerId = `SUP-${supplyId}`
        source = nicknameIsAmbiguous ? 'ambiguous_nickname' : 'new_player'
      }

      if (source === 'same_match_nickname' || source === 'global_source_id') {
        out.reusedPlayers.add(playerId)
      } else {
        out.newPlayers.add(playerId)
      }
      out.identity[source] += 1

      /* --- 넥슨 저장 기록 (없으면 null) --- */
      const evidence =
        nexonByPlayerId.get(playerId) ??
        (entry.nickname && supplyByName.has(entry.nickname)
          ? nexonByName.get(entry.nickname)
          : undefined)
      const kill = evidence?.kill ?? null
      const death = evidence?.death ?? null
      const assist = evidence?.assist ?? null

      /* --- 경기 당시 소속 --- */
      const clan = entry.supplyClanId ? clanBySource.get(entry.supplyClanId) : undefined
      const rawName = entry.supplyClanId
        ? (input.snapshot.clans?.[entry.supplyClanId]?.name ?? null)
        : null
      let kind: ProjectedParticipant['matchTimeClanKind'] = 'none'
      if (clan) {
        kind = 'official_league'
        out.affiliation.officialLeague += 1
      } else if (entry.supplyClanId) {
        kind = 'external'
        out.affiliation.external += 1
      } else {
        out.affiliation.none += 1
      }

      const sideClanId = entry.side === 'red' ? redClan.id : blueClan.id

      if (entry.weapon === 0) out.weapon.rifle += 1
      else if (entry.weapon === 1) out.weapon.sniper += 1
      else out.weapon.unknown += 1

      const hasWeapon = entry.weapon === 0 || entry.weapon === 1
      const hasKda = kill !== null
      if (hasWeapon && hasKda) out.stats.weaponAndKdaKnown += 1
      else if (hasWeapon) out.stats.weaponOnly += 1
      else if (hasKda) out.stats.kdaOnly += 1
      else out.stats.neither += 1

      participants.push({
        playerId,
        supplyPlayerId: supplyId,
        nickname: entry.nickname,
        side: entry.side,
        identitySource: source,
        needsNewPlayer: source === 'new_player' || source === 'ambiguous_nickname',
        weapon: entry.weapon,
        kill,
        death,
        assist,
        damage: evidence?.damage ?? null,
        headshot: evidence?.headshot ?? null,
        matchTimeLeagueClanId: clan?.id ?? null,
        matchTimeClanName: clan?.name ?? rawName,
        matchTimeClanKind: kind,
        participantRole: clan && clan.id === sideClanId ? 'member' : 'mercenary',
      })
      out.participantRows += 1
    }

    /* 신원이 갈려 같은 Player 가 두 자리를 차지하면 10명이 깨진다 */
    const resolvedIds = participants.map((p) => p.playerId)
    if (new Set(resolvedIds).size !== resolvedIds.length) {
      out.conflicts.push({ matchId, reason: '신원 해석 결과 같은 사람이 두 번 들어간다' })
      skip('identity_collision')
      continue
    }
    out.projected.push({
      id: matchId,
      startAt,
      redLeagueClanId: redClan.id,
      blueLeagueClanId: blueClan.id,
      winnerSide,
      /* `official` 은 출처 라벨일 뿐 래더와 무관하다 (D-145 · D-149).
         본클랜원 3명 이상이라는 역사적 정의를 그대로 계산해 둔다 */
      official:
        participants.filter((p) => p.side === 'red' && p.participantRole === 'member').length >= 3 ||
        participants.filter((p) => p.side === 'blue' && p.participantRole === 'member').length >= 3,
      participants,
      complete5v5:
        participants.filter((p) => p.side === 'red').length === SQUAD_SIZE &&
        participants.filter((p) => p.side === 'blue').length === SQUAD_SIZE,
    })
  }

  return out
}

/** 투영 결과를 replay 가 읽는 모양으로 바꾼다 (D-150). DB 에 쓰지 않는다 */
export function toRateMatchRows(projection: SnapshotProjection): {
  id: string
  startAt: Date
  official: boolean
  /** 3rd.supply 스냅샷에서 온 경기다. 저장된 경기와 **같은 진영 판정**을 받아야 한다 (D-180) */
  origin: string
  redLeagueClanId: string
  blueLeagueClanId: string
  winnerSide: string
  stats: {
    playerId: string
    side: string
    kill: number | null
    death: number | null
    assist: number | null
    rosterLeagueClanId: string | null
    participantRole: string
  }[]
}[] {
  return projection.projected.map((match) => ({
    id: match.id,
    startAt: match.startAt,
    official: match.official,
    /* 미러 origin 을 그대로 붙인다 — 안 붙이면 투영 경기만 옛 판정(다수결 우선)을 받아
       "투영을 넣었을 때 래더가 어떻게 되나" 의 답이 실제와 갈라진다 (D-180) */
    origin: '3rd.supply',
    redLeagueClanId: match.redLeagueClanId,
    blueLeagueClanId: match.blueLeagueClanId,
    winnerSide: match.winnerSide,
    stats: match.participants.map((p) => ({
      playerId: p.playerId,
      side: p.side,
      kill: p.kill,
      death: p.death,
      assist: p.assist,
      /* 래더는 **원소속 클랜**을 본다 (D-075). 경기 당시 클랜 근거를 그대로 쓴다 */
      rosterLeagueClanId: p.matchTimeLeagueClanId,
      participantRole: p.participantRole,
    })),
  }))
}
