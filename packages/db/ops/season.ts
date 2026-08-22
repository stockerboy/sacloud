/**
 * 시즌 운영 — **CLI와 관리자 화면이 같은 코드를 쓴다** (Phase 10).
 *
 * 여기 있는 함수는 로그를 찍지 않고 결과만 돌려준다. 화면에 어떻게 보여 줄지는 호출부가 정한다.
 *
 * 절대 규칙
 *   - **자동으로 도는 것이 없다.** 운영자가 부를 때만 실행된다 (D-077)
 *   - 종료 → 시작 순서를 강제한다. 열려 있는 시즌이 있으면 새로 시작하지 않는다
 *   - 시작·종료는 **트랜잭션**으로 처리한다. 중간에 실패해서 "시즌 7은 닫혔는데 8이 없는" 상태를
 *     만들지 않는다 (정책 9)
 *   - 지난 시즌 기록(경기·참가기록·시즌 통계·스냅샷)은 건드리지 않는다
 */
import { prisma } from '../src/index'

/** 새 시즌의 공통 출발점. `@sacloud/rating`의 seasonBaseline과 같은 값이다 (D-064) */
export const SEASON_BASELINE = 1500

/**
 * 베타 시즌의 내부 번호.
 *
 * `@@unique([leagueId, number])` 때문에 베타에도 번호가 필요하다.
 * `0`을 쓰면 Season 7 다음 정식 번호가 8로 그대로 남는다.
 * **사용자에게 "Season 0"이라고 보여 주지 않는다.** 화면 표기는 `Beta Season`이다 (D-098).
 */
export const BETA_SEASON_NUMBER = 0

/** 화면에 쓸 시즌 이름. 번호를 그대로 노출해도 되는지 여기서만 판단한다 */
export function seasonLabel(season: { number: number; seasonType: string }): string {
  return season.seasonType === 'beta' ? 'Beta Season' : `Season ${season.number}`
}

export interface SeasonOverview {
  leagueSlug: string
  leagueName: string
  divisionCount: number
  activeSeason: {
    id: string
    number: number
    startedAt: string
    endedAt: string | null
    status: string
  } | null
  seasons: {
    number: number
    startedAt: string
    endedAt: string | null
    status: string
    hasClanSnapshot: boolean
    hasPlayerSnapshot: boolean
  }[]
  divisions: { division: number; clans: number }[]
  matchesInSeason: number
  officialMatches: number
  referenceMatches: number
}

export async function seasonOverview(leagueSlug: string): Promise<SeasonOverview | null> {
  const league = await prisma.league.findUnique({
    where: { slug: leagueSlug },
    select: { id: true, slug: true, name: true, divisionCount: true },
  })
  if (!league) return null

  const seasons = await prisma.season.findMany({
    where: { leagueId: league.id },
    orderBy: { number: 'desc' },
    select: { id: true, number: true, startedAt: true, endedAt: true, status: true },
  })
  const snapshots = await prisma.rankSnapshot.findMany({
    where: { leagueId: league.id },
    select: { kind: true, seasonNumber: true },
  })

  const active = seasons.find((season) => season.status === 'active') ?? null
  const window = active
    ? { gte: active.startedAt, ...(active.endedAt ? { lt: active.endedAt } : {}) }
    : undefined

  const [total, official] = await Promise.all([
    prisma.match.count({
      where: { leagueId: league.id, origin: 'nexon', ...(window ? { startAt: window } : {}) },
    }),
    prisma.match.count({
      where: {
        leagueId: league.id,
        origin: 'nexon',
        official: true,
        ...(window ? { startAt: window } : {}),
      },
    }),
  ])

  const divisionRows = await prisma.leagueClan.groupBy({
    by: ['division'],
    where: { leagueId: league.id },
    _count: { _all: true },
  })

  return {
    leagueSlug: league.slug,
    leagueName: league.name,
    divisionCount: league.divisionCount,
    activeSeason: active
      ? {
          id: active.id,
          number: active.number,
          startedAt: active.startedAt.toISOString(),
          endedAt: active.endedAt?.toISOString() ?? null,
          status: active.status,
        }
      : null,
    seasons: seasons.map((season) => ({
      number: season.number,
      startedAt: season.startedAt.toISOString(),
      endedAt: season.endedAt?.toISOString() ?? null,
      status: season.status,
      hasClanSnapshot: snapshots.some(
        (row) => row.kind === 'clan' && row.seasonNumber === season.number,
      ),
      hasPlayerSnapshot: snapshots.some(
        (row) => row.kind === 'player' && row.seasonNumber === season.number,
      ),
    })),
    divisions: divisionRows
      .map((row) => ({ division: row.division, clans: row._count._all }))
      .sort((left, right) => left.division - right.division),
    matchesInSeason: total,
    officialMatches: official,
    referenceMatches: total - official,
  }
}

