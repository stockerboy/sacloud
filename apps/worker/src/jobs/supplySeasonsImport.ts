/**
 * 3rd.supply 지난시즌 카드 수집 파일 → 우리 DB (D-166).
 *
 * **네트워크를 쓰지 않는다.** 입력은 `supply-seasons` 가 쌓아 둔 `.seasons.jsonl` 뿐이다.
 *
 * ── 지키는 것
 *   - 원본이 준 값을 **그대로** 넣는다. 승률에서 승패를 되만들지 않고,
 *     승패에서 승률을 다시 계산하지도 않는다 (3-A 2번 · 3-B 5번 · D-099).
 *   - 원본 id 를 버리지 않는다 — `legacyPlayerId`(player id) ·
 *     `legacyLeaguePlayerId`(league_player id) 를 남긴다 (3-A 3번).
 *   - **우리가 계산한 카드를 덮어쓰지 않는다.** 같은 (선수, 시즌) 자리에
 *     `imported = false` 인 행이 이미 있으면 건드리지 않고 세어서 보고한다.
 *   - `--confirm` 없이는 **한 줄도 쓰지 않는다.**
 *   - 로컬 개발 DB 가 아니면 거부한다. 운영 반영은 사람이 한다.
 *
 * ── 시즌 행(`Season`)
 *   과거 시즌의 **실제 시작·종료 날짜는 원본이 주지 않는다** `[미확인]`.
 *   `Season.startedAt` 은 NOT NULL 이고 화면 정렬이 이 값을 쓴다(D-098).
 *   그래서 **명백히 합성값인** 고정 기준점을 쓴다 — `2000-01-01 + (N-1)년`.
 *   추측한 날짜처럼 보이지 않게 하려고 일부러 현실과 먼 값을 골랐다.
 *   순서(1 → 6 → 현재)만 맞으면 화면은 정확하고, 날짜는 어디에도 표시되지 않는다.
 */
import { prisma } from '@sacloud/db'
/* ★근본 시즌★ — 원본 시즌 번호를 우리 내부 번호로 옮긴다 (2026-09-04 · Part 1) */
import { ROOT_SEASON_LABEL, rootSeasonNumber, sourceSeasonNumber } from '@sacloud/contract'
import { readJsonl } from '../lib/jsonlStore.js'
import { log, warn } from '../lib/log.js'
import type { SupplySeasonRecord, SupplySeasonRow } from './supplySeasons.js'

/**
 * 과거 시즌의 합성 시작 시각. **실제 날짜가 아니다** `[미확인]`.
 * 정렬 순서만을 위한 값이라 현실에서 멀리 떨어진 기준점을 쓴다.
 */
export function legacySeasonStartedAt(seasonNumber: number): Date {
  return new Date(Date.UTC(2000 + (seasonNumber - 1), 0, 1))
}

function assertLocalDatabase(): void {
  if (process.env['SACLOUD_ALLOW_REMOTE_WRITE'] === 'yes') return
  const url = process.env['DATABASE_URL'] ?? ''
  if (/@(127\.0\.0\.1|localhost)[:/]/.test(url)) return
  throw new Error(
    '중단한다 — DATABASE_URL 이 로컬 개발 DB 가 아니다. ' +
      '운영 반영은 사람이 한다. 의도한 것이면 SACLOUD_ALLOW_REMOTE_WRITE=yes 를 넣어라.',
  )
}

