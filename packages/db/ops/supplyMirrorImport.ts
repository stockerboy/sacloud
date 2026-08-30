/**
 * 3rd.supply 미러링 수집 파일 → 우리 DB (D-153).
 *
 * ── 무엇을 지키는가 (`CLAUDE.md` 3-A)
 *   1. **기본이 미리보기다.** `confirm` 이 없으면 한 줄도 쓰지 않는다.
 *      쓰지 않는 경로에서도 "무엇을 쓸 뻔했는지" 숫자가 똑같이 나온다 —
 *      계획을 메모리에서 세고 마지막에만 쓰기 때문이다.
 *   2. **idempotent.** 두 번 돌려도 결과가 같다. 이미 있는 경기는 **건너뛴다.**
 *      덮어쓰기는 하지 않는다. `updateSource` 를 켜도 **비어 있는 source 칸만** 채운다.
 *   3. **우리가 계산한 `ratingBefore` / `ratingUpdate` 를 건드리지 않는다** (3-A 2번).
 *      원본 점수는 `source*` 칸에만 넣는다.
 *   4. **원본 id 를 버리지 않는다** (3-A 3번). `sourceMatchId` · `sourceClanId` ·
 *      `sourcePlayerId` · `sourceLeagueClanId` 를 전부 남긴다.
 *   5. **실패를 삼키지 않는다** (3-A 6번). 못 넣은 경기는 사유별로 세어 돌려준다.
 *   6. 아무것도 지우지 않는다.
 *
 * ── 선수 신원 규칙 — `sourcePlayerId` 하나뿐이다
 *   기존 `supplyPlayerLink.ts` · `supplyLineupComplete.ts` 와 같은 원칙이다.
 *   **fuzzy 닉네임 매칭을 하지 않는다.** 닉네임이 같다고 같은 사람으로 묶지 않는다.
 *     1순위 `Player.sourcePlayerId` 가 이미 그 id 인 사람
 *     2순위 없으면 새 `Player` 를 만든다 (`origin='3rd.supply'` · id 는 `SUP-<원본id>`)
 *   그래서 넥슨 경로로 이미 들어와 있는 같은 사람과 **행이 갈릴 수 있다.** 그건 여기서
 *   추측으로 합치지 않고, 근거가 두꺼운 `nexon supply-players`(D-132)가 나중에 잇는다.
 *
 * ── 원본 점수·소속 컬럼에 대한 실측 경고 (2026-08-27)
 *   `sourceRating` 은 **원본 화면이 그 자리에 표시하는 값**이다. 경기 당시 값이 아니라
 *   **수집 시점의 현재 래더**다 — daerule 에서 한 선수의 162경기 distinct 값이 1개,
 *   sanply(11983경기)에서는 2967명 중 225명만 바뀌었는데 그건 수집이 몇 시간 도는
 *   동안 현재 래더가 움직인 것이다. 원본 화면 재현용으로만 쓴다.
 *   **래더 재현 입력으로 쓰면 안 된다.**
 *   `sourceRatingDelta`(증감)는 경기마다 달라 진짜 그 경기 값이다.
 *
 *   같은 이유로 참가자의 `clan` 도 **현재 소속**이다 (두 파일 3322명 중 경기별로
 *   소속이 달라진 사람 0명 — 3개월치라면 이적이 있어야 정상이다).
 *   그래서 `matchTimeClan*` 을 채우되 확신 등급을 `medium` 으로 남긴다.
 *   원본 화면이 그 경기 옆에 그 클랜을 보여 주므로 재현에는 필요하지만,
 *   "그 경기에 이 클랜이었다" 는 근거로는 약하다.
 */
import { prisma } from '../src/index'
import type { Prisma } from '../src/index'
import {
  IPL_ONLY_SKIP_REASON,
  loadIplOnlyMatchGuard,
  type IplOnlyMatchGuard,
} from './iplSanplyGuard'
import type { ParsedSupplyClan, ParsedSupplyMatch, ParsedSupplySource } from './supplyMirrorParse'

/**
 * 쓰기에 쓸 클라이언트.
 *
 * 트랜잭션 클라이언트를 넣을 수 있게 열어 둔다 — 그래야 **실제로 아무것도 남기지 않고**
 * 쓰기 경로 전체를 한 번 돌려 볼 수 있다 (검증용). 기본은 전역 클라이언트다.
 */
export type SupplyImportDb = Prisma.TransactionClient

/** 이 파이프라인이 만든 행의 출처 표시 */
export const SUPPLY_ORIGIN = '3rd.supply'
/** 소속 근거의 출처. `supply-lineup`(D-148)과 구분한다 — 이쪽은 KDA 도 함께 온다 */
export const SUPPLY_MATCH_TIME_SOURCE = 'supply-mirror'
/** 원본 점수를 우리 공식으로 덮어쓰지 않았다는 표시 (3-A 2번) */
export const SUPPLY_FORMULA_VERSION = '3rd.supply-imported'

