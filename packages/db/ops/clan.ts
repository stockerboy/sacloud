/**
 * 클랜·로스터 운영 — **CLI와 관리자 화면이 같은 코드를 쓴다** (Phase 10).
 *
 * 원칙
 *   - 이름이 비슷하다고 **자동 병합하지 않는다** (D-088). 병합은 slug 두 개를 명시할 때만
 *   - 삭제 대신 **비활성**을 쓴다 (정책 24)
 *   - 로스터는 "출전했다"는 증거가 아니라 **확인해야 할 후보 목록**이다 (D-068)
 */
import { prisma } from '../src/index'
import { INDEPENDENT_TIER_COUNT } from './independentLeague'

export interface ClanUpdateInput {
  name?: string
  /** "official" | "independent" */
  category?: string
  /** 무소속 티어 1~`INDEPENDENT_TIER_COUNT`. 자동 승강하지 않는다 — 운영자가 정한다 */
  tier?: number | null
  active?: boolean
}

export async function updateClan(slug: string, input: ClanUpdateInput) {
  const before = await prisma.clan.findUnique({
    where: { slug },
    select: { id: true, name: true, category: true, tier: true, active: true },
  })
  if (!before) return null

  /* 상한을 숫자로 박지 않는다 — 티어 수가 바뀌면 여기만 조용히 낡는다.
     `League.divisionCount` 와 같은 상수를 쓴다 (D-181 로 5 → 6) */
  if (
    input.tier !== undefined &&
    input.tier !== null &&
    (!Number.isInteger(input.tier) || input.tier < 1 || input.tier > INDEPENDENT_TIER_COUNT)
  ) {
    throw new Error(`무소속 티어는 1~${INDEPENDENT_TIER_COUNT}입니다`)
  }
  if (input.category !== undefined && !['official', 'independent'].includes(input.category)) {
    throw new Error('구분은 official 또는 independent 입니다')
  }

  const after = await prisma.clan.update({
    where: { slug },
    data: {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.category === undefined ? {} : { category: input.category }),
      ...(input.tier === undefined ? {} : { tier: input.tier }),
      ...(input.active === undefined ? {} : { active: input.active }),
    },
    select: { id: true, name: true, category: true, tier: true, active: true },
  })
  return { before, after }
}

/** 리그 참여 + 부리그 설정. division은 rating 공식에 들어가지 않는다 (D-059) */
export async function setLeagueDivision(input: {
  leagueSlug: string
  clanSlug: string
  division: number
}) {
  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true, divisionCount: true },
  })
  const clan = await prisma.clan.findUnique({
    where: { slug: input.clanSlug },
    select: { id: true },
  })
  if (!league || !clan) return null
  if (input.division < 1 || input.division > Math.max(1, league.divisionCount)) {
    throw new Error(`이 리그의 부리그 범위가 아닙니다 (1~${league.divisionCount})`)
  }

  const before = await prisma.leagueClan.findUnique({
    where: { leagueId_clanId: { leagueId: league.id, clanId: clan.id } },
    select: { division: true },
  })
  const after = await prisma.leagueClan.upsert({
    where: { leagueId_clanId: { leagueId: league.id, clanId: clan.id } },
    create: { leagueId: league.id, clanId: clan.id, division: input.division },
    update: { division: input.division },
    select: { id: true, division: true },
  })
  return { before, after }
}

/** 별칭 등록 — 넥슨 `guild_name`을 우리 클랜에 연결한다. 자동으로 만들지 않는다 */
export async function addAlias(input: { clanSlug: string; alias: string; source?: string }) {
  const clan = await prisma.clan.findUnique({
    where: { slug: input.clanSlug },
    select: { id: true },
  })
  if (!clan) return null
  return prisma.clanAlias.create({
    data: { clanId: clan.id, alias: input.alias, source: input.source ?? 'manual' },
    select: { id: true, alias: true, source: true },
  })
}

export async function removeAlias(aliasId: string) {
  return prisma.clanAlias.delete({ where: { id: aliasId }, select: { id: true, alias: true } })
}

/* -------------------------------------------------------------- 로스터 --- */

export async function addRosterMember(input: {
  leagueSlug: string
  clanSlug: string
  playerId: string
  joinedAt: Date
  verified?: boolean
  note?: string
}) {
  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true },
  })
  const clan = await prisma.clan.findUnique({
    where: { slug: input.clanSlug },
    select: { id: true },
  })
  if (!league || !clan) return null

  const leagueClan = await prisma.leagueClan.findUnique({
    where: { leagueId_clanId: { leagueId: league.id, clanId: clan.id } },
    select: { id: true },
  })
  if (!leagueClan) throw new Error('이 클랜은 해당 리그에 참여하고 있지 않습니다')

  const player = await prisma.player.findUnique({
    where: { id: input.playerId },
    select: { id: true },
  })
  if (!player) throw new Error('플레이어를 찾을 수 없습니다')

  return prisma.leagueRosterMembership.upsert({
    where: {
      leagueClanId_playerId_joinedAt: {
        leagueClanId: leagueClan.id,
        playerId: input.playerId,
        joinedAt: input.joinedAt,
      },
    },
    create: {
      leagueId: league.id,
      leagueClanId: leagueClan.id,
      playerId: input.playerId,
      joinedAt: input.joinedAt,
      source: 'manual',
      verified: input.verified ?? false,
      note: input.note,
    },
    update: { verified: input.verified ?? false, note: input.note },
    select: { id: true, playerId: true, joinedAt: true, verified: true },
  })
}

/**
 * 로스터에서 뺀다 — **행을 지우지 않고 `leftAt`을 찍는다**.
 *
 * 과거 경기의 소속 판정은 그 시점 기록으로 해야 하므로, 지우면 과거가 바뀐다.
 */
export async function endRosterMember(input: { membershipId: string; leftAt: Date }) {
  const before = await prisma.leagueRosterMembership.findUnique({
    where: { id: input.membershipId },
    select: { id: true, playerId: true, joinedAt: true, leftAt: true, verified: true },
  })
  if (!before) return null
  const after = await prisma.leagueRosterMembership.update({
    where: { id: input.membershipId },
    data: { leftAt: input.leftAt },
    select: { id: true, playerId: true, joinedAt: true, leftAt: true, verified: true },
  })
  return { before, after }
}

export async function setRosterVerified(input: { membershipId: string; verified: boolean }) {
  const before = await prisma.leagueRosterMembership.findUnique({
    where: { id: input.membershipId },
    select: { id: true, verified: true },
  })
  if (!before) return null
  const after = await prisma.leagueRosterMembership.update({
    where: { id: input.membershipId },
    data: { verified: input.verified },
    select: { id: true, verified: true },
  })
  return { before, after }
}
