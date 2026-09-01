/**
 * 래더 스냅샷 백업 / 복원 (D-145).
 *
 * **replay 전에 반드시 돌린다.** 백업이 실패하면 replay 를 하지 않는다.
 *
 * ── 무엇을 백업하는가
 *   replay 가 덮어쓰는 값 전부다 — 개인·클랜 래더 상태와 경기별 증감 기록.
 *   raw/staging(수집 원본)은 **건드리지 않는다.** replay 는 그것을 읽기만 한다.
 *
 * ── 어디에 백업하는가
 *   DB 밖의 JSON 파일이다. 마이그레이션이나 테이블 조작 없이 되돌릴 수 있어야 한다.
 */
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, type WriteStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { prisma, type Prisma } from '@sacloud/db'
import { log, warn } from '../lib/log.js'

export interface RatingSnapshot {
  version: 1
  leagueSlug: string
  takenAt: string
  counts: {
    leaguePlayers: number
    leagueClans: number
    matchPlayerStats: number
    matches: number
  }
  checksum: string
  leaguePlayers: {
    id: string
    playerId: string
    rating: number
    baseRating: number
    internalRating: number
    activityPenalty: number
    lastRatedAt: string | null
    win: number
    lose: number
    kill: number
    death: number
    assist: number
    placement: boolean
    placementPlayed: number
    clanId: string | null
  }[]
  leagueClans: {
    id: string
    rating: number
    internalRating: number
    compositionScore: number
    activityPenalty: number
    lastRatedAt: string | null
    win: number
    lose: number
    placement: boolean
    placementPlayed: number
  }[]
  matchPlayerStats: {
    matchId: string
    playerId: string
    ratingBefore: number | null
    ratingUpdate: number | null
    ratingAfter: number | null
    opponentAvgRating: number | null
    kUsed: number | null
    multiplierUsed: number | null
    isPlacement: boolean
    participantRole: string
    formulaVersion: string | null
  }[]
  matches: {
    id: string
    redRatingBefore: number | null
    blueRatingBefore: number | null
    redRatingUpdate: number | null
    blueRatingUpdate: number | null
    redPlacement: boolean
    bluePlacement: boolean
  }[]
}

/** 내용이 바뀌면 값이 달라지는 체크섬 — 복원 검증에 쓴다 */
function checksumOf(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 32)
}

export function snapshotPath(leagueSlug: string, stamp: string): string {
  return join(process.cwd(), 'backups', 'rating', `${leagueSlug}-${stamp}.json`)
}

export async function createRatingSnapshot(input: {
  leagueSlug: string
  /** 파일명에 쓸 시각 문자열. 결정적으로 만들고 싶으면 넘긴다 */
  stamp: string
  outPath?: string
}): Promise<{ path: string; snapshot: RatingSnapshot } | null> {
  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true, slug: true },
  })
  if (!league) {
    warn(`리그를 찾을 수 없다: ${input.leagueSlug}`)
    return null
  }

  const [leaguePlayers, leagueClans, matchPlayerStats, matches] = await Promise.all([
    prisma.leaguePlayer.findMany({
      where: { leagueId: league.id },
      orderBy: { id: 'asc' },
      select: {
        id: true, playerId: true, rating: true, baseRating: true, internalRating: true,
        activityPenalty: true, lastRatedAt: true, win: true, lose: true, kill: true,
        death: true, assist: true, placement: true, placementPlayed: true, clanId: true,
      },
    }),
    prisma.leagueClan.findMany({
      where: { leagueId: league.id },
      orderBy: { id: 'asc' },
      select: {
        id: true, rating: true, internalRating: true, compositionScore: true,
        activityPenalty: true, lastRatedAt: true, win: true, lose: true,
        placement: true, placementPlayed: true,
      },
    }),
    prisma.matchPlayerStat.findMany({
      where: { match: { leagueId: league.id } },
      orderBy: [{ matchId: 'asc' }, { playerId: 'asc' }],
      select: {
        matchId: true, playerId: true, ratingBefore: true, ratingUpdate: true,
        ratingAfter: true, opponentAvgRating: true, kUsed: true, multiplierUsed: true,
        isPlacement: true, participantRole: true, formulaVersion: true,
      },
    }),
    prisma.match.findMany({
      where: { leagueId: league.id },
      orderBy: { id: 'asc' },
      select: {
        id: true, redRatingBefore: true, blueRatingBefore: true,
        redRatingUpdate: true, blueRatingUpdate: true,
        redPlacement: true, bluePlacement: true,
      },
    }),
  ])

  const body = {
    leaguePlayers: leaguePlayers.map((r) => ({ ...r, lastRatedAt: r.lastRatedAt?.toISOString() ?? null })),
    leagueClans: leagueClans.map((r) => ({ ...r, lastRatedAt: r.lastRatedAt?.toISOString() ?? null })),
    matchPlayerStats,
    matches,
  }

  const snapshot: RatingSnapshot = {
    version: 1,
    leagueSlug: league.slug,
    takenAt: input.stamp,
    counts: {
      leaguePlayers: leaguePlayers.length,
      leagueClans: leagueClans.length,
      matchPlayerStats: matchPlayerStats.length,
      matches: matches.length,
    },
    checksum: checksumOf(body),
    ...body,
  }

  const path = input.outPath ?? snapshotPath(league.slug, input.stamp)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(snapshot, null, 2), 'utf8')

  log(
    `백업 완료 — ${path}\n` +
      `  LeaguePlayer ${snapshot.counts.leaguePlayers} · LeagueClan ${snapshot.counts.leagueClans} · ` +
      `MatchPlayerStat ${snapshot.counts.matchPlayerStats} · Match ${snapshot.counts.matches}\n` +
      `  checksum ${snapshot.checksum}`,
  )
  return { path, snapshot }
}

