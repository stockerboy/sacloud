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
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { prisma } from '@sacloud/db'
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