/* ---------------------------------------------------------------- 종료 --- */

export interface SeasonClosePreview {
  ok: boolean
  reason: string
  season: number | null
  clanRows: number
  playerRows: number
  /** 부리그별 최종 1위 (확인용) */
  divisionLeaders: { division: number; clan: string; rating: number }[]
}

export async function previewSeasonClose(leagueSlug: string): Promise<SeasonClosePreview> {
  const empty: SeasonClosePreview = {
    ok: false,
    reason: '',
    season: null,
    clanRows: 0,
    playerRows: 0,
    divisionLeaders: [],
  }
  const league = await prisma.league.findUnique({
    where: { slug: leagueSlug },
    select: { id: true, divisionCount: true },
  })
  if (!league) return { ...empty, reason: '리그를 찾을 수 없습니다' }

  const active = await prisma.season.findFirst({
    where: { leagueId: league.id, status: 'active' },
    orderBy: { number: 'desc' },
    select: { number: true },
  })
  if (!active) return { ...empty, reason: '활성 시즌이 없습니다' }

  const clans = await prisma.leagueClan.findMany({
    where: { leagueId: league.id, placement: false },
    orderBy: [{ division: 'asc' }, { rating: 'desc' }],
    select: { division: true, rating: true, clan: { select: { name: true } } },
  })
  const players = await prisma.leaguePlayer.count({
    where: { leagueId: league.id, placement: false },
  })

  const leaders: { division: number; clan: string; rating: number }[] = []
  for (const clan of clans) {
    if (leaders.some((leader) => leader.division === clan.division)) continue
    leaders.push({ division: clan.division, clan: clan.clan.name, rating: clan.rating })
  }

  return {
    ok: true,
    reason: '',
    season: active.number,
    clanRows: clans.length,
    playerRows: players,
    divisionLeaders: leaders,
  }
}

export interface SeasonCloseResult {
  ok: boolean
  reason: string
  season: number | null
  clanRows: number
  playerRows: number
  endedAt: string | null
}

/**
 * 시즌 종료 — 최종 랭킹을 스냅샷으로 굳히고 닫는다 (D-085).
 *
 * 스냅샷을 먼저 남기는 이유: 새 시즌이 시작되면 현재 점수가 초기화되므로,
 * 그 전에 저장해 두지 않으면 그 시즌의 최종 순위를 되살릴 수 없다.
 */