/**
 * 백업으로 되돌린다.
 *
 * **삭제하지 않는다.** 백업에 있는 행의 값을 되돌려 놓기만 한다.
 * replay 가 새로 만든 행(백업 당시 없던 LeaguePlayer 등)은 남을 수 있으므로,
 * 되돌린 뒤 개수를 함께 보고한다.
 */
export async function restoreRatingSnapshot(input: {
  path: string
  dryRun: boolean
}): Promise<{ restored: { leaguePlayers: number; leagueClans: number; stats: number; matches: number } }> {
  const snapshot = JSON.parse(await readFile(input.path, 'utf8')) as RatingSnapshot
  const body = {
    leaguePlayers: snapshot.leaguePlayers,
    leagueClans: snapshot.leagueClans,
    matchPlayerStats: snapshot.matchPlayerStats,
    matches: snapshot.matches,
  }
  const checksum = checksumOf(body)
  if (checksum !== snapshot.checksum) {
    throw new Error(`백업 파일이 손상됐다 — checksum 불일치 (${checksum} != ${snapshot.checksum})`)
  }

  const restored = { leaguePlayers: 0, leagueClans: 0, stats: 0, matches: 0 }
  if (input.dryRun) {
    log(
      `[dry-run] 복원 대상 — LeaguePlayer ${snapshot.leaguePlayers.length} · ` +
        `LeagueClan ${snapshot.leagueClans.length} · MatchPlayerStat ${snapshot.matchPlayerStats.length} · ` +
        `Match ${snapshot.matches.length}. 아무것도 쓰지 않았다`,
    )
    return { restored }
  }

  for (const row of snapshot.leaguePlayers) {
    await prisma.leaguePlayer.update({
      where: { id: row.id },
      data: {
        rating: row.rating,
        baseRating: row.baseRating,
        internalRating: row.internalRating,
        activityPenalty: row.activityPenalty,
        lastRatedAt: row.lastRatedAt ? new Date(row.lastRatedAt) : null,
        win: row.win, lose: row.lose, kill: row.kill, death: row.death, assist: row.assist,
        placement: row.placement, placementPlayed: row.placementPlayed,
      },
    })
    restored.leaguePlayers += 1
  }
  for (const row of snapshot.leagueClans) {
    await prisma.leagueClan.update({
      where: { id: row.id },
      data: {
        rating: row.rating,
        internalRating: row.internalRating,
        compositionScore: row.compositionScore,
        activityPenalty: row.activityPenalty,
        lastRatedAt: row.lastRatedAt ? new Date(row.lastRatedAt) : null,
        win: row.win, lose: row.lose,
        placement: row.placement, placementPlayed: row.placementPlayed,
      },
    })
    restored.leagueClans += 1
  }
  for (const row of snapshot.matchPlayerStats) {
    await prisma.matchPlayerStat.update({
      where: { matchId_playerId: { matchId: row.matchId, playerId: row.playerId } },
      data: {
        ratingBefore: row.ratingBefore,
        ratingUpdate: row.ratingUpdate,
        ratingAfter: row.ratingAfter,
        opponentAvgRating: row.opponentAvgRating,
        kUsed: row.kUsed,
        multiplierUsed: row.multiplierUsed,
        isPlacement: row.isPlacement,
        participantRole: row.participantRole,
        formulaVersion: row.formulaVersion,
      },
    })
    restored.stats += 1
  }
  for (const row of snapshot.matches) {
    await prisma.match.update({
      where: { id: row.id },
      data: {
        redRatingBefore: row.redRatingBefore,
        blueRatingBefore: row.blueRatingBefore,
        redRatingUpdate: row.redRatingUpdate,
        blueRatingUpdate: row.blueRatingUpdate,
        redPlacement: row.redPlacement,
        bluePlacement: row.bluePlacement,
      },
    })
    restored.matches += 1
  }

  log(
    `복원 완료 — LeaguePlayer ${restored.leaguePlayers} · LeagueClan ${restored.leagueClans} · ` +
      `MatchPlayerStat ${restored.stats} · Match ${restored.matches}`,
  )
  return { restored }
}

