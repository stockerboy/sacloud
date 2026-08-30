/**
 * 개발용 시드 — Mock 픽스처를 실제 DB에 적재한다.
 *
 * 목적
 *   Phase 7의 완료 조건 중 하나가 "시드 데이터로 전 화면이 정상 렌더된다"이다
 *   (IMPLEMENTATION_PLAN Phase 7-7). Mock과 **같은 결정적 픽스처**를 넣어야
 *   mock 모드와 live 모드의 화면을 1:1로 비교할 수 있다.
 *
 * 주의
 * - 여기 들어가는 데이터는 전부 **가짜다.** 실제 3rd.supply 기록이 아니다.
 *   그래서 매치의 `origin`을 `mock`으로 남긴다. 나중에 실제 기록과 섞이지 않게 하기 위함이다.
 * - 래더 값도 픽스처 난수라서 SACLOUD 공식으로 계산된 것이 아니다.
 *   `formulaVersion`을 `mock-fixture`로 남겨 **실제 계산 결과로 오인하지 않게** 한다.
 * - 이 스크립트는 개발 DB 전용이다. 운영 DB에 대고 실행하지 않는다 (CLAUDE.md 3-A).
 */
import { randomBytes } from 'node:crypto'
import { hashSync } from 'bcryptjs'
// msw 핸들러까지 끌어오지 않도록 `dataset` 서브패스로 직접 가져온다
import { dataset, CURRENT_SEASON } from '@sacloud/mock/dataset'
import { prisma } from '../src/index.js'

/**
 * 시드 계정 비밀번호 (D-119).
 *
 * 예전에는 여기에 공용 비밀번호가 **평문으로 박혀** 있었고 42개 계정 전원이 그것을
 * 공유했다. 그중 둘은 운영자(role 2)였다. 사이트가 잠깐이라도 외부에 열리면
 * 누구나 관리자로 로그인할 수 있는 상태였다.
 *
 * 이제 기본값은 **아무도 모르는 무작위 값**이다 — 시드 계정은 기본적으로 로그인할 수 없다.
 * 로컬에서 로그인이 필요하면 `SACLOUD_SEED_PASSWORD`를 직접 넣어 실행한다.
 * 저장소에는 어떤 경우에도 평문을 남기지 않는다.
 *
 * ```bash
 * SACLOUD_SEED_PASSWORD='...' pnpm db:seed
 * ```
 */
function seedPassword(): { value: string; provided: boolean } {
  const provided = process.env.SACLOUD_SEED_PASSWORD
  if (provided && provided.trim().length >= 12) return { value: provided, provided: true }
  // 32바이트 난수. 이 값은 어디에도 기록하지 않고 이 실행이 끝나면 사라진다
  return { value: randomBytes(32).toString('base64'), provided: false }
}

/** 이 시드가 만든 매치의 출처 표시 */
const ORIGIN = 'mock'

/** 픽스처 래더 값은 공식으로 계산된 것이 아니라는 표시 */
const FORMULA_VERSION = 'mock-fixture'

const now = new Date(dataset.now)

function date(value: string): Date {
  return new Date(value)
}

function dateOrNull(value: string | null): Date | null {
  return value ? new Date(value) : null
}

/**
 * 시즌 시작/종료 시각.
 * 픽스처에는 시즌 기간이 없다. **원본값이 아니라 시드용으로 만든 값**이며
 * 화면의 지난시즌 표를 채우기 위한 것이다.
 */
function seasonRange(number: number): { startedAt: Date; endedAt: Date | null } {
  const monthsAgo = (CURRENT_SEASON - number) * 3
  const startedAt = new Date(now)
  startedAt.setMonth(startedAt.getMonth() - monthsAgo - 3)
  if (number === CURRENT_SEASON) return { startedAt, endedAt: null }
  const endedAt = new Date(now)
  endedAt.setMonth(endedAt.getMonth() - monthsAgo)
  return { startedAt, endedAt }
}