/**
 * 경기 행의 기본키를 만든다 — **리그마다 다른 행**이다 (D-155).
 *
 * 같은 경기가 여러 리그에 기록돼야 하는데 `Match.id` 는 전역 기본키다.
 * 그래서 리그 slug 를 붙여 리그별로 다른 행이 되게 한다.
 * **실제 경기 번호는 `sourceMatchId` 에 그대로 남는다** — 원본 대조 키를 잃지 않는다 (3-A 3번).
 *
 * 이 도구가 예전에 넣은 행은 `id` 가 경기 번호 그 자체다. 그 행들은 **고치지 않는다.**
 * 중복 판정을 `(리그, sourceMatchId)` 로 하기 때문에 형식이 섞여도 겹치지 않는다.
 */
export function supplyMatchRowId(sourceMatchId: string, leagueSlug: string): string {
  return `${sourceMatchId}@${leagueSlug}`
}

export interface SupplyMirrorImportInput {
  /** 판독된 경기를 **한 건씩** 흘려 주는 원본. 전체를 메모리에 올리지 않는다 */
  source: ParsedSupplySource
  /** 넣을 리그. 보통 수집 파일의 `leagueSlug` 다 */
  leagueSlug: string
  /** 없으면 한 줄도 쓰지 않는다 */
  confirm?: boolean
  /**
   * 이미 있는 경기의 **비어 있는** `source*` 칸만 채운다.
   * 값이 있는 칸·우리가 계산한 칸은 절대 건드리지 않는다. 기본은 꺼져 있다.
   */
  updateSource?: boolean
  /**
   * 리그가 DB 에 없을 때 만들 이름.
   * 수집 파일에는 리그 **이름이 없다.** 그래서 사람이 주지 않으면 리그를 만들지 않는다 —
   * 이름을 지어내지 않기 위해서다 (3-A 8번).
   */
  createLeagueName?: string | null
  /** 쓰기에 쓸 클라이언트. 기본은 전역 `prisma` 다 (검증용 트랜잭션을 넣을 수 있다) */
  client?: SupplyImportDb
  /**
   * **IPL 클랜끼리의 경기를 열산에 만들지 않는 규칙** (D-210).
   *
   * 기본은 DB 에서 IPL 등록 명단을 읽어 스스로 만든다. 규칙이 안 걸리는 리그면
   * DB 를 읽지도 않는다. 테스트가 임시 리그로 시험할 때만 직접 넣는다.
   */
  iplOnlyGuard?: IplOnlyMatchGuard
}

export interface SupplyMirrorImportResult {
  leagueSlug: string
  leagueExists: boolean
  /** 계획 단계에서 센 값들. `confirm` 여부와 무관하게 같은 숫자가 나온다 */
  planned: {
    leagues: number
    clans: number
    leagueClans: number
    maps: number
    leagueMaps: number
    players: number
    matches: number
    stats: number
  }
  written: {
    leagues: number
    clans: number
    leagueClans: number
    maps: number
    leagueMaps: number
    players: number
    matches: number
    stats: number
    sourceBackfilledMatches: number
    sourceBackfilledStats: number
    /** 실제로 채워질(채운) **빈 칸** 수 */
    sourceBackfilledColumns: number
  }
  /** 넣지 않은 경기 — 사유별 건수 */
  skipped: Record<string, number>
  /**
   * 이번에 흘려 본 경기 id 전부. 대조(reconciliation)가 쓴다 —
   * 원본을 두 번 흘리지 않기 위해 여기서 모아 둔다 (13만 건이라도 id 만이라 가볍다).
   */
  sourceMatchIds: Set<string>
  /** 사람이 봐야 하는 것 */
  notes: string[]
}

interface ClanResolution {
  clanId: string | null
  leagueClanId: string | null
  /** 이번 실행에서 새로 만들기로 한 것인가 */
  clanCreated: boolean
  leagueClanCreated: boolean
  /** 근거가 어긋나 쓸 수 없는 클랜 */
  conflict: string | null
}

const bump = (counter: Record<string, number>, key: string): void => {
  counter[key] = (counter[key] ?? 0) + 1
}

/**
 * 수집 파일을 DB 로 넣는다.
 *
 * 계획(무엇을 만들지)을 먼저 메모리에서 다 세고, `confirm` 일 때만 쓴다.
 * 그래서 미리보기 숫자와 실제 실행 숫자가 어긋나지 않는다.
 */
