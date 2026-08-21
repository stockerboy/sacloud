/**
 * 리그 로스터 등록 (Phase 8.2).
 *
 * 재구성의 전제는 **경기 시점에 누가 어느 클랜이었는지**를 우리가 아는 것이다(D-052).
 * 넥슨의 `guild_name` 문자열이 아니라 여기 등록된 기간 기록으로 판정한다.
 *
 * 세 가지 경로가 있다.
 *  1. `importRoster` — 운영자가 준 CSV를 그대로 등록한다. `--verified`를 붙이면 확인된 소속으로 본다
 *  2. `deriveRosterFromLeaguePlayers` — 이미 리그에 등록된 선수의 **현재** 클랜을 옮겨 적는다.
 *     현재 소속일 뿐 경기 시점의 근거가 아니므로 **항상 unverified**다
 *  3. `syncLeaguePriority` — 로스터에 있는 선수의 폴링 우선순위를 `league`로 올린다 (D-053)
 *
 * 어느 경로도 **닉네임으로 사람을 정하지 않는다**(D-036). playerId는 우리 내부 ID다.
 */
import { prisma } from '@sacloud/db'
import { parseCsv } from '@sacloud/db/csv'
import { readFileSync } from 'node:fs'
import { log, warn } from '../lib/log.js'

export interface RosterImportResult {
  rows: number
  created: number
  updated: number
  rejected: { line: number; reason: string }[]
}

function parseDate(value: string | undefined, fallback: Date | null = null): Date | null {
  if (value === undefined || value.trim() === '') return fallback
  const parsed = new Date(value.trim())
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function parseBool(value: string | undefined): boolean {
  const normalized = (value ?? '').trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'y' || normalized === 'yes'
}

/**
 * CSV → `LeagueRosterMembership`.
 *
 * 열: `clanSlug,playerId,joinedAt[,leftAt][,verified][,note][,seasonNumber]`
 *
 * 멱등하다. 같은 `(leagueClan, player, joinedAt)`은 몇 번을 넣어도 한 행이다.
 * 잘못된 줄은 **건너뛰고 줄 번호와 사유를 보고한다.** 절반만 들어가는 일은 없다.
 */
export async function importRoster(input: {
  leagueSlug: string
  file: string
  verified?: boolean
  dryRun?: boolean
}): Promise<RosterImportResult> {
  const result: RosterImportResult = { rows: 0, created: 0, updated: 0, rejected: [] }

  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true },
  })
  if (!league) {
    result.rejected.push({ line: 0, reason: `리그를 찾을 수 없다: ${input.leagueSlug}` })
    return result
  }

  const leagueClans = await prisma.leagueClan.findMany({
    where: { leagueId: league.id },
    select: { id: true, clan: { select: { slug: true } } },
  })
  const clanIdBySlug = new Map(leagueClans.map((row) => [row.clan.slug, row.id]))

  const rows = parseCsv(readFileSync(input.file, 'utf8'))

  for (const [index, row] of rows.entries()) {
    const line = index + 2 // 헤더 1줄 + 1-base
    result.rows += 1

    const clanSlug = (row.clanSlug ?? '').trim()
    const playerId = (row.playerId ?? '').trim()
    const leagueClanId = clanIdBySlug.get(clanSlug)
    if (!leagueClanId) {
      result.rejected.push({ line, reason: `리그 소속 클랜이 아니다: ${clanSlug || '(빈 값)'}` })
      continue
    }
    if (!playerId) {
      result.rejected.push({ line, reason: 'playerId가 없다' })
      continue
    }

    const player = await prisma.player.findUnique({ where: { id: playerId }, select: { id: true } })
    if (!player) {
      result.rejected.push({ line, reason: `플레이어를 찾을 수 없다: ${playerId}` })
      continue
    }

    const joinedAt = parseDate(row.joinedAt)
    if (joinedAt === null) {
      result.rejected.push({ line, reason: 'joinedAt이 없거나 날짜가 아니다' })
      continue
    }
    const leftAtRaw = (row.leftAt ?? '').trim()
    const leftAt = leftAtRaw === '' ? null : parseDate(leftAtRaw)
    if (leftAtRaw !== '' && leftAt === null) {
      result.rejected.push({ line, reason: 'leftAt이 날짜가 아니다' })
      continue
    }
    if (leftAt !== null && leftAt.getTime() <= joinedAt.getTime()) {
      result.rejected.push({ line, reason: 'leftAt이 joinedAt보다 앞이거나 같다' })
      continue
    }

    let seasonId: string | null = null
    const seasonNumber = Number((row.seasonNumber ?? '').trim())
    if (Number.isInteger(seasonNumber) && seasonNumber > 0) {
      const season = await prisma.season.findUnique({
        where: { leagueId_number: { leagueId: league.id, number: seasonNumber } },
        select: { id: true },
      })
      seasonId = season?.id ?? null
    }

    if (input.dryRun) continue

    const existing = await prisma.leagueRosterMembership.findUnique({
      where: { leagueClanId_playerId_joinedAt: { leagueClanId, playerId, joinedAt } },
      select: { id: true },
    })
    await prisma.leagueRosterMembership.upsert({
      where: { leagueClanId_playerId_joinedAt: { leagueClanId, playerId, joinedAt } },
      create: {
        leagueId: league.id,
        leagueClanId,
        playerId,
        seasonId,
        joinedAt,
        leftAt,
        source: 'import',
        verified: input.verified === true || parseBool(row.verified),
        note: (row.note ?? '').trim() || null,
      },
      update: {
        leftAt,
        seasonId,
        verified: input.verified === true || parseBool(row.verified),
        note: (row.note ?? '').trim() || null,
      },
    })
    if (existing) result.updated += 1
    else result.created += 1
  }

  return result
}