export async function closeSeason(input: {
  leagueSlug: string
  endedAt?: Date
}): Promise<SeasonCloseResult> {
  const empty: SeasonCloseResult = {
    ok: false,
    reason: '',
    season: null,
    clanRows: 0,
    playerRows: 0,
    endedAt: null,
  }
  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true, divisionCount: true },
  })
  if (!league) return { ...empty, reason: '리그를 찾을 수 없습니다' }

  const active = await prisma.season.findFirst({
    where: { leagueId: league.id, status: 'active' },
    orderBy: { number: 'desc' },
    select: { id: true, number: true },
  })
  if (!active) return { ...empty, reason: '활성 시즌이 없습니다' }

  const endedAt = input.endedAt ?? new Date()

  const clans = await prisma.leagueClan.findMany({
    where: { leagueId: league.id },
    orderBy: [{ division: 'asc' }, { rating: 'desc' }],
    select: {
      id: true,
      division: true,
      rating: true,
      win: true,
      lose: true,
      placement: true,
      clan: { select: { slug: true, name: true } },
    },
  })
  const players = await prisma.leaguePlayer.findMany({
    where: { leagueId: league.id },
    orderBy: { rating: 'desc' },
    select: {
      id: true,
      rating: true,
      win: true,
      lose: true,
      kill: true,
      death: true,
      assist: true,
      headshot: true,
      mvpCount: true,
      placement: true,
      player: { select: { id: true, name: true } },
    },
  })

  const playerRows = players
    .filter((player) => !player.placement)
    .map((player, index) => ({
      rank: index + 1,
      league_player_id: player.id,
      player: { id: player.player.id, name: player.player.name },
      win: player.win,
      lose: player.lose,
      rating: player.rating,
    }))

  // 스냅샷 저장과 시즌 닫기를 **한 트랜잭션**으로 묶는다 (정책 9)
  await prisma.$transaction(async (tx) => {
    for (let division = 1; division <= Math.max(1, league.divisionCount); division += 1) {
      const rows = clans
        .filter((clan) => clan.division === division && !clan.placement)
        .map((clan, index) => ({
          rank: index + 1,
          league_clan_id: clan.id,
          clan: { slug: clan.clan.slug, name: clan.clan.name },
          win: clan.win,
          lose: clan.lose,
          rating: clan.rating,
        }))
      await tx.rankSnapshot.upsert({
        where: {
          leagueId_kind_division_seasonNumber: {
            leagueId: league.id,
            kind: 'clan',
            division,
            seasonNumber: active.number,
          },
        },
        create: {
          leagueId: league.id,
          kind: 'clan',
          division,
          seasonNumber: active.number,
          payload: rows,
        },
        update: { payload: rows, generatedAt: new Date() },
      })
    }

    // 개인 랭킹은 부리그 구분이 없다(division = null). Prisma는 복합 유니크의 null을
    // where에 넣지 못하므로 찾아서 갱신한다
    const existing = await tx.rankSnapshot.findFirst({
      where: {
        leagueId: league.id,
        kind: 'player',
        division: null,
        seasonNumber: active.number,
      },
      select: { id: true },
    })
    if (existing) {
      await tx.rankSnapshot.update({
        where: { id: existing.id },
        data: { payload: playerRows, generatedAt: new Date() },
      })
    } else {
      await tx.rankSnapshot.create({
        data: {
          leagueId: league.id,
          kind: 'player',
          division: null,
          seasonNumber: active.number,
          payload: playerRows,
        },
      })
    }

    /* 선수·클랜별 **시즌 카드**를 남긴다 (D-101).
       랭킹 스냅샷은 "그 시즌 상위 목록"이고, 카드는 "이 선수의 그 시즌 성적"이다.
       카드가 없으면 `startSeason`이 누적을 0으로 되돌리는 순간 그 시즌 기록이 사라진다.
       배치고사 미완료라 순위가 없는 선수도 카드는 남긴다 — 전적 자체는 있었기 때문이다. */
    const rankOf = new Map(playerRows.map((row) => [row.league_player_id, row.rank]))
    for (const player of players) {
      await tx.leaguePlayerSeason.upsert({
        where: { leaguePlayerId_seasonId: { leaguePlayerId: player.id, seasonId: active.id } },
        create: {
          leaguePlayerId: player.id,
          seasonId: active.id,
          season: active.number,
          rank: rankOf.get(player.id) ?? null,
          rankCount: playerRows.length,
          rating: player.rating,
          win: player.win,
          lose: player.lose,
          kill: player.kill,
          death: player.death,
          assist: player.assist,
          headshot: player.headshot,
          mvpCount: player.mvpCount,
        },
        // 이미 확정된 카드(과거 이관분)를 덮어쓰지 않는다
        update: {},
      })
    }

    const clanRankOf = new Map<string, number>()
    for (let division = 1; division <= Math.max(1, league.divisionCount); division += 1) {
      clans
        .filter((clan) => clan.division === division && !clan.placement)
        .forEach((clan, index) => clanRankOf.set(clan.id, index + 1))
    }
    for (const clan of clans) {
      await tx.leagueClanSeason.upsert({
        where: { leagueClanId_seasonId: { leagueClanId: clan.id, seasonId: active.id } },
        create: {
          leagueClanId: clan.id,
          seasonId: active.id,
          season: active.number,
          rank: clanRankOf.get(clan.id) ?? null,
          rankCount: clanRankOf.size,
          rating: clan.rating,
          division: clan.division,
          win: clan.win,
          lose: clan.lose,
        },
        update: {},
      })
    }

    await tx.season.update({
      where: { id: active.id },
      data: { status: 'closed', endedAt },
    })
  })

  return {
    ok: true,
    reason: '',
    season: active.number,
    clanRows: clans.filter((clan) => !clan.placement).length,
    playerRows: playerRows.length,
    endedAt: endedAt.toISOString(),
  }
}

