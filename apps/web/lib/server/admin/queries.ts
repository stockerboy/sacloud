/**
 * 관리자 화면이 쓰는 조회·변경 (Phase 10).
 *
 * 원칙
 *   - **삭제 대신 비활성**을 쓴다. 되돌릴 수 있어야 한다 (정책 24)
 *   - 클랜을 이름 유사도로 묶지 않는다. 병합은 운영자가 두 slug를 지정할 때만 (D-088)
 *   - mock 데이터가 운영 데이터로 보이지 않게 `origin`을 그대로 노출한다 (정책 25)
 */
import { prisma } from '@sacloud/db'

/* ------------------------------------------------------------- 대시보드 --- */

export interface AdminSummary {
  /**
   * 활성 시즌 목록 — **리그마다** 있다.
   *
   * mock 시드 리그와 실운영 리그를 한 줄로 합치면 운영 상태를 착각한다 (정책 25).
   * 그래서 리그별로 나열하고 mock 여부를 표시한다.
   */
  activeSeasons: { league: string; number: number; startedAt: string; mock: boolean }[]
  clans: { total: number; official: number; independent: number; inactive: number }
  roster: { memberships: number; verified: number; players: number }
  matches: {
    staged: number
    reconstructed: number
    official: number
    reference: number
    pending: number
    skipped: number
  }
  rating: { ratedStats: number; lastFormulaVersion: string | null }
  poll: { targets: number; due: number; lastRunAt: string | null }
  betaOpenedAt: string | null
}

export async function adminSummary(): Promise<AdminSummary> {
  const activeSeasonRows = await prisma.season.findMany({
    where: { status: 'active' },
    orderBy: [{ league: { slug: 'asc' } }],
    select: { number: true, startedAt: true, league: { select: { id: true, slug: true } } },
  })
  const mockLeagueIds = new Set(
    (await prisma.match.groupBy({ by: ['leagueId'], where: { origin: 'mock' } })).map(
      (row) => row.leagueId,
    ),
  )

  const [total, official, independent, inactive] = await Promise.all([
    prisma.clan.count(),
    prisma.clan.count({ where: { category: 'official' } }),
    prisma.clan.count({ where: { category: 'independent' } }),
    prisma.clan.count({ where: { active: false } }),
  ])

  const [memberships, verified, rosterPlayers] = await Promise.all([
    prisma.leagueRosterMembership.count(),
    prisma.leagueRosterMembership.count({ where: { verified: true } }),
    prisma.leagueRosterMembership
      .findMany({ select: { playerId: true }, distinct: ['playerId'] })
      .then((rows) => rows.length),
  ])

  const [staged, reconstructed, officialMatches, referenceMatches, pending, skipped] =
    await Promise.all([
      prisma.nexonMatch.count(),
      prisma.nexonMatch.count({ where: { reconstructedAt: { not: null } } }),
      prisma.match.count({ where: { origin: 'nexon', official: true } }),
      prisma.match.count({ where: { origin: 'nexon', official: false } }),
      prisma.nexonMatch.count({ where: { projectionStatus: 'pending' } }),
      prisma.nexonMatch.count({ where: { projectionStatus: 'skipped' } }),
    ])

  const ratedStats = await prisma.matchPlayerStat.count({
    where: { match: { origin: 'nexon' }, ratingUpdate: { not: null } },
  })
  const lastRated = await prisma.matchPlayerStat.findFirst({
    where: { match: { origin: 'nexon' }, formulaVersion: { not: null } },
    orderBy: { id: 'desc' },
    select: { formulaVersion: true },
  })

  const [pollTargets, pollDue, lastRun] = await Promise.all([
    prisma.nexonPollState.count(),
    prisma.nexonPollState.count({ where: { nextPollAt: { lte: new Date() } } }),
    prisma.nexonPollRun.findFirst({ orderBy: { startedAt: 'desc' }, select: { startedAt: true } }),
  ])

  const beta = await prisma.appSetting.findUnique({ where: { key: BETA_OPENED_AT } })

  return {
    activeSeasons: activeSeasonRows.map((season) => ({
      league: season.league.slug,
      number: season.number,
      startedAt: season.startedAt.toISOString(),
      mock: mockLeagueIds.has(season.league.id),
    })),
    clans: { total, official, independent, inactive },
    roster: { memberships, verified, players: rosterPlayers },
    matches: {
      staged,
      reconstructed,
      official: officialMatches,
      reference: referenceMatches,
      pending,
      skipped,
    },
    rating: { ratedStats, lastFormulaVersion: lastRated?.formulaVersion ?? null },
    poll: {
      targets: pollTargets,
      due: pollDue,
      lastRunAt: lastRun?.startedAt.toISOString() ?? null,
    },
    betaOpenedAt: beta?.value ?? null,
  }
}

/* ---------------------------------------------------------------- 설정 --- */

/** 베타오픈 시각. **코드에 날짜를 박지 않는다** — 운영자가 나중에 정한다 (정책 12) */
export const BETA_OPENED_AT = 'betaOpenedAt'

export async function setSetting(key: string, value: string, userId: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value, updatedBy: userId },
    update: { value, updatedBy: userId },
  })
}

/* ---------------------------------------------------------------- 클랜 --- */