/* ========================================================================== */
/* v2 — 줄 단위(JSONL) 스트리밍 백업                                            */
/* ========================================================================== */

/**
 * **왜 새로 만드나** (2026-09-02)
 *
 * 위의 v1 은 sanply(202만 참가행)에서 죽는다. 실측 두 군데가 동시에 터진다.
 *
 * ```
 * ① prisma.matchPlayerStat.findMany()  202만 행을 한 번에
 *      → Failed to convert rust String into napi string
 * ② JSON.stringify(snapshot, null, 2)  supply(130만)가 이미 492MB
 *      → sanply 는 그 1.5배. V8 의 문자열 상한에 걸린다
 * ```
 *
 * `checksumOf` 도 같은 `JSON.stringify` 를 한 번 더 부르므로 두 배로 위험하다.
 *
 * **v1 을 지우지 않는다** (`CLAUDE.md` 10-4). 작은 리그에서는 그대로 쓸 수 있고,
 * 이미 떠 둔 v1 백업 파일을 되돌릴 길이 그것뿐이다.
 * `rating-restore` 는 파일을 열어 보고 v1/v2 를 스스로 가른다.
 *
 * ── 형식
 *   한 줄에 한 레코드다. 첫 줄이 머리글, 마지막 줄이 꼬리글이다.
 *
 * ```
 * {"kind":"header","version":2,"leagueSlug":"sanply","takenAt":"...","counts":{...}}
 * {"kind":"leaguePlayer","row":{...}}
 * ...
 * {"kind":"footer","checksum":"..."}
 * ```
 *
 *   `counts` 가 **두 곳에 있다.** 뜻이 다르다.
 *
 *   - 머리글의 `counts` — 시작할 때 센 **예고**다. 파일을 끝까지 읽지 않고도 규모를 안다
 *   - 꼬리글의 `counts` — 실제로 쓴 **줄 수**다. **이쪽이 정본**이고 복원이 이것과 대조한다
 *
 *   둘을 나눈 이유는 **백업이 도는 동안에도 경기가 들어오기 때문**이다.
 *   sanply 는 20~30분마다 새 경기가 적재되는데(2026-09-02 실측) 202만 행 백업은
 *   그보다 오래 걸린다. 키셋으로 오름차순으로 읽으므로 도중에 생긴 행이 뒤에 붙어
 *   **실제 줄 수가 예고보다 많아지는 것이 정상**이다. 그걸 실패로 치면 큰 리그는
 *   영영 백업을 못 뜬다. 그래서 어긋나면 **경고만 하고 그대로 쓴다.**
 *
 *   그래도 「반쯤 쓰다 죽은 파일」은 걸린다 — 그런 파일에는 **꼬리글 자체가 없다.**
 *
 * ── 체크섬
 *   머리글·꼬리글을 뺀 **레코드 줄의 바이트를 쓰는 순서 그대로** sha256 에 흘린다.
 *   통짜 문자열을 만들지 않으므로 크기와 무관하다. 복원할 때 같은 방식으로 다시 세어
 *   대조하므로 v1 과 검증 강도가 같다.
 */