/* ---------------------------------------------------------------- 시작 --- */

export interface SeasonStartPreview {
  ok: boolean
  reason: string
  nextNumber: number
  promoted: { clan: string; rating: number } | null
  relegated: { clan: string; rating: number } | null
  players: number
  clans: number
  baseline: number
}

export async function previewSeasonStart(leagueSlug: string): Promise<SeasonStartPreview> {
  const empty: SeasonStartPreview = {
    ok: false,
    reason: '',
    nextNumber: 0,
    promoted: null,
    relegated: null,
    players: 0,
    clans: 0,
    baseline: SEASON_BASELINE,
  }
  const league = await prisma.league.findUnique({
    where: { slug: leagueSlug },
    select: { id: true, divisionCount: true },
  })
  if (!league) return { ...empty, reason: '리그를 찾을 수 없습니다' }

  const stillActive = await prisma.season.findFirst({
    where: { leagueId: league.id, status: 'active' },
    select: { number: true },
  })
  if (stillActive) {
    return { ...empty, reason: `시즌 ${stillActive.number}이 아직 열려 있습니다. 먼저 종료하세요` }
  }

  const last = await prisma.season.findFirst({
    where: { leagueId: league.id },
    orderBy: { number: 'desc' },
    select: { number: true },
  })

  let promoted: SeasonStartPreview['promoted'] = null
  let relegated: SeasonStartPreview['relegated'] = null
  if (league.divisionCount >= 2) {
    const bottom = await prisma.leagueClan.findFirst({
      where: { leagueId: league.id, division: 1, placement: false },
      orderBy: { rating: 'asc' },
      select: { rating: true, clan: { select: { name: true } } },
    })
    const top = await prisma.leagueClan.findFirst({
      where: { leagueId: league.id, division: 2, placement: false },
      orderBy: { rating: 'desc' },
      select: { rating: true, clan: { select: { name: true } } },
    })
    if (bottom && top) {
      relegated = { clan: bottom.clan.name, rating: bottom.rating }
      promoted = { clan: top.clan.name, rating: top.rating }
    }
  }

  const [players, clans] = await Promise.all([
    prisma.leaguePlayer.count({ where: { leagueId: league.id } }),
    prisma.leagueClan.count({ where: { leagueId: league.id } }),
  ])

  return {
    ok: true,
    reason: '',
    nextNumber: (last?.number ?? 0) + 1,
    promoted,
    relegated,
    players,
    clans,
    baseline: SEASON_BASELINE,
  }
}