export interface SupplySeasonsImportResult {
  leagueSlug: string
  file: string
  confirm: boolean
  /** 파일에서 읽은 선수 수 / 시즌 줄 수 */
  readPlayers: number
  readRows: number
  /** 시즌별 줄 수 (원본 그대로) */
  bySeason: Record<number, number>
  /** 우리 DB 의 LeaguePlayer 와 이어진 선수 수 */
  matchedPlayers: number
  /** 원본에는 있는데 우리 DB 에 없는 선수 (추측해 만들지 않는다) */
  unknownPlayers: number
  /**
   * ★다른 리그의 카드가 파일에 섞여 있던 줄 수★ (2026-09-04 · Part 1).
   *
   * 전에는 그런 줄을 ★조용히 건너뛰었다.★ 건너뛰는 것 자체는 맞지만,
   * ★몇 줄을 건너뛰었는지 아무도 몰랐다★ — 0건인지 5,000건인지 구별할 수 없었다.
   * 사장님 완료 조건이 「★서플라이공식리그가 아닌 카드 0건★」이라 ★세어야 답할 수 있다.★
   */
  foreignLeagueRows: number
  /** 파일에서 본 리그 slug 들 — 하나여야 한다 */
  seenLeagueSlugs: string[]
  seasonsCreated: number
  rowsCreated: number
  rowsUpdated: number
  /** 우리가 계산한 카드가 이미 있어 건드리지 않은 자리 */
  rowsSkippedOurs: number
  /** `sourceLeaguePlayerId` 를 새로 채운 LeaguePlayer 수 */
  sourceIdsFilled: number
  /* ── 숫자 대조 (3-A 6번). "적재 완료" 로그가 아니라 이 값으로 판정한다.
     실행 끝에 DB 를 다시 세어 담는다 — 미리보기로 다시 돌리면 그대로 검증이 된다 */
  dbRows: number
  dbRowsBySeason: Record<number, number>
  /** 파일 줄 수와 DB 행 수가 시즌별로 전부 같은가 */
  reconciled: boolean
}

/** 원본 값을 그대로 옮긴다. 없는 값은 `null` 이다 — 0 으로 만들지 않는다 */
function toRow(row: SupplySeasonRow): {
  rank: number | null
  rankCount: number | null
  win: number | null
  lose: number | null
  kill: number | null
  death: number | null
  winRate: number | null
  kdRate: number | null
} {
  return {
    rank: row.rank ?? null,
    rankCount: row.rank_count ?? null,
    win: row.win ?? null,
    lose: row.lose ?? null,
    kill: row.kill ?? null,
    death: row.death ?? null,
    winRate: row.win_rate ?? null,
    kdRate: row.kd_rate ?? null,
  }
}

