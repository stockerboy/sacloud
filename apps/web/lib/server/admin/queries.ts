/**
 * 관리자 화면이 쓰는 조회·변경 (Phase 10).
 *
 * 원칙
 *   - **삭제 대신 비활성**을 쓴다. 되돌릴 수 있어야 한다 (정책 24)
 *   - 클랜을 이름 유사도로 묶지 않는다. 병합은 운영자가 두 slug를 지정할 때만 (D-088)
 *   - mock 데이터가 운영 데이터로 보이지 않게 `origin`을 그대로 노출한다 (정책 25)
 */
import { prisma } from '@sacloud/db'
/* 화면 표기는 계약이 정한다 — 베타는 `시즌0` (D-178).
   `@sacloud/db/ops` 의 `seasonLabel()` 은 CLI 로그용이라 `Beta Season` 그대로다 */
import { seasonDisplayLabel as seasonLabel } from '@sacloud/contract'

/* ------------------------------------------------------------- 대시보드 --- */

export interface AdminSummary {
  /**
   * 활성 시즌 목록 — **리그마다** 있다.
   *
   * mock 시드 리그와 실운영 리그를 한 줄로 합치면 운영 상태를 착각한다 (정책 25).
   * 그래서 리그별로 나열하고 mock 여부를 표시한다.
   */
  activeSeasons: {
    league: string
    number: number
    /** 화면에 그대로 쓰는 이름. 베타는 `Beta Season` (D-098) */
    label: string
    seasonType: string
    startedAt: string
    mock: boolean
  }[]
  clans: { total: number; official: number; independent: number; inactive: number }
  roster: { memberships: number; verified: number; players: number }
  matches: {
    staged: number
    reconstructed: number
    official: number
    reference: number
    pending: number
    skipped: number
    /** 공식 비율 % — 공식 / (공식 + 비공식). 판정할 경기가 없으면 null */
    officialRate: number | null
    /** 무엇 때문에 보류됐는가 (많은 순). 다음에 할 일을 알려 주는 값이다 */
    skipReasons: { reason: string; count: number }[]
  }
  /** 아직 사람이 확인하지 않은 수집 실패 (API 오류 · 차단 등) */
  unresolvedFailures: number
  rating: {
    ratedStats: number
    lastFormulaVersion: string | null
    /** 개인/클랜 래더 분포 요약 — 베타 기간에 값이 벌어지는지 보기 위한 것 */
    playerRating: RatingSpread
    clanRating: RatingSpread
  }
  /** 부리그·무소속별 경기 수 (실수집분만) */
  matchesByGroup: { division1: number; division2: number; independent: number }
  poll: { targets: number; due: number; lastRunAt: string | null }
  betaOpenedAt: string | null
}

/** 래더 분포 한 줄 요약. 히스토그램까지 만들지 않는다 */
export interface RatingSpread {
  count: number
  min: number | null
  max: number | null
  median: number | null
}

function spread(values: number[]): RatingSpread {
  if (values.length === 0) return { count: 0, min: null, max: null, median: null }
  const sorted = [...values].sort((a, b) => a - b)
  return {
    count: sorted.length,
    min: sorted[0] ?? null,
    max: sorted[sorted.length - 1] ?? null,
    median: sorted[Math.floor(sorted.length / 2)] ?? null,
  }
}