export const RATING_SNAPSHOT_STREAM_VERSION = 2

/** 한 번에 읽어 오는 행 수. 202만 행이면 이 크기로 41번 나눠 읽는다 */
const READ_CHUNK = 50_000

/** 네 표의 행 수. 머리글(예고)과 꼬리글(실제) 양쪽에 같은 모양으로 들어간다 */
type Counts = RatingSnapshot['counts']

export interface RatingSnapshotStreamHeader {
  kind: 'header'
  version: typeof RATING_SNAPSHOT_STREAM_VERSION
  leagueSlug: string
  takenAt: string
  counts: RatingSnapshot['counts']
}

export function snapshotStreamPath(leagueSlug: string, stamp: string): string {
  return join(process.cwd(), 'backups', 'rating', `${leagueSlug}-${stamp}.jsonl`)
}

/**
 * 끊긴 접속을 **한 번의 실패로 치지 않는다.**
 *
 * 202만 행짜리 백업은 30분 넘게 돌고, 그동안 운영 풀러(Supavisor)가 한 번씩 끊긴다.
 * 실측 2026-09-02: sanply 백업이 267MB(약 절반)에서
 * `Can't reach database server at ...:6543` 으로 죽었다. 코드가 아니라 접속이다.
 * 인수인계도 같은 증상을 적어 뒀다 — **도달 실패 → 즉시 재시도하면 통과**(D-249).
 *
 * 반쯤 쓰다 죽은 파일은 꼬리글이 없어서 복원이 거부한다. 안전하기는 하지만
 * **30분을 버리고 아무 백업도 못 얻는다.** 그래서 여기서 버틴다.
 *
 * 읽기만 재시도한다 — 같은 질의를 다시 보내는 것이라 부작용이 없다.
 * 쓰기(복원)에는 걸지 않는다.
 */
async function readWithRetry<T>(what: string, run: () => Promise<T>): Promise<T> {
  const delays = [1_000, 3_000, 8_000, 20_000]
  let lastError: unknown
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return await run()
    } catch (error) {
      lastError = error
      if (attempt === delays.length) break
      const wait = delays[attempt]!
      warn(`${what} 읽기 실패 (${attempt + 1}/${delays.length + 1}) — ${wait / 1000}초 뒤 다시 시도한다`)
      await new Promise<void>((resolve) => setTimeout(resolve, wait))
    }
  }
  throw lastError
}

/** 백프레셔를 지킨다 — `write()` 가 false 를 주면 `drain` 을 기다린다 */
async function writeLine(stream: WriteStream, line: string): Promise<void> {
  if (!stream.write(line)) {
    await new Promise<void>((resolve) => stream.once('drain', resolve))
  }
}