export interface RosterDeriveResult {
  candidates: number
  created: number
  skipped: number
}

/**
 * 이미 리그에 등록된 선수의 **현재** 클랜을 로스터로 옮겨 적는다.
 *
 * `LeaguePlayer.clanId`는 스키마 주석대로 "경기 당시가 아니라 현재 소속"이다.
 * 그래서 여기서 만든 행은 **항상 `verified=false`**이고, 그대로는 재구성에 쓰이지 않는다.
 * 운영자가 확인해야 완전성 판정에 들어간다.
 */
export async function deriveRosterFromLeaguePlayers(input: {
  leagueSlug: string
  dryRun?: boolean
}): Promise<RosterDeriveResult> {
  const result: RosterDeriveResult = { candidates: 0, created: 0, skipped: 0 }

  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true },
  })
  if (!league) {
    warn(`리그를 찾을 수 없다: ${input.leagueSlug}`)
    return result
  }

  const leaguePlayers = await prisma.leaguePlayer.findMany({
    where: { leagueId: league.id, clanId: { not: null } },
    select: { playerId: true, clanId: true, joinedAt: true },
  })
  const leagueClans = await prisma.leagueClan.findMany({
    where: { leagueId: league.id },
    select: { id: true, clanId: true },
  })
  const leagueClanIdByClan = new Map(leagueClans.map((row) => [row.clanId, row.id]))

  for (const entry of leaguePlayers) {
    result.candidates += 1
    const leagueClanId = entry.clanId ? leagueClanIdByClan.get(entry.clanId) : undefined
    if (!leagueClanId) {
      result.skipped += 1
      continue
    }

    const already = await prisma.leagueRosterMembership.findFirst({
      where: { leagueClanId, playerId: entry.playerId, leftAt: null },
      select: { id: true },
    })
    if (already) {
      result.skipped += 1
      continue
    }
    if (input.dryRun) continue

    await prisma.leagueRosterMembership.create({
      data: {
        leagueId: league.id,
        leagueClanId,
        playerId: entry.playerId,
        joinedAt: entry.joinedAt,
        leftAt: null,
        source: 'import',
        // 현재 소속을 옮겨 적었을 뿐이다. 경기 시점 근거로 인정하지 않는다
        verified: false,
        note: 'LeaguePlayer.clanId에서 파생 — 운영자 확인 필요',
      },
    })
    result.created += 1
  }

  return result
}

export interface PrioritySyncResult {
  leagueMarked: number
  generalReset: number
}

/**
 * 로스터에 있는 선수 → 폴링 우선순위 `league` (D-053).
 *
 * 호출량을 늘리지 않는다. **같은 티어 안에서 순서만** 바꾼다.
 * 로스터에서 빠지면 다시 `general`로 되돌린다.
 */
export async function syncLeaguePriority(): Promise<PrioritySyncResult> {
  const memberships = await prisma.leagueRosterMembership.findMany({
    where: { leftAt: null },
    select: { playerId: true },
    distinct: ['playerId'],
  })
  const playerIds = memberships.map((row) => row.playerId)

  const marked = await prisma.nexonPollState.updateMany({
    where: { playerId: { in: playerIds }, priorityClass: { not: 'league' } },
    data: { priorityClass: 'league' },
  })
  const reset = await prisma.nexonPollState.updateMany({
    where: { priorityClass: 'league', OR: [{ playerId: null }, { playerId: { notIn: playerIds } }] },
    data: { priorityClass: 'general' },
  })

  return { leagueMarked: marked.count, generalReset: reset.count }
}

export interface RosterStatusRow extends Record<string, unknown> {
  league: string
  clan: string
  등록: number
  확인됨: number
  탈퇴: number
}

export async function rosterStatus(leagueSlug?: string | null): Promise<RosterStatusRow[]> {
  const rows = await prisma.leagueRosterMembership.findMany({
    where: leagueSlug ? { league: { slug: leagueSlug } } : undefined,
    select: {
      verified: true,
      leftAt: true,
      league: { select: { slug: true } },
      leagueClan: { select: { clan: { select: { name: true } } } },
    },
  })

  const grouped = new Map<string, RosterStatusRow>()
  for (const row of rows) {
    const key = `${row.league.slug}/${row.leagueClan.clan.name}`
    const entry = grouped.get(key) ?? {
      league: row.league.slug,
      clan: row.leagueClan.clan.name,
      등록: 0,
      확인됨: 0,
      탈퇴: 0,
    }
    entry.등록 += 1
    if (row.verified) entry.확인됨 += 1
    if (row.leftAt !== null) entry.탈퇴 += 1
    grouped.set(key, entry)
  }

  const result = [...grouped.values()].sort((left, right) =>
    left.league === right.league
      ? left.clan.localeCompare(right.clan)
      : left.league.localeCompare(right.league),
  )
  if (result.length === 0) log('등록된 로스터가 없다')
  return result
}