export async function importSupplyMirror(
  input: SupplyMirrorImportInput,
): Promise<SupplyMirrorImportResult> {
  const confirm = Boolean(input.confirm)
  const db: SupplyImportDb = input.client ?? prisma
  const result: SupplyMirrorImportResult = {
    leagueSlug: input.leagueSlug,
    leagueExists: false,
    planned: {
      leagues: 0,
      clans: 0,
      leagueClans: 0,
      maps: 0,
      leagueMaps: 0,
      players: 0,
      matches: 0,
      stats: 0,
    },
    written: {
      leagues: 0,
      clans: 0,
      leagueClans: 0,
      maps: 0,
      leagueMaps: 0,
      players: 0,
      matches: 0,
      stats: 0,
      sourceBackfilledMatches: 0,
      sourceBackfilledStats: 0,
      sourceBackfilledColumns: 0,
    },
    skipped: {},
    sourceMatchIds: new Set<string>(),
    notes: [],
  }

  /* ── 리그 ───────────────────────────────────────────────────────────────── */
  let league = await db.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true, divisionCount: true },
  })
  result.leagueExists = league !== null

  if (!league) {
    result.planned.leagues = 1
    if (!input.createLeagueName) {
      result.notes.push(
        `리그 '${input.leagueSlug}' 가 DB 에 없다. 수집 파일에 리그 **이름**이 없어 만들지 않았다 — ` +
          `이름을 지어내지 않는다. 만들려면 --league-name 으로 이름을 준다`,
      )
    } else if (confirm) {
      /* division 은 **관측된 최대값**이다. 수집 파일은 부리그 수를 직접 알려 주지 않는다 */
      const observed = Math.max(
        1,
        ...input.source.clans.map((clan) => clan.division ?? 1),
      )
      const created = await db.league.create({
        data: {
          slug: input.leagueSlug,
          name: input.createLeagueName,
          divisionCount: observed,
          origin: SUPPLY_ORIGIN,
          sourceLeagueId: String(input.source.leagueId),
        },
        select: { id: true, divisionCount: true },
      })
      league = created
      result.written.leagues = 1
      result.leagueExists = true
    }
  }

  const leagueId = league?.id ?? null
  if (!leagueId && confirm) {
    /* 미리보기는 리그가 없어도 "무엇이 들어갈지" 를 다 세어 준다.
       실제 쓰기만 막는다 — 리그 없이 만들면 경기가 갈 곳이 없다.
       원본을 흘려 보며 몇 건이 막혔는지는 그대로 센다 */
    result.notes.push('리그가 없어 한 건도 쓰지 않았다')
    for await (const match of input.source.matches()) {
      result.sourceMatchIds.add(match.sourceMatchId)
      bump(result.skipped, 'league_not_found')
    }
    return result
  }

  /**
   * **IPL 클랜끼리의 경기는 열산 기록이 아니다** (D-210).
   *
   * 명단을 여기서 한 번만 읽는다. 경기마다 DB 를 되묻지 않는다.
   * 열산이 아닌 리그면 이 호출은 DB 를 읽지도 않고 "아무것도 막지 않음" 을 돌려준다 —
   * DPL(`supply`)·대룰(`daerule`)은 그대로다.
   */
  const iplGuard =
    input.iplOnlyGuard ??
    (await loadIplOnlyMatchGuard({ targetLeagueSlug: input.leagueSlug, client: db }))
  if (iplGuard.enabled) {
    result.notes.push(
      `IPL끼리 경기 차단이 켜져 있다 (리그 ${input.leagueSlug} · IPL 등록 클랜 ${iplGuard.iplClanCount}곳) — D-210`,
    )
  }

  /* ── 이미 있는 것들을 미리 읽어 둔다 (경기마다 조회하면 느리다) ─────────────── */
  const clansBySource = new Map<string, string>()
  const clansBySlug = new Map<string, { id: string; sourceClanId: string | null }>()
  for (const row of await db.clan.findMany({
    select: { id: true, slug: true, sourceClanId: true },
  })) {
    clansBySlug.set(row.slug, { id: row.id, sourceClanId: row.sourceClanId })
    if (row.sourceClanId) clansBySource.set(row.sourceClanId, row.id)
  }

  const leagueClanByClan = new Map<string, string>()
  if (leagueId) {
    for (const row of await db.leagueClan.findMany({
      where: { leagueId },
      select: { id: true, clanId: true },
    })) {
      leagueClanByClan.set(row.clanId, row.id)
    }
  }

  /**
   * 이미 쓰이고 있는 3rd.supply `league_clan` id (D-155).
   *
   * 이 컬럼은 **전역 unique** 다. 리그마다 다른 값이 오는 것이 정상이라 보통은 겹치지 않지만,
   * 겹치는 순간 `create` 가 통째로 터져 그 경기가 통으로 못 들어간다.
   * 겹치면 **비워 두고 세기만 한다** — 없는 값을 지어내지도, 남의 행을 뺏지도 않는다.
   */
  const takenLeagueClanSourceIds = new Set<string>()
  for (const row of await db.leagueClan.findMany({
    where: { sourceLeagueClanId: { not: null } },
    select: { sourceLeagueClanId: true },
  })) {
    takenLeagueClanSourceIds.add(row.sourceLeagueClanId as string)
  }

  const mapByName = new Map<string, string>()
  for (const row of await db.gameMap.findMany({ select: { id: true, name: true } })) {
    mapByName.set(row.name, row.id)
  }
  const leagueMapNames = new Set<string>()
  if (leagueId) {
    for (const row of await db.leagueMap.findMany({
      where: { leagueId },
      select: { map: { select: { name: true } } },
    })) {
      leagueMapNames.add(row.map.name)
    }
  }

  /**
   * 이미 들어와 있는 경기 색인 — **이 리그 안에서만** 본다 (D-155).
   *
   * 클랜은 리그를 겸한다. e2stro- 와 The|vub 가 둘 다 공식리그·열산리그 소속이면
   * 그 경기는 **양쪽 리그에 다 찍혀야 한다.** 그래서 "다른 리그에 같은 경기가 있다" 는
   * 더 이상 건너뛸 이유가 아니다. 중복 판정은 오직 `(리그, 원본 경기번호)` 로 한다.
   *
   * 키를 둘 넣는다 — `sourceMatchId` 와 `id`.
   * 이 도구가 예전에 넣은 행은 `id === sourceMatchId` 이고(12,567행), 지금부터 넣는 행은
   * `id = "<경기번호>@<리그slug>"` 다. 두 형식이 섞여도 `sourceMatchId` 키 하나로 둘 다 잡힌다.
   * (예전 행을 다시 쓰는 것이 더 위험하다 — 그대로 둔다)
   *
   * 경기마다 `findFirst` 를 부르지 않는다. 실측으로 7만 건에서 한 시간이 지나도 안 끝났다.
   */
  const existingInLeague = new Map<string, { id: string }>()
  if (leagueId) {
    for (const row of await db.match.findMany({
      where: { leagueId },
      select: { id: true, sourceMatchId: true },
    })) {
      const entry = { id: row.id }
      existingInLeague.set(row.id, entry)
      if (row.sourceMatchId) existingInLeague.set(row.sourceMatchId, entry)
    }
  }

  const playerBySource = new Map<string, string>()
  for (const row of await db.player.findMany({
    where: { sourcePlayerId: { not: null } },
    select: { id: true, sourcePlayerId: true },
  })) {
    playerBySource.set(row.sourcePlayerId as string, row.id)
  }

  /* ── 해석기들 — 계획을 세면서 캐시를 채운다 ─────────────────────────────── */

  /** 이번 실행에서 만들기로 한 것들. 두 번 세지 않기 위해 기억한다 */
  const plannedClans = new Set<string>()
  const plannedLeagueClans = new Set<string>()
  const plannedMaps = new Set<string>()
  const plannedLeagueMaps = new Set<string>()
  const plannedPlayers = new Set<string>()

  async function resolveClan(clan: ParsedSupplyClan, joinLeague: boolean): Promise<ClanResolution> {
    const out: ClanResolution = {
      clanId: null,
      leagueClanId: null,
      clanCreated: false,
      leagueClanCreated: false,
      conflict: null,
    }

    let clanId = clansBySource.get(clan.sourceClanId) ?? null
    if (!clanId) {
      const bySlug = clansBySlug.get(clan.slug)
      if (bySlug) {
        if (bySlug.sourceClanId && bySlug.sourceClanId !== clan.sourceClanId) {
          /* 같은 slug 인데 원본 id 가 다르다. 어느 쪽이 맞는지 우리가 모른다 — 사람이 본다 */
          out.conflict = `clan_source_id_conflict:${clan.slug}`
          return out
        }
        clanId = bySlug.id
        if (!bySlug.sourceClanId && confirm) {
          /* 원본 id 만 비어 있었다. 근거가 생겼으니 채운다 (덮어쓰기가 아니다) */
          await db.clan.updateMany({
            where: { id: clanId, sourceClanId: null },
            data: { sourceClanId: clan.sourceClanId },
          })
        }
        clansBySource.set(clan.sourceClanId, clanId)
      }
    }

    if (!clanId) {
      const key = `clan:${clan.sourceClanId}`
      if (!plannedClans.has(key)) {
        plannedClans.add(key)
        result.planned.clans += 1
      }
      out.clanCreated = true
      if (confirm) {
        const created = await db.clan.create({
          data: {
            slug: clan.slug,
            name: clan.name,
            markBgUrl: clan.markBgUrl,
            markFrontUrl: clan.markFrontUrl,
            sourceClanId: clan.sourceClanId,
            origin: SUPPLY_ORIGIN,
          },
          select: { id: true },
        })
        clanId = created.id
        clansBySource.set(clan.sourceClanId, clanId)
        clansBySlug.set(clan.slug, { id: clanId, sourceClanId: clan.sourceClanId })
        result.written.clans += 1
      }
    }
    out.clanId = clanId

    if (!joinLeague) return out

    if (clanId) {
      const existing = leagueClanByClan.get(clanId)
      if (existing) {
        out.leagueClanId = existing
        return out
      }
    }

    const key = `leagueclan:${clan.sourceClanId}`
    if (!plannedLeagueClans.has(key)) {
      plannedLeagueClans.add(key)
      result.planned.leagueClans += 1
    }
    out.leagueClanCreated = true

    if (confirm && clanId && leagueId) {
      /* 래더 값은 넣지 않는다. 원본 점수는 경기 쪽 `source*` 칸에만 들어간다 —
         클랜 래더는 우리 공식이 따로 계산한다 (3-B) */
      const sourceLeagueClanId =
        clan.sourceLeagueClanId && !takenLeagueClanSourceIds.has(clan.sourceLeagueClanId)
          ? clan.sourceLeagueClanId
          : null
      if (clan.sourceLeagueClanId && sourceLeagueClanId === null) {
        result.notes.push(
          `league_clan id ${clan.sourceLeagueClanId}(${clan.slug})는 다른 행이 이미 쓰고 있다 — 비워 두고 만들었다`,
        )
      }
      const created = await db.leagueClan.create({
        data: {
          leagueId,
          clanId,
          division: clan.division ?? 1,
          sourceLeagueClanId,
        },
        select: { id: true },
      })
      if (sourceLeagueClanId) takenLeagueClanSourceIds.add(sourceLeagueClanId)
      leagueClanByClan.set(clanId, created.id)
      out.leagueClanId = created.id
      result.written.leagueClans += 1
    }

    return out
  }

  async function resolveMap(name: string): Promise<string | null> {
    let mapId = mapByName.get(name) ?? null
    if (!mapId) {
      if (!plannedMaps.has(name)) {
        plannedMaps.add(name)
        result.planned.maps += 1
      }
      if (confirm) {
        const created = await db.gameMap.create({ data: { name }, select: { id: true } })
        mapId = created.id
        mapByName.set(name, mapId)
        result.written.maps += 1
      }
    }
    if (!leagueMapNames.has(name)) {
      if (!plannedLeagueMaps.has(name)) {
        plannedLeagueMaps.add(name)
        result.planned.leagueMaps += 1
      }
      if (confirm && mapId && leagueId) {
        await db.leagueMap.create({ data: { leagueId, mapId } })
        leagueMapNames.add(name)
        result.written.leagueMaps += 1
      }
    }
    return mapId
  }

  async function resolvePlayer(sourcePlayerId: string, name: string | null): Promise<string | null> {
    const known = playerBySource.get(sourcePlayerId)
    if (known) return known

    if (!plannedPlayers.has(sourcePlayerId)) {
      plannedPlayers.add(sourcePlayerId)
      result.planned.players += 1
    }
    /* id 규칙은 D-148 이 쓰던 것과 같다. 두 도구가 같은 사람을 두 행으로 만들지 않는다 */
    const id = `SUP-${sourcePlayerId}`
    if (!confirm) return id

    const created = await db.player.upsert({
      where: { id },
      create: {
        id,
        name: name ?? `선수-${sourcePlayerId}`,
        origin: SUPPLY_ORIGIN,
        sourcePlayerId,
      },
      update: {},
      select: { id: true },
    })
    playerBySource.set(sourcePlayerId, created.id)
    result.written.players += 1
    return created.id
  }

  /* ── 경기 — **한 건씩 흘려 받는다.** 전체를 배열로 들고 있지 않는다 ────────── */
  for await (const match of input.source.matches()) {
    result.sourceMatchIds.add(match.sourceMatchId)
    /* 한 경기가 터져도 나머지를 버리지 않는다. **무엇이 왜 안 들어갔는지 남긴다** (3-A 6번).
       idempotent 하므로 원인을 고친 뒤 그대로 다시 돌리면 이어진다 */
    try {
      await importOne(match)
    } catch (error) {
      bump(result.skipped, 'write_failed')
      const message = error instanceof Error ? error.message : String(error)
      if (result.notes.length < 20) {
        result.notes.push(`경기 ${match.sourceMatchId} 실패: ${message.split('\n')[0]}`)
      }
    }
  }

  return result

  async function importOne(match: ParsedSupplyMatch): Promise<void> {
    const reason = validate(match)
    if (reason) {
      bump(result.skipped, reason)
      return
    }
    /* validate 를 통과했으므로 아래 값들은 전부 있다 */
    const redClan = match.redClan as ParsedSupplyClan
    const blueClan = match.blueClan as ParsedSupplyClan

    /* **IPL 클랜끼리의 경기는 열산 기록이 아니다** (D-210).
       `already_in_db` 보다 **먼저** 본다 — 이 사유의 건수가 곧 "원본이 이 리그에 밀어넣으려
       한 IPL끼리 경기" 의 수라서, 대조 명령(`ipl-sanply-check`)과 같은 것을 세게 된다.
       원문(수집 JSONL)은 그대로 남는다. 안 만드는 것은 `Match` 행뿐이다 (3-A 1번) */
    if (iplGuard.blocks(redClan, blueClan)) {
      bump(result.skipped, IPL_ONLY_SKIP_REASON)
      return
    }

    /* **이 리그에** 이미 있는지만 본다. 다른 리그에 있는 것은 정상이다 (D-155) */
    const existing = existingInLeague.get(match.sourceMatchId) ?? null
    if (existing) {
      bump(result.skipped, 'already_in_db')
      /* 미리보기에서도 **몇 칸이 채워질지** 센다. 쓰기만 `confirm` 이 가른다 */
      if (input.updateSource) {
        const filled = await backfillSourceValues(db, existing.id, match, confirm)
        result.written.sourceBackfilledMatches += filled.match
        result.written.sourceBackfilledStats += filled.stats
        result.written.sourceBackfilledColumns += filled.columns
      }
      return
    }

    const red = await resolveClan(redClan, true)
    const blue = await resolveClan(blueClan, true)
    if (red.conflict || blue.conflict) {
      bump(result.skipped, red.conflict ?? blue.conflict ?? 'clan_conflict')
      return
    }
    const mapId = await resolveMap(match.mapName as string)

    /* 참가자 신원을 먼저 전부 정한다. 한 명이라도 못 정하면 경기를 만들지 않는다 —
       참가자가 빠진 경기가 남으면 통계가 조용히 틀어진다 */
    const roster: { playerId: string; participant: ParsedSupplyMatch['participants'][number] }[] = []
    let identityFailed = false
    for (const participant of match.participants) {
      const playerId = await resolvePlayer(participant.sourcePlayerId, participant.name)
      if (!playerId) {
        identityFailed = true
        break
      }
      roster.push({ playerId, participant })
    }
    if (identityFailed) {
      bump(result.skipped, 'player_identity_unresolved')
      return
    }
    /* 같은 사람이 한 경기에 두 번 들어오면 `(matchId, playerId)` unique 가 깨진다.
       원본이 그렇게 준 것이므로 지어내 고치지 않고 통째로 보류한다 */
    if (new Set(roster.map((row) => row.playerId)).size !== roster.length) {
      bump(result.skipped, 'duplicate_player_in_match')
      return
    }

    const redCount = roster.filter((row) => row.participant.side === 'red').length
    const blueCount = roster.length - redCount
    const mvpPlayerId =
      match.mvpSourcePlayerId === null
        ? null
        : (roster.find((row) => row.participant.sourcePlayerId === match.mvpSourcePlayerId)
            ?.playerId ?? null)

    result.planned.matches += 1
    result.planned.stats += roster.length

    if (!confirm) return
    if (!leagueId || !mapId || !red.leagueClanId || !blue.leagueClanId) {
      bump(result.skipped, 'unresolved_reference')
      return
    }

    const matchData = {
      /* 리그별로 다른 행이다. 경기 번호는 아래 `sourceMatchId` 에 그대로 남는다 (D-155) */
      id: supplyMatchRowId(match.sourceMatchId, input.leagueSlug),
      leagueId,
      mapId,
      playerCount: roster.length,
      startAt: match.startAt as Date,
      endAt: match.endAt,
      playTime: match.playTime,
      /* 원본의 `blue_team` 은 "보는 클랜이 블루였나" 이지 **선공 진영이 아니다.**
         선공은 원본이 주지 않는다 → null = 모른다 (D-034) */
      blueFirst: null,
      winnerSide: match.winnerSide as string,
      mvpPlayerId,
      redLeagueClanId: red.leagueClanId,
      blueLeagueClanId: blue.leagueClanId,
      redDivisionAtMatch: match.redDivision as number,
      blueDivisionAtMatch: match.blueDivision as number,
      redPlacement: match.redPlacement ?? false,
      bluePlacement: match.bluePlacement ?? false,
      /* 우리가 계산한 칸은 비워 둔다. 원본값은 아래 source 칸에만 (3-A 2번) */
      redSourceRating: match.redSourceRating,
      blueSourceRating: match.blueSourceRating,
      redSourceRatingUpdate: match.redSourceRatingUpdate,
      blueSourceRatingUpdate: match.blueSourceRatingUpdate,
      origin: SUPPLY_ORIGIN,
      sourceMatchId: match.sourceMatchId,
      participantCompleteness: `${Math.max(redCount, blueCount)}v${Math.min(redCount, blueCount)}`,
      evidenceConfidence: match.sideEvidence === 'both' ? 'high' : 'medium',
    }

    const statData = roster.map(({ playerId, participant }) => {
      const ownClan = participant.side === 'red' ? redClan : blueClan
      const isMember = participant.clan?.sourceClanId === ownClan.sourceClanId
      const rosterClanId = participant.clan
        ? (clansBySource.get(participant.clan.sourceClanId) ?? null)
        : null
      const rosterLeagueClanId = rosterClanId
        ? (leagueClanByClan.get(rosterClanId) ?? null)
        : null
      return {
        playerId,
        side: participant.side,
        kill: participant.kill,
        death: participant.death,
        assist: participant.assist,
        headshot: participant.headshot,
        damage: participant.damage,
        weapon: participant.weapon,
        dropout: participant.dropout,
        mvp: participant.mvp,
        participantRole: isMember ? 'member' : 'mercenary',
        rosterLeagueClanId,
        matchTimeClanName: participant.clan?.name ?? null,
        matchTimeLeagueClanId: rosterLeagueClanId,
        matchTimeClanSlug: participant.clan?.slug ?? null,
        matchTimeClanMarkBgUrl: participant.clan?.markBgUrl ?? null,
        matchTimeClanMarkFrontUrl: participant.clan?.markFrontUrl ?? null,
        matchTimeClanSource: SUPPLY_MATCH_TIME_SOURCE,
        matchTimeClanObservedAt: input.source.capturedAt,
        matchTimeClanConfidence: 'high',
        playerDivisionAtMatch:
          participant.side === 'red' ? (match.redDivision as number) : (match.blueDivision as number),
        opponentDivisionAtMatch:
          participant.side === 'red' ? (match.blueDivision as number) : (match.redDivision as number),
        /* 우리 공식으로 계산하지 않았다는 표시. 추정 공식으로 덮어쓰지 않는다 (3-A 2번) */
        formulaVersion: SUPPLY_FORMULA_VERSION,
        isPlacement: participant.placement ?? false,
        sourceRating: participant.sourceRating,
        sourceRatingDelta: participant.sourceRatingDelta,
      }
    })

    /* 경기와 참가 기록을 **한 번에** 만든다 (중첩 create 는 원자적이다).
       따로 만들면 참가 기록 쓰기가 실패했을 때 "참가자 0명 경기" 가 남고,
       다음 실행은 그 경기를 '이미 있음' 으로 건너뛴다 — 조용히 망가진다 */
    await db.match.create({ data: { ...matchData, stats: { createMany: { data: statData } } } })
    /* 같은 실행 안에서 같은 경기를 두 번 만들지 않게 색인에도 넣는다 */
    existingInLeague.set(match.sourceMatchId, {
      id: supplyMatchRowId(match.sourceMatchId, input.leagueSlug),
    })
    result.written.matches += 1
    result.written.stats += statData.length
  }
}