export interface SeasonStartResult extends SeasonStartPreview {
  startedAt: string | null
}

/**
 * 새 시즌 시작 — 승강 반영 + **전원 같은 출발점** (D-064 · D-086).
 *
 * 승강 기본안: 1부 최하위 ↔ 2부 최상위 1팀 교환. 플레이오프는 넣지 않는다.
 * 전부 한 트랜잭션이다 — 일부 클랜만 초기화되는 상태가 생기면 안 된다.
 */
export async function startSeason(input: {
  leagueSlug: string
  startedAt?: Date
  number?: number
  skipPromotion?: boolean
  /**
   * 어떤 시즌인가. 기본은 정식(`official`).
   *
   * `beta`는 **번호를 0으로** 만든다. 사용자에게는 `Beta Season`으로 보이고
   * 다음 정식 시즌 번호를 소모하지 않는다 (D-098).
   */
  seasonType?: 'beta' | 'official'
}): Promise<SeasonStartResult> {
  const preview = await previewSeasonStart(input.leagueSlug)
  if (!preview.ok) return { ...preview, startedAt: null }
  const seasonType = input.seasonType ?? 'official'

  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true, divisionCount: true },
  })
  if (!league) return { ...preview, ok: false, reason: '리그를 찾을 수 없습니다', startedAt: null }

  const startedAt = input.startedAt ?? new Date()
  // 베타는 정식 번호를 쓰지 않는다. Season 7 다음에 8이 그대로 남아 있어야 한다
  const number = input.number ?? (seasonType === 'beta' ? BETA_SEASON_NUMBER : preview.nextNumber)

  await prisma.$transaction(async (tx) => {
    if (!input.skipPromotion && league.divisionCount >= 2) {
      const bottom = await tx.leagueClan.findFirst({
        where: { leagueId: league.id, division: 1, placement: false },
        orderBy: { rating: 'asc' },
        select: { id: true },
      })
      const top = await tx.leagueClan.findFirst({
        where: { leagueId: league.id, division: 2, placement: false },
        orderBy: { rating: 'desc' },
        select: { id: true },
      })
      if (bottom && top) {
        await tx.leagueClan.update({ where: { id: bottom.id }, data: { division: 2 } })
        await tx.leagueClan.update({ where: { id: top.id }, data: { division: 1 } })
      }
    }

    await tx.season.create({
      data: { leagueId: league.id, number, startedAt, status: 'active', seasonType },
    })

    /* 개인·클랜 모두 같은 점수에서 시작한다 (soft reset 폐기 — D-064).
       **점수만이 아니라 누적 전적도 초기화한다** (D-101).
       예전에는 rating만 되돌리고 win/lose/kill/death/mvpCount를 그대로 뒀다.
       그러면 베타 시즌의 전적이 다음 시즌 화면에 그대로 남는다.
       직전 시즌 값은 `closeSeason`이 LeaguePlayerSeason 카드로 이미 보존했다. */
    await tx.leaguePlayer.updateMany({
      where: { leagueId: league.id },
      data: {
        rating: SEASON_BASELINE,
        baseRating: SEASON_BASELINE,
        win: 0,
        lose: 0,
        kill: 0,
        death: 0,
        assist: 0,
        headshot: 0,
        mvpCount: 0,
        placement: true,
        placementPlayed: 0,
      },
    })
    // 통합 래더 = baseRating + 무기별 delta 합. 무기별 누적도 같이 비워야 정합성이 유지된다
    await tx.leaguePlayerWeaponStat.deleteMany({
      where: { leaguePlayer: { leagueId: league.id } },
    })
    await tx.leagueClan.updateMany({
      where: { leagueId: league.id },
      data: {
        rating: SEASON_BASELINE,
        win: 0,
        lose: 0,
        placement: true,
        placementPlayed: 0,
      },
    })
  })

  return { ...preview, nextNumber: number, startedAt: startedAt.toISOString() }
}