export async function runSupplySeasonsImport(input: {
  file: string
  leagueSlug: string
  confirm: boolean
  limit?: number | null
}): Promise<SupplySeasonsImportResult> {
  const { file, leagueSlug, confirm } = input
  if (confirm) assertLocalDatabase()

  const league = await prisma.league.findUnique({
    where: { slug: leagueSlug },
    select: { id: true, name: true },
  })
  if (!league) throw new Error(`리그를 찾을 수 없다: ${leagueSlug}`)

  /* ── 1. 파일을 흘려 읽는다. 마지막 줄이 이긴다 (재수집분이 우선)
     ⚠ ★다른 리그 줄은 세고 나서 버린다★ (2026-09-04 · Part 1).
       조용히 버리면 「0건이라 안 섞였다」와 「많이 버려서 안 섞였다」를 구별할 수 없다 */
  const byPlayer = new Map<string, SupplySeasonRecord>()
  let foreignLeagueRows = 0
  const seenLeagueSlugs = new Set<string>()
  await readJsonl<SupplySeasonRecord>(file, (record) => {
    seenLeagueSlugs.add(record.league_slug)
    if (record.league_slug !== leagueSlug) {
      foreignLeagueRows += 1
      return
    }
    byPlayer.set(record.player_id, record)
  })

  /* ★섞인 파일이면 아예 시작하지 않는다★ — 골라내는 것이 아니라 멈춘다.
     이 파일은 리그마다 따로 만들어지므로, 섞였다면 ★잘못된 파일을 넘긴 것★ 이다.
     그때 「알아서 골라 넣었다」고 하면 다음 사람이 그 사실을 모른 채 믿는다 */
  if (foreignLeagueRows > 0) {
    throw new Error(
      `파일에 다른 리그 카드가 ${foreignLeagueRows}줄 섞여 있다 ` +
        `(본 slug: ${[...seenLeagueSlugs].join(', ')} · 목표: ${leagueSlug}). ` +
        '파일을 잘못 넘긴 것이다 — 골라 넣지 않고 멈춘다',
    )
  }

  const bySeason: Record<number, number> = {}
  let readRows = 0
  for (const record of byPlayer.values()) {
    for (const row of record.raw) {
      readRows += 1
      bySeason[row.season] = (bySeason[row.season] ?? 0) + 1
    }
  }

  /* ── 2. 우리 DB 의 LeaguePlayer 와 잇는다 (sourcePlayerId 기준) */
  const players = await prisma.leaguePlayer.findMany({
    where: { leagueId: league.id, player: { sourcePlayerId: { not: null } } },
    select: { id: true, sourceLeaguePlayerId: true, player: { select: { sourcePlayerId: true } } },
  })
  const leaguePlayerOf = new Map<string, { id: string; sourceLeaguePlayerId: string | null }>()
  for (const p of players) {
    const key = p.player.sourcePlayerId
    if (key) leaguePlayerOf.set(key, { id: p.id, sourceLeaguePlayerId: p.sourceLeaguePlayerId })
  }

  let matchedPlayers = 0
  let unknownPlayers = 0
  const seasonNumbers = new Set<number>()
  for (const [playerId, record] of byPlayer) {
    if (leaguePlayerOf.has(playerId)) matchedPlayers += 1
    else unknownPlayers += 1
    /* ★원본 시즌 번호를 그대로 쓰지 않는다★ — 우리 시즌1(10/1)과 부딪힌다.
       `-100 - N` 로 옮겨 담는다. 화면에는 `근본 시즌` 으로만 보인다 */
    for (const row of record.raw) seasonNumbers.add(rootSeasonNumber(row.season))
  }

  const result: SupplySeasonsImportResult = {
    leagueSlug,
    file,
    confirm,
    readPlayers: byPlayer.size,
    readRows,
    bySeason,
    matchedPlayers,
    unknownPlayers,
    foreignLeagueRows,
    seenLeagueSlugs: [...seenLeagueSlugs],
    seasonsCreated: 0,
    rowsCreated: 0,
    rowsUpdated: 0,
    rowsSkippedOurs: 0,
    sourceIdsFilled: 0,
    dbRows: 0,
    dbRowsBySeason: {},
    reconciled: false,
  }

  /* ── 3. Season 행 확보 */
  const existing = await prisma.season.findMany({
    where: { leagueId: league.id },
    select: { id: true, number: true, seasonType: true },
  })
  const seasonIdOf = new Map<number, string>(existing.map((s) => [s.number, s.id]))
  const missing = [...seasonNumbers].filter((n) => !seasonIdOf.has(n)).sort((a, b) => a - b)
  result.seasonsCreated = missing.length

  if (!confirm) {
    log('미리보기다 — 한 줄도 쓰지 않았다. 반영하려면 --confirm 을 붙인다')
    if (missing.length > 0) {
      const shown = missing.map((n) => `${ROOT_SEASON_LABEL}(원본 시즌 ${sourceSeasonNumber(n)} → 내부 ${n})`)
      log(`  새로 만들 시즌: ${shown.join(' · ')} (seasonType=legacy · frozen)`)
    }
    await reconcile(league.id, result)
    return result
  }

  for (const number of missing) {
    const created = await prisma.season.create({
      data: {
        leagueId: league.id,
        number,
        /* 정렬용 합성 시각. ★원본 시즌 번호★ 로 만들어야 1→6 순서가 맞다 —
           내부 번호(-101…-106)로 만들면 순서가 뒤집힌다 */
        startedAt: legacySeasonStartedAt(sourceSeasonNumber(number) ?? number),
        endedAt: null,
        status: 'closed',
        seasonType: 'legacy',
        imported: true,
        /* 확정된 과거 기록이다 — 수집·래더 재계산이 건드리지 못하게 잠근다 */
        frozen: true,
      },
      select: { id: true, number: true },
    })
    seasonIdOf.set(created.number, created.id)
  }

  /* ── 4. 카드 적재 */
  const skipLimit = input.limit ?? null
  let processed = 0
  for (const [playerId, record] of byPlayer) {
    if (skipLimit !== null && processed >= skipLimit) break
    const target = leaguePlayerOf.get(playerId)
    if (!target) continue
    processed += 1

    /* 원본 id 를 보존한다. `@@unique` 라 이미 다른 행이 쥐고 있으면 건드리지 않는다 */
    const sourceId = String(record.league_player_id)
    if (target.sourceLeaguePlayerId === null) {
      try {
        await prisma.leaguePlayer.update({
          where: { id: target.id },
          data: { sourceLeaguePlayerId: sourceId },
        })
        result.sourceIdsFilled += 1
      } catch {
        warn(`sourceLeaguePlayerId 충돌 — 건너뛴다 (player ${playerId} → ${sourceId})`)
      }
    }

    for (const row of record.raw) {
      const seasonId = seasonIdOf.get(rootSeasonNumber(row.season))
      if (!seasonId) continue
      const values = toRow(row)

      const found = await prisma.leaguePlayerSeason.findUnique({
        where: { leaguePlayerId_seasonId: { leaguePlayerId: target.id, seasonId } },
        select: { id: true, imported: true },
      })

      if (found && !found.imported) {
        /* 우리가 계산한 카드다. 이관 값으로 덮어쓰지 않는다 */
        result.rowsSkippedOurs += 1
        continue
      }

      const data = {
        season: row.season,
        ...values,
        /* 원본 카드에 없는 값이다. 만들지 않는다 (D-099) */
        rating: null,
        assist: null,
        headshot: null,
        killPerMatch: null,
        mvpCount: null,
        clanNameAtSeason: null,
        divisionAtSeason: null,
        nicknameAtSeason: null,
        legacyPlayerId: playerId,
        legacyLeaguePlayerId: String(record.league_player_id),
        source: '3rd.supply',
        /* ★어느 리그 카드인가 — 한 칸으로 남긴다★ (2026-09-04 · Part 1).
           `record.league_slug` 를 그대로 쓴다. 위에서 이미 목표 리그와 같은 것만 남았다 */
        sourceLeagueSlug: record.league_slug,
        /* 「언제 받은 자료인가」 — 적재 시각(createdAt)과 다른 질문이다 */
        sourceFetchedAt: record.fetched_at ? new Date(record.fetched_at) : null,
        imported: true,
      }

      if (found) {
        await prisma.leaguePlayerSeason.update({ where: { id: found.id }, data })
        result.rowsUpdated += 1
      } else {
        await prisma.leaguePlayerSeason.create({
          data: { leaguePlayerId: target.id, seasonId, ...data },
        })
        result.rowsCreated += 1
      }
    }
  }

  await reconcile(league.id, result)
  return result
}

/**
 * 숫자 대조 — DB 를 **다시 세어서** 파일과 맞는지 본다 (3-A 6번).
 *
 * 이관 행(`source = '3rd.supply'`)만 센다. 우리가 계산한 카드는 대조 대상이 아니다.
 * `--confirm` 없이 다시 돌리면 이 대조만 수행된다.
 */
async function reconcile(leagueId: string, result: SupplySeasonsImportResult): Promise<void> {
  const rows = await prisma.leaguePlayerSeason.groupBy({
    by: ['season'],
    where: { source: '3rd.supply', leaguePlayer: { leagueId } },
    _count: { _all: true },
  })
  const bySeason: Record<number, number> = {}
  let total = 0
  for (const row of rows) {
    bySeason[row.season] = row._count._all
    total += row._count._all
  }
  result.dbRows = total
  result.dbRowsBySeason = bySeason

  const seasons = new Set([
    ...Object.keys(result.bySeason).map(Number),
    ...Object.keys(bySeason).map(Number),
  ])
  result.reconciled = [...seasons].every((s) => (result.bySeason[s] ?? 0) === (bySeason[s] ?? 0))
}