export async function adminSummary(): Promise<AdminSummary> {
  const activeSeasonRows = await prisma.season.findMany({
    where: { status: 'active' },
    orderBy: [{ league: { slug: 'asc' } }],
    select: {
      number: true,
      startedAt: true,
      seasonType: true,
      league: { select: { id: true, slug: true } },
    },
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

  /* 파이프라인이 무엇 때문에 막혀 있는지 (정책 21).
     "보류 N건"만 보면 운영자가 다음에 무엇을 해야 할지 알 수 없다.
     사유별로 보여 줘야 "관측이 모자란다 → 폴링/로스터"로 이어진다. */
  const [skipReasonRows, unresolvedFailures] = await Promise.all([
    prisma.nexonMatch.groupBy({
      by: ['projectionReason'],
      where: { projectionStatus: 'skipped', projectionReason: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { projectionReason: 'desc' } },
      take: 6,
    }),
    prisma.importFailure.count({ where: { source: 'nexon', resolvedAt: null } }),
  ])

  /**
   * **이 화면이 25초 걸리던 자리다.** 이 두 질의가 그 중 32.9초였다 (D-227).
   *
   * ── 무엇이 문제였나
   *   `origin='nexon'` 인 경기는 386,146건 중 **136건**뿐이다(나머지는 `3rd.supply`
   *   361,348 · `nexon_barracks` 24,662). 그런데 `orderBy: { id: 'desc' }` 가
   *   플래너를 **PK 역방향 스캔**으로 끌고 가서, 136건을 찾겠다고 `MatchPlayerStat`
   *   **361만 행**을 거꾸로 훑었다. 실측 32,925 ms · 버퍼 173만 블록.
   *
   *   `matchId IN (136건)` 으로 좁혀도 5,233 ms 로 똑같이 뒤로 훑는다.
   *   **`orderBy` 를 DB 에서 떼야** 계획이 바뀐다.
   *
   * ── 그래서 두 걸음으로 나눈다
   *   ① 대상 경기 id 를 먼저 받는다 (136건)
   *   ② 그 id 로 참가 기록을 받는다 (980행) — 정렬은 **JS 에서** 한다
   *   실측 32,925 → 482 ms (68배).
   *
   *   ⚠ 모집단(`origin='nexon'`)을 넓히지 마라. `nexon_barracks`(24,662건)를
   *     끌어들이면 **값이 달라진다.** 이 칸은 「넥슨 수집분의 래더 반영 현황」이다.
   *
   *   ⚠ `id` 최댓값을 JS 로 고른다. cuid 는 ASCII 라 로컬 DB collation(`C`)에서는
   *     DB 정렬과 일치한다. 운영 collation 은 **확인하지 않았다** `[미확인]` —
   *     달라지면 `formulaVersion` 이 뒤바뀔 수 있는데, 지금 값이 한 종류
   *     (`sacloud-d145`)뿐이라 화면에 보이는 값은 같다.
   */
  const nexonMatchIds = (
    await prisma.match.findMany({ where: { origin: 'nexon' }, select: { id: true } })
  ).map((row) => row.id)

  const [ratedStats, ratedRows] = await Promise.all([
    prisma.matchPlayerStat.count({
      where: { matchId: { in: nexonMatchIds }, ratingUpdate: { not: null } },
    }),
    prisma.matchPlayerStat.findMany({
      where: { matchId: { in: nexonMatchIds }, formulaVersion: { not: null } },
      select: { id: true, formulaVersion: true },
    }),
  ])

  let newestRated: { id: string; formulaVersion: string | null } | null = null
  for (const row of ratedRows) {
    if (!newestRated || row.id > newestRated.id) newestRated = row
  }
  const lastRated = newestRated ? { formulaVersion: newestRated.formulaVersion } : null

  const [pollTargets, pollDue, lastRun] = await Promise.all([
    prisma.nexonPollState.count(),
    prisma.nexonPollState.count({ where: { nextPollAt: { lte: new Date() } } }),
    prisma.nexonPollRun.findFirst({ orderBy: { startedAt: 'desc' }, select: { startedAt: true } }),
  ])

  /* 래더 분포 — 실수집 리그(=mock이 아닌 리그)만 본다 */
  const [playerRatings, clanRatings] = await Promise.all([
    prisma.leaguePlayer.findMany({
      where: { leagueId: { notIn: [...mockLeagueIds] }, placement: false },
      select: { rating: true },
    }),
    prisma.leagueClan.findMany({
      where: { leagueId: { notIn: [...mockLeagueIds] }, placement: false },
      select: { rating: true },
    }),
  ])

  const [division1, division2, independentMatches] = await Promise.all([
    prisma.match.count({ where: { origin: 'nexon', redClan: { division: 1 } } }),
    prisma.match.count({ where: { origin: 'nexon', redClan: { division: 2 } } }),
    prisma.match.count({
      where: {
        origin: 'nexon',
        OR: [
          { redClan: { clan: { category: 'independent' } } },
          { blueClan: { clan: { category: 'independent' } } },
        ],
      },
    }),
  ])

  const beta = await prisma.appSetting.findUnique({ where: { key: BETA_OPENED_AT } })

  return {
    activeSeasons: activeSeasonRows.map((season) => ({
      league: season.league.slug,
      number: season.number,
      label: seasonLabel(season),
      seasonType: season.seasonType,
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
      officialRate:
        officialMatches + referenceMatches === 0
          ? null
          : Math.round((officialMatches / (officialMatches + referenceMatches)) * 1000) / 10,
      skipReasons: skipReasonRows.map((row) => ({
        reason: row.projectionReason ?? '(사유 없음)',
        count: row._count._all,
      })),
    },
    unresolvedFailures,
    rating: {
      ratedStats,
      lastFormulaVersion: lastRated?.formulaVersion ?? null,
      playerRating: spread(playerRatings.map((row) => row.rating)),
      clanRating: spread(clanRatings.map((row) => row.rating)),
    },
    matchesByGroup: { division1, division2, independent: independentMatches },
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
    },
  })

  /**
   * 참가자 수를 **따로 센다.** 예전에는 위 `select` 에 `_count: { stats: true }` 가 있었다.
   *
   * ── 왜 뗐나 (D-227)
   *   Prisma 의 to-many `_count` 는 이렇게 컴파일된다.
   *   ```sql
   *   LEFT JOIN (SELECT "matchId", COUNT(*) FROM "MatchPlayerStat" GROUP BY "matchId")
   *   ```
   *   **50건 보려고 361만 행짜리 표를 통째로 GROUP BY 한다.** 실측 8,673 ms.
   *   뽑힌 50개 id 로만 세면 **28 ms** 다 (웜 5 ms). 왕복 한 번이 늘고 300배 빨라진다.
   *
   *   ⚠ `groupBy` 결과에는 **참가자가 0인 경기가 아예 안 나온다.** 그래서 `?? 0` 으로
   *     메워야 예전과 같은 값이 된다. 이 칸은 「참가자 수」이고 0 도 뜻이 있는 값이다.
   */
  const statCounts = new Map<string, number>(
    matches.length === 0
      ? []
      : (
          await prisma.matchPlayerStat.groupBy({
            by: ['matchId'],
            where: { matchId: { in: matches.map((match) => match.id) } },
            _count: { _all: true },
          })
        ).map((row) => [row.matchId, row._count._all]),
  )

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
    stats: statCounts.get(match.id) ?? 0,
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