/**
 * 검수용 계정 두 개를 만든다. **로컬 개발 전용이다.**
 *
 * - `admin-test@naver.com` — 운영자(role 2). 리그를 소유하지 않지만 모든 리그 관리에 접근한다.
 * - `user-test@naver.com`  — 일반 회원. **리그에 참여 중인 클랜 소속 플레이어**와 연동돼 있다.
 *
 * 이미 있으면 만들지 않는다 (여러 번 실행해도 안전하다).
 */
async function seedTestAccounts(passwordHash: string) {
  const accounts = [
    { email: 'admin-test@naver.com', nickname: '검수관리자', role: 2, link: false },
    { email: 'user-test@naver.com', nickname: '검수회원', role: 0, link: true },
  ] as const

  for (const account of accounts) {
    const existing = await prisma.user.findUnique({
      where: { email: account.email },
      select: { id: true },
    })
    if (existing) continue

    const user = await prisma.user.create({
      data: {
        email: account.email,
        passwordHash,
        nickname: account.nickname,
        role: account.role,
        emailVerifiedAt: now,
      },
    })
    if (!account.link) continue

    /**
     * 리그에 참여 중인 클랜에서 **아직 연동되지 않은** 플레이어를 하나 고른다.
     * 한 플레이어는 한 계정에만 연결된다(스키마 유니크 제약).
     */
    const player = await prisma.player.findFirst({
      where: {
        userLink: null,
        clan: { leagueClans: { some: {} } },
      },
      orderBy: { id: 'asc' },
      select: { id: true },
    })
    if (!player) {
      console.info('  경고: 연동할 플레이어를 찾지 못했다. user-test는 미연동 상태다.')
      continue
    }
    await prisma.userPlayerLink.create({ data: { userId: user.id, playerId: player.id } })
  }
}

/**
 * 운영 DB 안전장치 (D-147).
 *
 * 시드는 **가짜** 리그·클랜·선수·게시글을 만든다. 운영 DB 에서 한 번 돌면
 * 사용자 화면에 가짜 데이터가 섞이고 되돌리기 어렵다.
 *
 * 그래서 로컬 개발 DB 가 아니면 **실행을 거부한다.**
 * 정말 필요하면 `SACLOUD_ALLOW_REMOTE_SEED=yes` 를 명시적으로 넣어야 한다.
 */
function assertLocalDatabase(): void {
  if (process.env.SACLOUD_ALLOW_REMOTE_SEED === 'yes') return
  const url = process.env.DATABASE_URL ?? ''
  const isLocal = /@(127\.0\.0\.1|localhost)[:/]/.test(url)
  if (isLocal) return
  console.error(
    [
      '시드를 중단한다 — DATABASE_URL 이 로컬 개발 DB 가 아니다.',
      '  시드는 가짜 데이터를 만든다. 운영 DB 에서 돌리면 안 된다.',
      '  의도한 것이면 SACLOUD_ALLOW_REMOTE_SEED=yes 를 넣어라.',
    ].join('\n'),
  )
  process.exit(1)
}