/** 넣을 수 없는 경기인지 본다. 없는 값을 만들어 채우지 않는다 */
function validate(match: ParsedSupplyMatch): string | null {
  if (!match.redClan || !match.blueClan) return 'side_clan_unresolved'
  if (!match.winnerSide) return 'winner_unresolved'
  if (!match.startAt) return 'start_at_unparsed'
  if (!match.mapName) return 'map_missing'
  if (match.redDivision === null || match.blueDivision === null) return 'division_unknown'
  if (match.participants.length === 0) return 'no_participants'
  return null
}

/**
 * 이미 있는 경기의 **비어 있는** source 칸만 채운다.
 *
 * ── 칸 단위로 본다 (D-155 후속)
 *   예전에는 "네 칸이 **전부** 비었을 때만" 채웠다. 그런데 실제 행은 늘 절반만 차 있다 —
 *   상대 클랜 점수와 보는 쪽 증감은 들어가고, 나머지 두 칸은 비어 있었다.
 *   그래서 조건이 한 번도 맞지 않아 **아무것도 채워지지 않았다.**
 *   이제 칸마다 따로 본다: **비어 있고 새 값이 있는 칸만** 채운다.
 *
 * 값이 있는 칸은 건드리지 않는다. 우리가 계산한 `ratingBefore` · `ratingUpdate` 도
 * 절대 손대지 않는다. 참가자는 `sourcePlayerId` 로 이어질 때만 채운다 —
 * 닉네임으로 추측해 채우지 않는다.
 *
 * `write: false` 면 **읽기만 하고 몇 칸이 채워질지 세기만 한다** (미리보기).
 */
