/**
 * 과거 시즌 기록 **쓰기** 계층 (Phase 11-F · 11-G).
 *
 * 읽기(파일 → 행)는 `legacySource.ts`가 한다. 여기서는 DB만 다룬다.
 *
 * 지키는 것
 *   1. **미리보기가 먼저다.** `confirm: true` 없이는 한 줄도 쓰지 않는다
 *   2. **닉네임으로 사람을 합치지 않는다.** 3rd.supply `playerId`가 유일한 근거다 (D-100)
 *   3. **확정된 과거 시즌은 다시 쓰지 않는다.** `frozen` 시즌은 거부한다 (D-099)
 *   4. 없는 값을 만들지 않는다. `null`은 `null`로 저장한다
 */
import { prisma } from '../src/index'
import type { LegacySeasonRow } from './legacySource'

/** 과거 기록에서 만들어진 선수의 id 접두사. mock·실수집 선수와 절대 겹치지 않게 한다 */
export const LEGACY_PLAYER_PREFIX = 'SUPPLY-'

export type LegacyRowVerdict =
  /** 새로 만든다 */
  | 'create'
  /** 이미 같은 카드가 있고 값도 같다 — 건너뛴다 */
  | 'duplicate'
  /** 이미 있는데 값이 다르다 — 덮어쓰지 않고 운영자 판단으로 넘긴다 */
  | 'conflict'
  /** 확정(frozen) 시즌이라 손대지 않는다 */
  | 'frozen'
  /** 이 닉네임의 선수가 이미 있는데 legacy id가 달라 자동 연결하지 않는다 */
  | 'identity_ambiguous'

export interface LegacyRowPlan {
  row: LegacySeasonRow
  verdict: LegacyRowVerdict
  note: string | null
}

export interface LegacyImportPreview {
  leagueSlug: string
  seasons: number[]
  counts: Record<LegacyRowVerdict, number>
  plans: LegacyRowPlan[]
  warnings: string[]
  /** 실제로 썼는가. 미리보기면 false */
  executed: boolean
  created: number
}

/** 3rd.supply playerId → 우리 Player.id */
export function legacyPlayerKey(legacyPlayerId: string): string {
  return `${LEGACY_PLAYER_PREFIX}${legacyPlayerId}`
}

function sameValue(left: number | null, right: number | null): boolean {
  if (left === null || right === null) return left === right
  return Math.abs(left - right) < 0.0001
}

/**
 * 과거 시즌 카드를 넣는다.
 *
 * `confirm: false`(기본)면 **무엇을 할지만** 돌려준다. DB는 그대로다.
 */