async function main() {
  assertLocalDatabase()
  const started = Date.now()
  console.info('시드 시작 — 기존 데이터를 지우고 픽스처를 다시 넣는다.')

  /* ---------------------------------------------------------------------- */
  /* 0. 정리                                                                  */
  /*    개발 DB 전용. 참조 순서를 지켜 지운다.                                  */
  /* ---------------------------------------------------------------------- */
  await prisma.$transaction([
    prisma.matchPlayerStat.deleteMany(),
    prisma.match.deleteMany(),
    prisma.leaguePlayerSeason.deleteMany(),
    prisma.leagueClanSeason.deleteMany(),
    prisma.leaguePlayerWeaponStat.deleteMany(),
    prisma.leaguePlayer.deleteMany(),
    prisma.leagueClan.deleteMany(),
    prisma.leagueInvitation.deleteMany(),
    prisma.rankSnapshot.deleteMany(),
    prisma.season.deleteMany(),
    prisma.leagueMap.deleteMany(),
    prisma.leaguePlayerLimit.deleteMany(),
    prisma.vote.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.board.deleteMany(),
    prisma.boardCategory.deleteMany(),
    prisma.league.deleteMany(),
    prisma.userPlayerLink.deleteMany(),
    prisma.authToken.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.upload.deleteMany(),
    prisma.user.deleteMany(),
  ])
  // 플레이어 ↔ 클랜은 서로를 참조하므로 마지막에 끊고 지운다
  await prisma.clan.updateMany({ data: { masterPlayerId: null } })
  await prisma.player.updateMany({ data: { clanId: null } })
  await prisma.player.deleteMany()
  await prisma.clan.deleteMany()
  await prisma.gameMap.deleteMany()

  /* ---------------------------------------------------------------------- */
  /* 1. 맵 · 게시판 카테고리                                                   */
  /* ---------------------------------------------------------------------- */
  await prisma.gameMap.createMany({
    data: dataset.maps.map((map) => ({ id: map.id, name: map.name })),
  })

  await prisma.boardCategory.createMany({
    data: dataset.categories.map((category) => ({
      slug: category.slug,
      name: category.name,
      notice: category.notice,
      order: category.order,
    })),
  })

  /* ---------------------------------------------------------------------- */
  /* 2. 클랜 · 플레이어                                                        */
  /*    서로를 참조하므로 클랜을 마스터 없이 먼저 만들고 나중에 채운다.           */
  /* ---------------------------------------------------------------------- */
  await prisma.clan.createMany({
    data: dataset.clans.map((clan) => ({
      id: clan.id,
      slug: clan.slug,
      name: clan.name,
      markBgUrl: clan.markBg,
      markFrontUrl: clan.markFront,
      notice: clan.notice,
      establishedAt: date(clan.establishedAt),
      renewedAt: dateOrNull(clan.renewedAt),
    })),
  })

  await prisma.player.createMany({
    data: dataset.players.map((player) => ({
      id: player.id,
      name: player.name,
      clanId: player.clanId,
      position: player.position,
      note: player.note,
      renewedAt: dateOrNull(player.renewedAt),
    })),
  })

  for (const clan of dataset.clans) {
    await prisma.clan.update({
      where: { id: clan.id },
      data: { masterPlayerId: clan.masterPlayerId },
    })
  }

  /* ---------------------------------------------------------------------- */
  /* 3. 사용자 · 서든어택 계정 연동                                            */
  /* ---------------------------------------------------------------------- */
  const seedSecret = seedPassword()
  const passwordHash = hashSync(seedSecret.value, 10)
  await prisma.user.createMany({
    data: dataset.users.map((user) => ({
      id: user.id,
      email: user.email,
      passwordHash,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      role: user.role,
      emailVerifiedAt: dateOrNull(user.emailVerifiedAt),
      createdAt: date(user.createdAt),
    })),
  })

  const linked = dataset.users.filter((user) => user.playerId)
  if (linked.length > 0) {
    await prisma.userPlayerLink.createMany({
      data: linked.map((user) => ({
        userId: user.id,
        playerId: user.playerId as string,
        verifiedAt: date(user.createdAt),
      })),
    })
  }

  /* ---------------------------------------------------------------------- */
  /* 4. 리그 · 시즌                                                            */
  /* ---------------------------------------------------------------------- */
  await prisma.league.createMany({
    data: dataset.leagues.map((league) => ({
      id: league.id,
      slug: league.slug,
      name: league.name,
      description: league.description,
      ownerUserId: league.ownerUserId,
      divisionCount: league.divisionCount,
      status: league.status,
      official: league.official,
      createdAt: date(league.createdAt),
    })),
  })

  await prisma.leagueMap.createMany({
    data: dataset.leagues.flatMap((league) =>
      league.mapIds.map((mapId) => ({ leagueId: league.id, mapId })),
    ),
  })

  await prisma.leaguePlayerLimit.createMany({
    data: dataset.leagues.flatMap((league) =>
      league.playerLimits.map((playerCount) => ({ leagueId: league.id, playerCount })),
    ),
  })

  // 픽스처에 등장하는 모든 시즌 번호 + 현재 시즌
  const seasonNumbers = new Set<number>([CURRENT_SEASON])
  for (const entry of dataset.leaguePlayerSeasons) seasonNumbers.add(entry.season)
  for (const entry of dataset.leagueClanSeasons) seasonNumbers.add(entry.season)

  const seasonIdOf = new Map<string, string>()
  for (const league of dataset.leagues) {
    for (const number of [...seasonNumbers].sort((a, b) => a - b)) {
      const { startedAt, endedAt } = seasonRange(number)
      const season = await prisma.season.create({
        data: {
          leagueId: league.id,
          number,
          startedAt,
          endedAt,
          status: number === CURRENT_SEASON ? 'active' : 'closed',
        },
      })
      seasonIdOf.set(`${league.id}:${number}`, season.id)
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 5. 리그 참여 클랜 · 플레이어                                              */
  /* ---------------------------------------------------------------------- */
  await prisma.leagueClan.createMany({
    data: dataset.leagueClans.map((entry) => ({
      id: entry.id,
      leagueId: entry.leagueId,
      clanId: entry.clanId,
      rating: entry.rating,
      division: entry.division,
      win: entry.win,
      lose: entry.lose,
      placement: entry.placement,
      status: entry.status,
      joinedAt: date(entry.joinedAt),
    })),
  })

  const clanIdOfLeagueClan = new Map(dataset.leagueClans.map((entry) => [entry.id, entry.clanId]))

  await prisma.leaguePlayer.createMany({
    data: dataset.leaguePlayers.map((entry) => ({
      id: entry.id,
      leagueId: entry.leagueId,
      playerId: entry.playerId,
      clanId: clanIdOfLeagueClan.get(entry.leagueClanId) ?? null,
      // baseRating은 무기별 delta를 합산한 뒤 6단계에서 다시 맞춘다
      rating: entry.rating,
      baseRating: entry.rating,
      win: entry.win,
      lose: entry.lose,
      kill: entry.kill,
      death: entry.death,
      assist: entry.assist,
      headshot: entry.headshot,
      mvpCount: entry.mvpCount,
      placement: entry.placement,
    })),
  })

  /* ---------------------------------------------------------------------- */
  /* 6. 매치 · 참가자 기록                                                     */
  /* ---------------------------------------------------------------------- */
  /** 무기별 누적 (leaguePlayerId → weapon → 합계) */
  const weaponAccumulator = new Map<
    string,
    Map<number, { ratingDelta: number; win: number; lose: number; kill: number; death: number; assist: number; headshot: number }>
  >()
  const leaguePlayerIdOf = new Map(
    dataset.leaguePlayers.map((entry) => [`${entry.leagueId}:${entry.playerId}`, entry.id]),
  )

  const matchRows = dataset.matches.map((match) => ({
    id: match.id,
    leagueId: match.leagueId,
    seasonId: seasonIdOf.get(`${match.leagueId}:${CURRENT_SEASON}`) ?? null,
    mapId: match.mapId,
    playerCount: match.playerCount,
    startAt: date(match.startAt),
    endAt: date(match.endAt),
    playTime: match.playTime,
    /* 옛 `blueFirst` 는 폐기됐다 (D-207) — 시드도 더 이상 채우지 않는다.
       전반 공수는 근거로 정해진 아래 칸이 담는다 */
    firstHalfAttackSide: match.firstHalfAttackSide,
    firstSideEvidence: match.firstHalfAttackSide === null ? null : 'mock',
    winnerSide: match.winnerSide,
    mvpPlayerId: match.mvpPlayerId,
    redLeagueClanId: match.redLeagueClanId,
    blueLeagueClanId: match.blueLeagueClanId,
    redDivisionAtMatch: match.redDivision,
    blueDivisionAtMatch: match.blueDivision,
    redRatingBefore: match.redRating,
    blueRatingBefore: match.blueRating,
    redPlacement: match.redPlacement,
    bluePlacement: match.bluePlacement,
    redRatingUpdate: match.redRatingUpdate,
    blueRatingUpdate: match.blueRatingUpdate,
    origin: ORIGIN,
    sourceMatchId: match.id,
  }))

  // 3,000건이라 한 번에 넣지 않고 나눠 넣는다 (파라미터 수 제한 회피)
  const CHUNK = 500
  for (let index = 0; index < matchRows.length; index += CHUNK) {
    await prisma.match.createMany({ data: matchRows.slice(index, index + CHUNK) })
  }

  const statRows: {
    matchId: string
    playerId: string
    side: string
    kill: number
    death: number
    assist: number
    headshot: number | null
    damage: number | null
    weapon: number
    dropout: boolean
    mvp: boolean
    ratingBefore: number | null
    ratingUpdate: number | null
    ratingAfter: number | null
    playerDivisionAtMatch: number
    opponentDivisionAtMatch: number
    opponentAvgRating: number | null
    formulaVersion: string
    isPlacement: boolean
  }[] = []

  for (const match of dataset.matches) {
    /** 진영별 경기 직전 개인 래더 평균 — 공식 입력 Ro */
    const avgOf = (side: string): number | null => {
      const ratings = match.players
        .filter((stat) => stat.side === side && stat.rating !== null)
        .map((stat) => stat.rating as number)
      if (ratings.length === 0) return null
      return Math.round(ratings.reduce((sum, value) => sum + value, 0) / ratings.length)
    }
    const avgRed = avgOf('red')
    const avgBlue = avgOf('blue')

    for (const stat of match.players) {
      const isRed = stat.side === 'red'
      const ratingAfter =
        stat.rating !== null && stat.ratingUpdate !== null ? stat.rating + stat.ratingUpdate : null

      statRows.push({
        matchId: match.id,
        playerId: stat.playerId,
        side: stat.side,
        kill: stat.kill,
        death: stat.death,
        assist: stat.assist,
        headshot: stat.headshot,
        damage: stat.damage,
        weapon: stat.weapon,
        dropout: stat.dropout,
        mvp: stat.mvp,
        ratingBefore: stat.rating,
        ratingUpdate: stat.ratingUpdate,
        ratingAfter,
        playerDivisionAtMatch: isRed ? match.redDivision : match.blueDivision,
        opponentDivisionAtMatch: isRed ? match.blueDivision : match.redDivision,
        opponentAvgRating: isRed ? avgBlue : avgRed,
        formulaVersion: FORMULA_VERSION,
        isPlacement: stat.placement,
      })

      // 무기별 누적
      const leaguePlayerId = leaguePlayerIdOf.get(`${match.leagueId}:${stat.playerId}`)
      if (!leaguePlayerId) continue
      const byWeapon = weaponAccumulator.get(leaguePlayerId) ?? new Map()
      const bucket = byWeapon.get(stat.weapon) ?? {
        ratingDelta: 0,
        win: 0,
        lose: 0,
        kill: 0,
        death: 0,
        assist: 0,
        headshot: 0,
      }
      bucket.ratingDelta += stat.ratingUpdate ?? 0
      if (stat.win) bucket.win += 1
      else bucket.lose += 1
      bucket.kill += stat.kill
      bucket.death += stat.death
      bucket.assist += stat.assist
      bucket.headshot += stat.headshot
      byWeapon.set(stat.weapon, bucket)
      weaponAccumulator.set(leaguePlayerId, byWeapon)
    }
  }

  for (let index = 0; index < statRows.length; index += CHUNK) {
    await prisma.matchPlayerStat.createMany({ data: statRows.slice(index, index + CHUNK) })
  }

  /* ---------------------------------------------------------------------- */
  /* 7. 무기별 기록 + baseRating 보정                                          */
  /*    통합 래더 = baseRating + 무기별 delta 합  (LADDER_IMPLEMENTATION_SPEC 6장) */
  /* ---------------------------------------------------------------------- */
  const weaponRows: {
    leaguePlayerId: string
    weapon: number
    ratingDelta: number
    win: number
    lose: number
    kill: number
    death: number
    assist: number
    headshot: number
  }[] = []

  const baseRatingFix: { id: string; baseRating: number }[] = []

  for (const entry of dataset.leaguePlayers) {
    const byWeapon = weaponAccumulator.get(entry.id)
    let totalDelta = 0
    for (const [weapon, bucket] of byWeapon ?? []) {
      weaponRows.push({ leaguePlayerId: entry.id, weapon, ...bucket })
      totalDelta += bucket.ratingDelta
    }
    baseRatingFix.push({ id: entry.id, baseRating: entry.rating - totalDelta })
  }

  for (let index = 0; index < weaponRows.length; index += CHUNK) {
    await prisma.leaguePlayerWeaponStat.createMany({ data: weaponRows.slice(index, index + CHUNK) })
  }

  for (const fix of baseRatingFix) {
    await prisma.leaguePlayer.update({
      where: { id: fix.id },
      data: { baseRating: fix.baseRating },
    })
  }

  /* ---------------------------------------------------------------------- */
  /* 8. 지난시즌 스냅샷                                                        */
  /* ---------------------------------------------------------------------- */
  const leagueIdOfLeaguePlayer = new Map(
    dataset.leaguePlayers.map((entry) => [entry.id, entry.leagueId]),
  )
  const leagueIdOfLeagueClan = new Map(
    dataset.leagueClans.map((entry) => [entry.id, entry.leagueId]),
  )

  await prisma.leaguePlayerSeason.createMany({
    data: dataset.leaguePlayerSeasons.flatMap((entry) => {
      const leagueId = leagueIdOfLeaguePlayer.get(entry.leaguePlayerId)
      const seasonId = leagueId ? seasonIdOf.get(`${leagueId}:${entry.season}`) : undefined
      if (!seasonId) return []
      return [
        {
          leaguePlayerId: entry.leaguePlayerId,
          seasonId,
          season: entry.season,
          rank: entry.rank,
          rankCount: entry.rankCount,
          rating: entry.rating,
          win: entry.win,
          lose: entry.lose,
          kill: entry.kill,
          death: entry.death,
        },
      ]
    }),
  })

  await prisma.leagueClanSeason.createMany({
    data: dataset.leagueClanSeasons.flatMap((entry) => {
      const leagueId = leagueIdOfLeagueClan.get(entry.leagueClanId)
      const seasonId = leagueId ? seasonIdOf.get(`${leagueId}:${entry.season}`) : undefined
      if (!seasonId) return []
      return [
        {
          leagueClanId: entry.leagueClanId,
          seasonId,
          season: entry.season,
          rank: entry.rank,
          rankCount: entry.rankCount,
          rating: entry.rating,
          division: entry.division,
          win: entry.win,
          lose: entry.lose,
        },
      ]
    }),
  })

  /* ---------------------------------------------------------------------- */
  /* 9. 게시판                                                                */
  /* ---------------------------------------------------------------------- */
  const commentCountOf = new Map<string, number>()
  for (const comment of dataset.comments) {
    commentCountOf.set(comment.boardId, (commentCountOf.get(comment.boardId) ?? 0) + 1)
  }

  const boardRows = dataset.boards.map((board) => ({
    id: board.id,
    categorySlug: board.category,
    title: board.title,
    content: board.content,
    userId: board.userId,
    anonAlias: board.anonAlias,
    discloseType: board.discloseType,
    writerApp: board.writerApp,
    viewCount: board.viewCount,
    likeCount: board.likeCount,
    dislikeCount: board.dislikeCount,
    commentCount: commentCountOf.get(board.id) ?? 0,
    hasImage: board.hasImage,
    notice: board.notice,
    createdAt: date(board.createdAt),
    lastEdited: dateOrNull(board.lastEdited),
  }))

  for (let index = 0; index < boardRows.length; index += CHUNK) {
    await prisma.board.createMany({ data: boardRows.slice(index, index + CHUNK) })
  }

  // 대댓글이 부모를 참조하므로 최상위 댓글을 먼저 넣는다
  const roots = dataset.comments.filter((comment) => comment.parentId === null)
  const replies = dataset.comments.filter((comment) => comment.parentId !== null)

  const toCommentRow = (comment: (typeof dataset.comments)[number]) => ({
    id: comment.id,
    boardId: comment.boardId,
    parentId: comment.parentId,
    content: comment.content,
    userId: comment.userId,
    anonAlias: comment.anonAlias,
    discloseType: comment.discloseType,
    writerApp: comment.writerApp,
    likeCount: comment.likeCount,
    dislikeCount: comment.dislikeCount,
    deleted: comment.deleted,
    createdAt: date(comment.createdAt),
  })

  for (const group of [roots, replies]) {
    const rows = group.map(toCommentRow)
    for (let index = 0; index < rows.length; index += CHUNK) {
      await prisma.comment.createMany({ data: rows.slice(index, index + CHUNK) })
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 10. 검수용 계정 (로컬 개발 전용)                                          */
  /*                                                                        */
  /*   픽스처 사용자만으로는 검수 조합이 하나 빈다 —                            */
  /*   "리그에 참여 중인 클랜 소속인데 리그 소유자는 아닌" 계정이 없다.          */
  /*   (픽스처는 리그 소유자에게만 플레이어를 연동한다.)                        */
  /*   재현 가능하게 시드에서 함께 만든다.                                      */
  /*                                                                        */
  /*   **응답에 영향을 주지 않도록** 리그를 소유하게 하지 않는다.               */
  /*   소유자를 바꾸면 리그 목록·상세의 `user`가 달라져 mock↔live 대조가 깨진다. */
  /*   `admin-test`는 운영자 권한(role 2)으로 모든 리그 관리에 접근할 수 있다.   */
  /* ---------------------------------------------------------------------- */
  await seedTestAccounts(passwordHash)

  /* ---------------------------------------------------------------------- */
  /* 결과                                                                     */
  /* ---------------------------------------------------------------------- */
  const counts = {
    맵: await prisma.gameMap.count(),
    클랜: await prisma.clan.count(),
    플레이어: await prisma.player.count(),
    사용자: await prisma.user.count(),
    리그: await prisma.league.count(),
    시즌: await prisma.season.count(),
    리그클랜: await prisma.leagueClan.count(),
    리그플레이어: await prisma.leaguePlayer.count(),
    무기별기록: await prisma.leaguePlayerWeaponStat.count(),
    매치: await prisma.match.count(),
    참가기록: await prisma.matchPlayerStat.count(),
    지난시즌_개인: await prisma.leaguePlayerSeason.count(),
    지난시즌_클랜: await prisma.leagueClanSeason.count(),
    게시글: await prisma.board.count(),
    댓글: await prisma.comment.count(),
  }

  console.info(Object.entries(counts).map(([key, value]) => `${key}=${value}`).join('  '))
  console.info(`시드 완료 — ${((Date.now() - started) / 1000).toFixed(1)}초`)
  /* 비밀번호 원문을 찍지 않는다 (D-119). 어떤 상태인지만 알린다 */
  console.info(
    seedSecret.provided
      ? '시드 계정 비밀번호: SACLOUD_SEED_PASSWORD 로 설정됨'
      : '시드 계정 비밀번호: 무작위(로그인 불가). 필요하면 SACLOUD_SEED_PASSWORD 를 넣고 다시 실행해라',
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