export async function createRatingSnapshotStream(input: {
  leagueSlug: string
  stamp: string
  outPath?: string
}): Promise<{ path: string; header: RatingSnapshotStreamHeader; checksum: string } | null> {
  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true, slug: true },
  })
  if (!league) {
    warn(`리그를 찾을 수 없다: ${input.leagueSlug}`)
    return null
  }

  const matchWhere = { leagueId: league.id }
  const statWhere = { match: { leagueId: league.id } }
  /* ⚠ `Promise.all` 로 묶지 않는다. 운영 접속 문자열이 `connection_limit=1` 이라
     동시에 네 건을 걸면 통로 하나를 서로 기다리다 10초 풀 타임아웃으로 죽는다 (D-239).
     실측 2026-09-02 sanply: Promise.all 이면 `prisma.match.count()` 에서
     "Timed out fetching a new connection from the connection pool". 순차로 하면 통과한다.
     세는 것은 네 번뿐이라 순차로 해도 비용이 무시할 만하다 */
  const leaguePlayers = await readWithRetry('LeaguePlayer 수', () =>
    prisma.leaguePlayer.count({ where: { leagueId: league.id } }),
  )
  const leagueClans = await readWithRetry('LeagueClan 수', () =>
    prisma.leagueClan.count({ where: { leagueId: league.id } }),
  )
  const matchPlayerStats = await readWithRetry('MatchPlayerStat 수', () =>
    prisma.matchPlayerStat.count({ where: statWhere }),
  )
  const matches = await readWithRetry('Match 수', () => prisma.match.count({ where: matchWhere }))

  const header: RatingSnapshotStreamHeader = {
    kind: 'header',
    version: RATING_SNAPSHOT_STREAM_VERSION,
    leagueSlug: league.slug,
    takenAt: input.stamp,
    counts: { leaguePlayers, leagueClans, matchPlayerStats, matches },
  }

  const path = input.outPath ?? snapshotStreamPath(league.slug, input.stamp)
  await mkdir(dirname(path), { recursive: true })
  const stream = createWriteStream(path, { encoding: 'utf8' })
  const hash = createHash('sha256')
  const written = { leaguePlayers: 0, leagueClans: 0, matchPlayerStats: 0, matches: 0 }

  /** 레코드 한 줄 — 체크섬에 흘리고 파일에 쓴다. 순서가 곧 체크섬이다 */
  const emit = async (kind: string, row: unknown): Promise<void> => {
    const line = `${JSON.stringify({ kind, row })}\n`
    hash.update(line)
    await writeLine(stream, line)
  }

  try {
    await writeLine(stream, `${JSON.stringify(header)}\n`)

    /* ── LeaguePlayer — id 를 키셋으로 끊어 읽는다.
       `cursor` 옵션 대신 `id > 마지막값` 을 쓴다. 조건부 스프레드로 넘기면
       findMany 의 반환 타입이 커서 변수에 되물려 순환 추론이 난다 (TS7022). */
    let cursor: string | null = null
    for (;;) {
      const where: Prisma.LeaguePlayerWhereInput = cursor
        ? { leagueId: league.id, id: { gt: cursor } }
        : { leagueId: league.id }
      const rows = await readWithRetry('LeaguePlayer', () =>
        prisma.leaguePlayer.findMany({
          where,
          orderBy: { id: 'asc' },
          take: READ_CHUNK,
          select: {
            id: true, playerId: true, rating: true, baseRating: true, internalRating: true,
            activityPenalty: true, lastRatedAt: true, win: true, lose: true, kill: true,
            death: true, assist: true, placement: true, placementPlayed: true, clanId: true,
          },
        }),
      )
      if (rows.length === 0) break
      for (const r of rows) {
        await emit('leaguePlayer', { ...r, lastRatedAt: r.lastRatedAt?.toISOString() ?? null })
        written.leaguePlayers += 1
      }
      cursor = rows[rows.length - 1]!.id
      if (rows.length < READ_CHUNK) break
    }

    /* ── LeagueClan */
    cursor = null
    for (;;) {
      const where: Prisma.LeagueClanWhereInput = cursor
        ? { leagueId: league.id, id: { gt: cursor } }
        : { leagueId: league.id }
      const rows = await readWithRetry('LeagueClan', () =>
        prisma.leagueClan.findMany({
          where,
          orderBy: { id: 'asc' },
          take: READ_CHUNK,
          select: {
            id: true, rating: true, internalRating: true, compositionScore: true,
            activityPenalty: true, lastRatedAt: true, win: true, lose: true,
            placement: true, placementPlayed: true,
          },
        }),
      )
      if (rows.length === 0) break
      for (const r of rows) {
        await emit('leagueClan', { ...r, lastRatedAt: r.lastRatedAt?.toISOString() ?? null })
        written.leagueClans += 1
      }
      cursor = rows[rows.length - 1]!.id
      if (rows.length < READ_CHUNK) break
    }

    /* ── MatchPlayerStat — 복합 기본키라 커서 모양이 다르다 */
    let statCursor: { matchId: string; playerId: string } | null = null
    for (;;) {
      /* 복합 기본키 키셋 — (matchId, playerId) 가 마지막 줄보다 뒤인 것만 */
      const where: Prisma.MatchPlayerStatWhereInput = statCursor
        ? {
            match: { leagueId: league.id },
            OR: [
              { matchId: { gt: statCursor.matchId } },
              { matchId: statCursor.matchId, playerId: { gt: statCursor.playerId } },
            ],
          }
        : statWhere
      const rows = await readWithRetry('MatchPlayerStat', () =>
        prisma.matchPlayerStat.findMany({
          where,
          orderBy: [{ matchId: 'asc' }, { playerId: 'asc' }],
          take: READ_CHUNK,
          select: {
            matchId: true, playerId: true, ratingBefore: true, ratingUpdate: true,
            ratingAfter: true, opponentAvgRating: true, kUsed: true, multiplierUsed: true,
            isPlacement: true, participantRole: true, formulaVersion: true,
          },
        }),
      )
      if (rows.length === 0) break
      for (const r of rows) {
        await emit('matchPlayerStat', r)
        written.matchPlayerStats += 1
      }
      const last = rows[rows.length - 1]!
      statCursor = { matchId: last.matchId, playerId: last.playerId }
      if (rows.length < READ_CHUNK) break
      log(`  MatchPlayerStat ${written.matchPlayerStats}/${matchPlayerStats}`)
    }

    /* ── Match */
    cursor = null
    for (;;) {
      const where: Prisma.MatchWhereInput = cursor
        ? { leagueId: league.id, id: { gt: cursor } }
        : matchWhere
      const rows = await readWithRetry('Match', () =>
        prisma.match.findMany({
          where,
          orderBy: { id: 'asc' },
          take: READ_CHUNK,
          select: {
            id: true, redRatingBefore: true, blueRatingBefore: true,
            redRatingUpdate: true, blueRatingUpdate: true,
            redPlacement: true, bluePlacement: true,
          },
        }),
      )
      if (rows.length === 0) break
      for (const r of rows) {
        await emit('match', r)
        written.matches += 1
      }
      cursor = rows[rows.length - 1]!.id
      if (rows.length < READ_CHUNK) break
    }

    const checksum = hash.digest('hex').slice(0, 32)
    /* 꼬리글에 **실제로 쓴 줄 수**를 함께 적는다. 복원은 이것과 대조한다 —
       머리글의 예고가 아니라 이쪽이 정본이다 (위 형식 설명 참조) */
    await writeLine(stream, JSON.stringify({ kind: 'footer', checksum, counts: written }) + '\n')
    await new Promise<void>((resolve, reject) => {
      stream.end((): void => resolve())
      stream.once('error', reject)
    })

    /* 예고와 실제가 어긋나는 것은 **정상일 수 있다** — 백업이 도는 동안 경기가 들어온다.
       실패로 치지 않는다. 다만 조용히 넘기지도 않는다: 얼마나 움직였는지 적어 둔다.
       크게 줄었다면(행이 지워졌다면) 사람이 보고 판단할 자리다 */
    const drift = (['leaguePlayers', 'leagueClans', 'matchPlayerStats', 'matches'] as const)
      .filter((k) => written[k] !== header.counts[k])
      .map((k) => k + ' 예고 ' + header.counts[k] + ' → 실제 ' + written[k])
    if (drift.length > 0) {
      warn('백업 도중 행 수가 움직였다 (경기가 계속 들어온다) — ' + drift.join(' · '))
    }

    log(
      '백업 완료 (v2 스트리밍) — ' + path + '\n' +
        '  LeaguePlayer ' + written.leaguePlayers + ' · LeagueClan ' + written.leagueClans +
        ' · MatchPlayerStat ' + written.matchPlayerStats + ' · Match ' + written.matches + '\n' +
        '  checksum ' + checksum,
    )
    return { path, header: { ...header, counts: { ...written } }, checksum }
  } catch (error) {
    stream.destroy()
    throw error
  }
}