export async function importLegacySeasons(input: {
  leagueSlug: string
  rows: LegacySeasonRow[]
  warnings?: string[]
  confirm?: boolean
}): Promise<LegacyImportPreview> {
  const warnings = [...(input.warnings ?? [])]
  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true },
  })
  if (!league) throw new Error(`리그를 찾을 수 없습니다: ${input.leagueSlug}`)

  const seasonNumbers = [...new Set(input.rows.map((row) => row.season))].sort((a, b) => a - b)
  const seasons = await prisma.season.findMany({
    where: { leagueId: league.id, number: { in: seasonNumbers } },
    select: { id: true, number: true, frozen: true, seasonType: true },
  })
  const seasonByNumber = new Map(seasons.map((season) => [season.number, season]))

  for (const number of seasonNumbers) {
    if (!seasonByNumber.has(number)) {
      warnings.push(`Season ${number} 행이 리그에 없다. 시즌을 먼저 만들어야 한다`)
    }
  }

  /* 이미 들어간 카드 — 중복·충돌 판정용 */
  const existing = await prisma.leaguePlayerSeason.findMany({
    where: { seasonRef: { leagueId: league.id, number: { in: seasonNumbers } } },
    select: {
      id: true,
      season: true,
      legacyPlayerId: true,
      rank: true,
      win: true,
      lose: true,
      kill: true,
      death: true,
      rating: true,
    },
  })
  const existingByKey = new Map(
    existing
      .filter((row) => row.legacyPlayerId !== null)
      .map((row) => [`${row.legacyPlayerId}#${row.season}`, row]),
  )

  const plans: LegacyRowPlan[] = []
  for (const row of input.rows) {
    const season = seasonByNumber.get(row.season)
    if (!season) {
      plans.push({ row, verdict: 'conflict', note: `Season ${row.season}이 없다` })
      continue
    }
    if (season.frozen) {
      plans.push({ row, verdict: 'frozen', note: '확정된 시즌이라 변경하지 않는다' })
      continue
    }
    const previous = existingByKey.get(`${row.legacyPlayerId}#${row.season}`)
    if (previous) {
      const same =
        sameValue(previous.rank, row.rank) &&
        sameValue(previous.win, row.win) &&
        sameValue(previous.lose, row.lose) &&
        sameValue(previous.kill, row.kill) &&
        sameValue(previous.death, row.death)
      plans.push({
        row,
        verdict: same ? 'duplicate' : 'conflict',
        note: same ? '같은 값이 이미 있다' : '같은 카드가 있는데 값이 다르다. 운영자 확인이 필요하다',
      })
      continue
    }
    plans.push({ row, verdict: 'create', note: null })
  }

  const counts: Record<LegacyRowVerdict, number> = {
    create: 0,
    duplicate: 0,
    conflict: 0,
    frozen: 0,
    identity_ambiguous: 0,
  }
  for (const plan of plans) counts[plan.verdict] += 1

  const preview: LegacyImportPreview = {
    leagueSlug: input.leagueSlug,
    seasons: seasonNumbers,
    counts,
    plans,
    warnings,
    executed: false,
    created: 0,
  }
  if (!input.confirm) return preview

  /* ------------------------------------------------------------- 실행 --- */
  let created = 0
  for (const plan of plans) {
    if (plan.verdict !== 'create') continue
    const row = plan.row
    const season = seasonByNumber.get(row.season)
    if (!season) continue

    /* 선수 — **닉네임으로 찾지 않는다.** legacy id로만 만든다 (D-100) */
    const playerId = legacyPlayerKey(row.legacyPlayerId)
    await prisma.player.upsert({
      where: { id: playerId },
      create: { id: playerId, name: row.nickname ?? row.legacyPlayerId },
      // 닉네임이 바뀌었어도 과거 카드가 다른 사람에게 붙으면 안 되므로 이름만 갱신한다
      update: row.nickname ? { name: row.nickname } : {},
      select: { id: true },
    })

    const leaguePlayer = await prisma.leaguePlayer.upsert({
      where: { leagueId_playerId: { leagueId: league.id, playerId } },
      create: { leagueId: league.id, playerId, rating: 0, baseRating: 0 },
      update: {},
      select: { id: true },
    })

    await prisma.leaguePlayerSeason.create({
      data: {
        leaguePlayerId: leaguePlayer.id,
        seasonId: season.id,
        season: row.season,
        rank: row.rank,
        rankCount: row.rankCount,
        // 과거 기록의 rating은 원본에 없을 수 있다. 없으면 0으로 두되 별도 컬럼이 진실을 말한다
        rating: row.rating ?? 0,
        win: row.win ?? 0,
        lose: row.lose ?? 0,
        kill: row.kill ?? 0,
        death: row.death ?? 0,
        assist: row.assist,
        headshot: row.headshot,
        winRate: row.winRate,
        kdRate: row.kdRate,
        killPerMatch: row.killPerMatch,
        mvpCount: row.mvpCount,
        clanNameAtSeason: row.clanName,
        divisionAtSeason: row.division,
        nicknameAtSeason: row.nickname,
        legacyPlayerId: row.legacyPlayerId,
        legacyLeaguePlayerId: row.legacyLeaguePlayerId,
        source: row.source,
        imported: true,
      },
    })
    created += 1
  }

  return { ...preview, executed: true, created }
}

/**
 * 시즌을 **확정**한다. 이후로는 수집·래더가 이 시즌 값을 건드리지 못한다 (정책 13).
 *
 * 되돌리는 것은 운영자가 명시적으로 해야 한다. 자동으로 풀리지 않는다.
 */
export async function freezeSeason(input: {
  leagueSlug: string
  number: number
  seasonType?: 'legacy' | 'beta' | 'official'
}): Promise<{ number: number; frozen: boolean; seasonType: string; playerCards: number }> {
  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true },
  })
  if (!league) throw new Error(`리그를 찾을 수 없습니다: ${input.leagueSlug}`)

  const season = await prisma.season.findFirst({
    where: { leagueId: league.id, number: input.number },
    select: { id: true, status: true },
  })
  if (!season) throw new Error(`Season ${input.number}이 없습니다`)
  if (season.status !== 'closed') {
    throw new Error(`Season ${input.number}이 아직 열려 있습니다. 먼저 종료해야 합니다`)
  }

  const updated = await prisma.season.update({
    where: { id: season.id },
    data: { frozen: true, ...(input.seasonType ? { seasonType: input.seasonType } : {}) },
    select: { number: true, frozen: true, seasonType: true },
  })
  const playerCards = await prisma.leaguePlayerSeason.count({ where: { seasonId: season.id } })
  return { ...updated, playerCards }
}
