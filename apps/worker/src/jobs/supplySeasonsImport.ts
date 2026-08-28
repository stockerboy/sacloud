/**
 * 3rd.supply 지난시즌 카드 수집 파일 → 우리 DB (D-159).
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
  seasonsCreated: number
  rowsCreated: number
  rowsUpdated: number
  /** 우리가 계산한 카드가 이미 있어 건드리지 않은 자리 */
  rowsSkippedOurs: number
  /** `sourceLeaguePlayerId` 를 새로 채운 LeaguePlayer 수 */
  sourceIdsFilled: number
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

  /* ── 1. 파일을 흘려 읽는다. 마지막 줄이 이긴다 (재수집분이 우선) */
  const byPlayer = new Map<string, SupplySeasonRecord>()
  await readJsonl<SupplySeasonRecord>(file, (record) => {
    if (record.league_slug !== leagueSlug) return
    byPlayer.set(record.player_id, record)
  })

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
    for (const row of record.raw) seasonNumbers.add(row.season)
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
    seasonsCreated: 0,
    rowsCreated: 0,
    rowsUpdated: 0,
    rowsSkippedOurs: 0,
    sourceIdsFilled: 0,
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
    if (missing.length > 0) log(`  새로 만들 시즌: ${missing.join(', ')} (seasonType=legacy)`)
    return result
  }

  for (const number of missing) {
    const created = await prisma.season.create({
      data: {
        leagueId: league.id,
        number,
        startedAt: legacySeasonStartedAt(number),
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
      const seasonId = seasonIdOf.get(row.season)
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

  return result
}