async function backfillSourceValues(
  db: SupplyImportDb,
  matchId: string,
  parsed: ParsedSupplyMatch,
  write: boolean,
): Promise<{ match: number; stats: number; columns: number }> {
  const out = { match: 0, stats: 0, columns: 0 }

  const row = await db.match.findUnique({
    where: { id: matchId },
    select: {
      redSourceRating: true,
      blueSourceRating: true,
      redSourceRatingUpdate: true,
      blueSourceRatingUpdate: true,
    },
  })
  if (!row) return out

  const patch: {
    redSourceRating?: number
    blueSourceRating?: number
    redSourceRatingUpdate?: number
    blueSourceRatingUpdate?: number
  } = {}
  const fill = (
    key: keyof typeof patch,
    current: number | null,
    next: number | null,
  ): void => {
    if (current === null && next !== null) {
      patch[key] = next
      out.columns += 1
    }
  }
  fill('redSourceRating', row.redSourceRating, parsed.redSourceRating)
  fill('blueSourceRating', row.blueSourceRating, parsed.blueSourceRating)
  fill('redSourceRatingUpdate', row.redSourceRatingUpdate, parsed.redSourceRatingUpdate)
  fill('blueSourceRatingUpdate', row.blueSourceRatingUpdate, parsed.blueSourceRatingUpdate)

  if (Object.keys(patch).length > 0) {
    out.match = 1
    if (write) await db.match.update({ where: { id: matchId }, data: patch })
  }

  /* 참가자도 칸 단위다. 둘 중 하나만 비어 있는 행이 있을 수 있다 */
  const stats = await db.matchPlayerStat.findMany({
    where: { matchId, OR: [{ sourceRating: null }, { sourceRatingDelta: null }] },
    select: {
      id: true,
      sourceRating: true,
      sourceRatingDelta: true,
      player: { select: { sourcePlayerId: true } },
    },
  })
  for (const stat of stats) {
    const sourcePlayerId = stat.player.sourcePlayerId
    if (!sourcePlayerId) continue
    const participant = parsed.participants.find((item) => item.sourcePlayerId === sourcePlayerId)
    if (!participant) continue

    const statPatch: { sourceRating?: number; sourceRatingDelta?: number } = {}
    if (stat.sourceRating === null && participant.sourceRating !== null) {
      statPatch.sourceRating = participant.sourceRating
      out.columns += 1
    }
    if (stat.sourceRatingDelta === null && participant.sourceRatingDelta !== null) {
      statPatch.sourceRatingDelta = participant.sourceRatingDelta
      out.columns += 1
    }
    if (Object.keys(statPatch).length === 0) continue

    out.stats += 1
    if (write) await db.matchPlayerStat.update({ where: { id: stat.id }, data: statPatch })
  }

  return out
}