/**
 * v2(JSONL) 백업으로 되돌린다.
 *
 * **두 번 읽는다.** 첫 번째는 검증만 한다 — 체크섬과 줄 수를 세고, 어긋나면
 * **한 줄도 쓰지 않고** 거부한다. 통짜 파일을 메모리에 올리지 않으려고 스트리밍을
 * 쓰는 것이므로, 「읽으면서 바로 쓴다」로 하면 중간에 손상이 발견됐을 때
 * 이미 절반이 들어가 있게 된다. 그것이 v1 보다 나쁜 상태다.
 */
export async function restoreRatingSnapshotStream(input: {
  path: string
  dryRun: boolean
}): Promise<{
  restored: { leaguePlayers: number; leagueClans: number; stats: number; matches: number }
}> {
  /* ── 1회차: 검증만 한다 */
  let header: RatingSnapshotStreamHeader | null = null
  let footerChecksum: string | null = null
  let footerCounts: Counts | null = null
  const hash = createHash('sha256')
  const seen = { leaguePlayers: 0, leagueClans: 0, matchPlayerStats: 0, matches: 0 }
  {
    const rl = createInterface({
      input: createReadStream(input.path, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    })
    for await (const line of rl) {
      if (line.trim() === '') continue
      const parsed = JSON.parse(line) as { kind: string }
      if (parsed.kind === 'header') {
        header = parsed as unknown as RatingSnapshotStreamHeader
        continue
      }
      if (parsed.kind === 'footer') {
        const footer = parsed as unknown as { checksum: string; counts?: Counts }
        footerChecksum = footer.checksum
        footerCounts = footer.counts ?? null
        continue
      }
      /* 쓸 때와 **같은 바이트**를 흘려야 한다 — 줄 끝의 개행까지 포함이다 */
      hash.update(line + '\n')
      if (parsed.kind === 'leaguePlayer') seen.leaguePlayers += 1
      else if (parsed.kind === 'leagueClan') seen.leagueClans += 1
      else if (parsed.kind === 'matchPlayerStat') seen.matchPlayerStats += 1
      else if (parsed.kind === 'match') seen.matches += 1
      else throw new Error('모르는 레코드 종류: ' + parsed.kind)
    }
  }
  if (!header) throw new Error('백업 파일에 머리글이 없다')
  const head: RatingSnapshotStreamHeader = header
  if (head.version !== RATING_SNAPSHOT_STREAM_VERSION) {
    throw new Error('모르는 백업 형식 버전: ' + String(head.version))
  }
  if (!footerChecksum) throw new Error('백업 파일이 끝까지 쓰이지 않았다 — 꼬리글이 없다')
  const checksum = hash.digest('hex').slice(0, 32)
  if (checksum !== footerChecksum) {
    throw new Error('백업 파일이 손상됐다 — checksum 불일치 (' + checksum + ' != ' + footerChecksum + ')')
  }
  /* 대조 상대는 **꼬리글**이다. 머리글은 시작할 때의 예고라, 백업이 도는 동안
     들어온 경기만큼 어긋나는 것이 정상이다 (쓰는 쪽 주석 참조).
     꼬리글에 수가 없으면 이 칸을 넣기 전에 뜬 파일이다 — 그때만 머리글로 대조한다 */
  const authority: Counts = footerCounts ?? head.counts
  const missing = (['leaguePlayers', 'leagueClans', 'matchPlayerStats', 'matches'] as const).filter(
    (k) => seen[k] !== authority[k],
  )
  if (missing.length > 0) {
    throw new Error(
      '백업 파일의 줄 수가 기록된 수와 다르다 — ' +
        missing.map((k) => k + ' 기록 ' + authority[k] + ' 실제 ' + seen[k]).join(' · '),
    )
  }

  const restored = { leaguePlayers: 0, leagueClans: 0, stats: 0, matches: 0 }
  if (input.dryRun) {
    log(
      '[dry-run] 복원 대상 — LeaguePlayer ' + seen.leaguePlayers + ' · LeagueClan ' + seen.leagueClans +
        ' · MatchPlayerStat ' + seen.matchPlayerStats + ' · Match ' + seen.matches +
        '. checksum 확인됨. 아무것도 쓰지 않았다',
    )
    return { restored }
  }

  /* ── 2회차: 검증을 통과했으니 이제 쓴다 */
  const rl2 = createInterface({
    input: createReadStream(input.path, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })
  for await (const line of rl2) {
    if (line.trim() === '') continue
    const rec = JSON.parse(line) as { kind: string; row: unknown }
    if (rec.kind === 'leaguePlayer') {
      const row = rec.row as RatingSnapshot['leaguePlayers'][number]
      await prisma.leaguePlayer.update({
        where: { id: row.id },
        data: {
          rating: row.rating,
          baseRating: row.baseRating,
          internalRating: row.internalRating,
          activityPenalty: row.activityPenalty,
          lastRatedAt: row.lastRatedAt ? new Date(row.lastRatedAt) : null,
          win: row.win,
          lose: row.lose,
          kill: row.kill,
          death: row.death,
          assist: row.assist,
          placement: row.placement,
          placementPlayed: row.placementPlayed,
        },
      })
      restored.leaguePlayers += 1
    } else if (rec.kind === 'leagueClan') {
      const row = rec.row as RatingSnapshot['leagueClans'][number]
      await prisma.leagueClan.update({
        where: { id: row.id },
        data: {
          rating: row.rating,
          internalRating: row.internalRating,
          compositionScore: row.compositionScore,
          activityPenalty: row.activityPenalty,
          lastRatedAt: row.lastRatedAt ? new Date(row.lastRatedAt) : null,
          win: row.win,
          lose: row.lose,
          placement: row.placement,
          placementPlayed: row.placementPlayed,
        },
      })
      restored.leagueClans += 1
    } else if (rec.kind === 'matchPlayerStat') {
      const row = rec.row as RatingSnapshot['matchPlayerStats'][number]
      await prisma.matchPlayerStat.update({
        where: { matchId_playerId: { matchId: row.matchId, playerId: row.playerId } },
        data: {
          ratingBefore: row.ratingBefore,
          ratingUpdate: row.ratingUpdate,
          ratingAfter: row.ratingAfter,
          opponentAvgRating: row.opponentAvgRating,
          kUsed: row.kUsed,
          multiplierUsed: row.multiplierUsed,
          isPlacement: row.isPlacement,
          participantRole: row.participantRole,
          formulaVersion: row.formulaVersion,
        },
      })
      restored.stats += 1
      if (restored.stats % 50000 === 0) {
        log('  MatchPlayerStat ' + restored.stats + '/' + seen.matchPlayerStats)
      }
    } else if (rec.kind === 'match') {
      const row = rec.row as RatingSnapshot['matches'][number]
      await prisma.match.update({
        where: { id: row.id },
        data: {
          redRatingBefore: row.redRatingBefore,
          blueRatingBefore: row.blueRatingBefore,
          redRatingUpdate: row.redRatingUpdate,
          blueRatingUpdate: row.blueRatingUpdate,
          redPlacement: row.redPlacement,
          bluePlacement: row.bluePlacement,
        },
      })
      restored.matches += 1
    }
  }

  log(
    '복원 완료 (v2) — LeaguePlayer ' + restored.leaguePlayers + ' · LeagueClan ' + restored.leagueClans +
      ' · MatchPlayerStat ' + restored.stats + ' · Match ' + restored.matches,
  )
  return { restored }
}

/**
 * 파일을 열어 보고 v1(통짜 JSON) / v2(JSONL) 를 가른다.
 *
 * 첫 줄만 읽어서 판정한다 — v2 는 머리글 한 줄이 통째로 파싱되고 `kind:"header"` 가 있다.
 * v1 은 첫 줄이 여는 중괄호 하나뿐이라 파싱에 실패한다. 확장자를 믿지 않는 이유는
 * 사람이 파일 이름을 바꿔 두는 일이 실제로 있기 때문이다.
 */
export async function restoreRatingSnapshotAuto(input: {
  path: string
  dryRun: boolean
}): Promise<{
  restored: { leaguePlayers: number; leagueClans: number; stats: number; matches: number }
}> {
  const rl = createInterface({
    input: createReadStream(input.path, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })
  let first = ''
  for await (const line of rl) {
    first = line
    break
  }
  rl.close()
  let isStream: boolean
  try {
    isStream = (JSON.parse(first) as { kind?: string }).kind === 'header'
  } catch {
    /* 첫 줄이 통째로 파싱되지 않으면 v1 이다 — v1 은 첫 줄이 여는 중괄호 하나뿐이다 */
    isStream = false
  }
  if (isStream) return restoreRatingSnapshotStream(input)

  /* `season0Apply` 가 뜨는 백업은 **이 잡의 형식이 아니다.**
     쓰는 표가 다르고(MatchPlayerStat·Match 를 안 담는다) checksum 범위도 다르다.
     그대로 v1 로 읽으면 「손상됐다」는 엉뚱한 말이 나와서, 사람이 멀쩡한 백업을
     버리게 된다. 형식을 알아보고 되돌리는 길을 알려 준다 */
  const peek = (await readFile(input.path, 'utf8')).slice(0, 400)
  if (peek.includes('season0Apply-writable-tables')) {
    throw new Error(
      'season0Apply 백업 파일이다 — rating-restore 로는 되돌릴 수 없다.' +
        ' 다음을 써라: pnpm --filter @sacloud/worker exec tsx src/jobs/season0Apply.ts --revert ' +
        input.path,
    )
  }

  log('v1(통짜 JSON) 백업으로 판정했다 — 파일을 통째로 읽는다')
  return restoreRatingSnapshot(input)
}