export interface AdminClanRow {
  slug: string
  name: string
  category: string
  tier: number | null
  active: boolean
  aliases: string[]
  leagues: { league: string; division: number; rating: number; roster: number }[]
}

export async function adminClans(input: {
  query?: string | null
  category?: string | null
}): Promise<AdminClanRow[]> {
  const clans = await prisma.clan.findMany({
    where: {
      ...(input.query ? { name: { contains: input.query, mode: 'insensitive' } } : {}),
      ...(input.category ? { category: input.category } : {}),
    },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    take: 200,
    select: {
      slug: true,
      name: true,
      category: true,
      tier: true,
      active: true,
      aliases: { select: { alias: true } },
      leagueClans: {
        select: {
          division: true,
          rating: true,
          league: { select: { slug: true } },
          _count: { select: { rosterMemberships: true } },
        },
      },
    },
  })

  return clans.map((clan) => ({
    slug: clan.slug,
    name: clan.name,
    category: clan.category,
    tier: clan.tier,
    active: clan.active,
    aliases: clan.aliases.map((entry) => entry.alias),
    leagues: clan.leagueClans.map((entry) => ({
      league: entry.league.slug,
      division: entry.division,
      rating: entry.rating,
      roster: entry._count.rosterMemberships,
    })),
  }))
}

export async function adminClanDetail(slug: string) {
  return prisma.clan.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      category: true,
      tier: true,
      active: true,
      aliases: { select: { id: true, alias: true, source: true } },
      leagueClans: {
        select: {
          id: true,
          division: true,
          rating: true,
          placement: true,
          league: { select: { slug: true, name: true, divisionCount: true } },
          rosterMemberships: {
            orderBy: { joinedAt: 'desc' },
            select: {
              id: true,
              joinedAt: true,
              leftAt: true,
              verified: true,
              source: true,
              player: {
                select: {
                  id: true,
                  name: true,
                  nexonIdentities: {
                    select: { ouid: true, status: true, userName: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
}

/* -------------------------------------------------------------- 경기 --- */

export interface AdminMatchRow {
  id: string
  sourceMatchId: string | null
  startAt: string
  league: string
  map: string
  official: boolean
  origin: string
  completeness: string | null
  confidence: string | null
  red: { clan: string; rating: number | null; update: number | null }
  blue: { clan: string; rating: number | null; update: number | null }
  stats: number
}

export async function adminMatches(input: {
  official?: boolean | null
  sourceMatchId?: string | null
  clanSlug?: string | null
  playerId?: string | null
  limit?: number
}): Promise<AdminMatchRow[]> {
  const matches = await prisma.match.findMany({
    where: {
      ...(input.official === null || input.official === undefined
        ? {}
        : { official: input.official }),
      ...(input.sourceMatchId ? { sourceMatchId: input.sourceMatchId } : {}),
      ...(input.clanSlug
        ? {
            OR: [
              { redClan: { clan: { slug: input.clanSlug } } },
              { blueClan: { clan: { slug: input.clanSlug } } },
            ],
          }
        : {}),
      ...(input.playerId ? { stats: { some: { playerId: input.playerId } } } : {}),
    },
    orderBy: { startAt: 'desc' },
    take: input.limit ?? 50,
    select: {
      id: true,
      sourceMatchId: true,
      startAt: true,
      origin: true,
      official: true,
      participantCompleteness: true,
      evidenceConfidence: true,
      redRatingBefore: true,
      blueRatingBefore: true,
      redRatingUpdate: true,
      blueRatingUpdate: true,
      league: { select: { slug: true } },
      map: { select: { name: true } },
      redClan: { select: { clan: { select: { name: true } } } },
      blueClan: { select: { clan: { select: { name: true } } } },
      _count: { select: { stats: true } },
    },
  })

  return matches.map((match) => ({
    id: match.id,
    sourceMatchId: match.sourceMatchId,
    startAt: match.startAt.toISOString(),
    league: match.league.slug,
    map: match.map.name,
    official: match.official,
    origin: match.origin,
    completeness: match.participantCompleteness,
    confidence: match.evidenceConfidence,
    red: {
      clan: match.redClan.clan.name,
      rating: match.redRatingBefore,
      update: match.redRatingUpdate,
    },
    blue: {
      clan: match.blueClan.clan.name,
      rating: match.blueRatingBefore,
      update: match.blueRatingUpdate,
    },
    stats: match._count.stats,
  }))
}

export async function adminMatchDetail(matchId: string) {
  return prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      sourceMatchId: true,
      startAt: true,
      origin: true,
      official: true,
      participantCompleteness: true,
      evidenceConfidence: true,
      redRatingBefore: true,
      blueRatingBefore: true,
      redRatingUpdate: true,
      blueRatingUpdate: true,
      league: { select: { slug: true } },
      map: { select: { name: true } },
      redClan: { select: { id: true, clan: { select: { name: true } } } },
      blueClan: { select: { id: true, clan: { select: { name: true } } } },
      stats: {
        orderBy: [{ side: 'asc' }, { playerId: 'asc' }],
        select: {
          playerId: true,
          side: true,
          kill: true,
          death: true,
          assist: true,
          participantRole: true,
          rosterLeagueClanId: true,
          ratingBefore: true,
          ratingUpdate: true,
          ratingAfter: true,
          formulaVersion: true,
          player: { select: { name: true } },
        },
      },
    },
  })
}