/* ── 대조 (reconciliation) ────────────────────────────────────────────────── */

export interface SupplyMirrorReconciliation {
  leagueSlug: string
  leagueExists: boolean
  /** 수집 파일 쪽 */
  fileMatches: number
  fileUnparsed: number
  /** DB 쪽 (해당 리그) */
  dbMatches: number
  common: number
  /** 파일에만 있는 경기. **목표는 0 이다** */
  supplyOnly: number
  /** DB 에만 있는 경기 (다른 경로로 들어온 것) */
  dbOnly: number
  /**
   * 같은 경기가 **다른 리그에도** 기록돼 있는 수 (D-155).
   * 오류가 아니다 — 클랜이 리그를 겸하면 그 경기는 양쪽 리그에 다 찍힌다.
   */
  alsoInOtherLeagues: number
  db: {
    tenParticipants: number
    incompleteParticipants: number
    kdaComplete: number
    kdaIncomplete: number
    weaponComplete: number
    damageComplete: number
    headshotComplete: number
    sourceRatingComplete: number
  }
}

/**
 * 수집 파일과 DB 를 **숫자로** 맞춰 본다 (`CLAUDE.md` 3-A 6번).
 * 읽기만 한다.
 */
export async function reconcileSupplyMirror(input: {
  /** 판독에 성공한 경기 id 전부 (`importSupplyMirror` 결과의 `sourceMatchIds`) */
  matchIds: ReadonlySet<string>
  /** 판독하지 못한 경기 수 (사유별 합) */
  unparsed: number
  leagueSlug: string
}): Promise<SupplyMirrorReconciliation> {
  const fileIds = input.matchIds

  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true },
  })

  const out: SupplyMirrorReconciliation = {
    leagueSlug: input.leagueSlug,
    leagueExists: league !== null,
    fileMatches: fileIds.size,
    fileUnparsed: input.unparsed,
    dbMatches: 0,
    common: 0,
    supplyOnly: fileIds.size,
    dbOnly: 0,
    alsoInOtherLeagues: 0,
    db: {
      tenParticipants: 0,
      incompleteParticipants: 0,
      kdaComplete: 0,
      kdaIncomplete: 0,
      weaponComplete: 0,
      damageComplete: 0,
      headshotComplete: 0,
      sourceRatingComplete: 0,
    },
  }

  if (!league) return out

  /**
   * 집합 대조는 **id 만** 읽는다.
   *
   * 예전에는 경기마다 참가 기록까지 함께 읽었다. 경기가 13만 건이면 참가 기록이
   * 130만 줄이라 그대로 메모리에 올라온다. id 세 칸만 읽고 나머지는 SQL 이 센다.
   * 다른 리그까지 한 번에 읽어 `alsoInOtherLeagues` 도 같은 자료로 구한다 —
   * 파일 id 13만 개를 `IN (...)` 으로 넘기면 그것대로 터진다.
   */
  const idRows = await prisma.match.findMany({
    select: { id: true, sourceMatchId: true, leagueId: true },
  })
  for (const row of idRows) {
    const inFile = fileIds.has(row.id) || (row.sourceMatchId ? fileIds.has(row.sourceMatchId) : false)
    if (row.leagueId === league.id) {
      out.dbMatches += 1
      if (inFile) out.common += 1
      else out.dbOnly += 1
    } else if (inFile) {
      /* 다른 리그에도 같은 경기가 있다 — 정상이다 (D-155) */
      out.alsoInOtherLeagues += 1
    }
  }
  out.supplyOnly = fileIds.size - out.common

  /**
   * 값 완비는 **DB 안에서** 센다. 참가 기록을 밖으로 꺼내지 않는다.
   * "참가자 전원이 값을 가진 경기" 가 기준이라 결측이 0인 경기를 센다.
   */
  const [counts] = await prisma.$queryRawUnsafe<
    {
      ten: number
      incomplete: number
      kda: number
      kda_incomplete: number
      weapon: number
      damage: number
      headshot: number
      source_rating: number
    }[]
  >(
    `select
       count(*) filter (where s.n = 10)::int                                as ten,
       count(*) filter (where s.n <> 10)::int                               as incomplete,
       count(*) filter (where s.n > 0 and s.kda_missing = 0)::int           as kda,
       count(*) filter (where s.n = 0 or s.kda_missing > 0)::int            as kda_incomplete,
       count(*) filter (where s.n > 0 and s.weapon_missing = 0)::int        as weapon,
       count(*) filter (where s.n > 0 and s.damage_missing = 0)::int        as damage,
       count(*) filter (where s.n > 0 and s.headshot_missing = 0)::int      as headshot,
       count(*) filter (where s.n > 0 and s.rating_missing = 0)::int        as source_rating
     from (
       select m.id,
              count(st.id)::int                                                                   as n,
              count(*) filter (where st.id is not null and (st.kill is null or st.death is null
                               or st.assist is null))::int                                        as kda_missing,
              count(*) filter (where st.id is not null and st.weapon is null)::int                as weapon_missing,
              count(*) filter (where st.id is not null and st.damage is null)::int                as damage_missing,
              count(*) filter (where st.id is not null and st.headshot is null)::int              as headshot_missing,
              count(*) filter (where st.id is not null and st."sourceRating" is null)::int        as rating_missing
       from "Match" m
       left join "MatchPlayerStat" st on st."matchId" = m.id
       where m."leagueId" = $1
       group by m.id
     ) s`,
    league.id,
  )

  if (counts) {
    out.db.tenParticipants = counts.ten
    out.db.incompleteParticipants = counts.incomplete
    out.db.kdaComplete = counts.kda
    /* 같은 집계에서 뽑는다. 다른 질의의 총계에서 빼면 그 사이에 쓰기가 일어났을 때
       **음수가 나온다** — 실제로 나왔다 (다른 적재가 도는 중에 대조를 돌렸다) */
    out.db.kdaIncomplete = counts.kda_incomplete
    out.db.weaponComplete = counts.weapon
    out.db.damageComplete = counts.damage
    out.db.headshotComplete = counts.headshot
    out.db.sourceRatingComplete = counts.source_rating
  }

  return out
}
