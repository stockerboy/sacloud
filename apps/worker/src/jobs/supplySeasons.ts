/**
 * 3rd.supply **지난시즌 카드** 수집 (D-166).
 *
 * ── 무엇을 가져오는가
 *   선수 한 명의 `시즌 1 … 시즌 6` 카드다. **경기는 가져오지 않는다.**
 *   경기 미러링은 `supplyMirror.ts` 가 따로 한다. 이 잡은 그 파일을 읽지도 쓰지도 않는다.
 *
 * ── 실측한 경로 (2026-08-28)
 *   1) `GET /leagues/{leagueSlug}/players/{playerId}`  → `data.id` 가 **leaguePlayerId**
 *   2) `GET /leagueplayers/{leaguePlayerId}/seasons`   → 시즌 카드 배열
 *
 *   우리 계약(`packages/contract/src/endpoints.ts`)이 쓰던 `/leagueplayers/:id/seasons`
 *   가 **원본과 같았다.** 다만 원본 화면 URL 은 `player/{playerId}/season` 이라
 *   playerId → leaguePlayerId 를 먼저 풀어야 한다. 그래서 선수당 요청이 두 번이다.
 *   (`/leagues/{leagueId}/ranks/players` 는 leaguePlayerId 를 주지 않는다 — 확인했다.
 *    `/leagues/{slug}/clans/{clanSlug}/players` 는 주지만 **현재 클랜원만** 나와서
 *    무소속 선수를 못 덮는다. 경로를 둘로 늘려 얻는 이득이 작아 쓰지 않는다.)
 *
 * ── 실측한 응답 (그대로 옮긴다)
 *   {"message":"success","data":[
 *     {"id":51730,"season":6,"rank":2501,"rank_count":6934,
 *      "win":82,"lose":123,"win_rate":40,"kill":1396,"death":1864,"kd_rate":42.8},
 *     {"id":34547,"season":4,"rank":593,"rank_count":29991,
 *      "win":null,"lose":null,"win_rate":52.8,"kill":null,"death":null,"kd_rate":48.7}]}
 *
 *   **시즌마다 주는 필드가 다르다.** 시즌 6·5 는 승패·킬데스가 있고,
 *   시즌 4·3·2·1 은 `win`/`lose`/`kill`/`death` 가 전부 `null` 이다 (비율만 준다).
 *   `rating`(래더)·`division`·소속은 **어느 시즌에도 없다.**
 *   → 없는 값을 0 이나 `-` 로 채우지 않는다 (D-099 · D-106).
 *
 * ── 원본을 버리지 않는다 (`CLAUDE.md` 3-A 1번)
 *   시즌 응답은 `raw` 에 **통째로** 남긴다. 변환은 `supplySeasonsImport.ts` 가 한다.
 *   1) 번 호출은 **id 색인**일 뿐이라 매핑만 남긴다 — 그 응답의 `match_summary`
 *      (최근 상대 목록)는 우리가 쓰지 않는 값이고 3만 명분이면 수백 MB 다.
 *
 * ── 중단 후 재개 (3-A 4번)
 *   두 JSONL 에 이미 있는 선수는 건너뛴다. 일회성 스크립트가 아니다.
 *   `--dry-run` 은 **요청을 한 건도 보내지 않는다.**
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { prisma } from '@sacloud/db'
import {
  SUPPLY_CONCURRENCY,
  SupplyApiError,
  supplyGet,
  supplyMapLimited,
} from '../lib/supplyClient.js'
import { appendJsonlMany, readJsonl, readJsonlIds } from '../lib/jsonlStore.js'
import { log, warn } from '../lib/log.js'
import type { JobContext } from './context.js'

/** 시즌 카드 한 줄 — 실측 그대로. `null` 이 오는 필드가 있다 */
export interface SupplySeasonRow {
  /** 3rd.supply 쪽 시즌 기록 id. 원본 id 는 버리지 않는다 (3-A 3번) */
  id: number
  season: number
  /** 순위. **0 이 온다** — 판수가 적은 선수에서 관측했다. 뜻은 `[미확인]`, 원본값 그대로 둔다 */
  rank: number | null
  rank_count: number | null
  win: number | null
  lose: number | null
  win_rate: number | null
  kill: number | null
  death: number | null
  kd_rate: number | null
}

/** 저장 레코드 — 이 줄만 있으면 나중에 다시 변환할 수 있어야 한다 */
export interface SupplySeasonRecord {
  source: '3rd.supply'
  endpoint: string
  fetched_at: string
  league_slug: string
  /** 3rd.supply 의 player id (원본 화면 URL 에 쓰이는 값) */
  player_id: string
  league_player_id: number
  /** 응답 `data` 를 **그대로** 담는다 */
  raw: SupplySeasonRow[]
}

/**
 * playerId → leaguePlayerId 색인 + **선수 프로필 값** (D-161).
 *
 * 색인은 경로를 푸는 값이지만, 같은 응답이 `position` · `note` · `renewed_at` 도 준다.
 * 예전에는 그 셋을 **버렸다** — `CLAUDE.md` 3-A 1번 위반이었다. 이제 함께 남긴다.
 * 셋 다 리그와 무관한 **전역 선수 값**이라 리그마다 같은 값이 온다 (실측 2026-08-28).
 * 적재는 `supplyPlayerProfilesImport.ts` 가 한다.
 *
 * 이 잡을 고치기 전에 받은 줄에는 세 칸이 **아예 없다**(`undefined`).
 * 그래서 `?` 다 — "값이 null 이다" 와 "물어보지 않았다" 를 구분해야 한다.
 */
export interface SupplyLeaguePlayerRef {
  source: '3rd.supply'
  endpoint: string
  fetched_at: string
  league_slug: string
  player_id: string
  /** 원본에 그 리그의 선수가 없으면 `null` (404) */
  league_player_id: number | null
  player_name: string | null
  /** 포지션 **코드**. 문자열이 아니다 — 화면 표기 매핑은 대부분 `[미확인]` (D-161) */
  position?: number | null
  /** 선수 소개/메모 */
  note?: string | null
  /** `YYYY-MM-DD HH:mm:ss`. 시간대 표기 없음 `[미확인]` */
  renewed_at?: string | null
}

export interface SupplySeasonsCheckpoint {
  source: '3rd.supply'
  sourceType: 'public-api'
  note: string
  routes: string[]
  leagueSlug: string
  updatedAt: string
  /** 대상 선수 수 (마지막 실행 시점) */
  targets: number
  /** 색인·수집이 끝난 선수 수 */
  resolved: number
  collected: number
  failures: { playerId: string; stage: 'lookup' | 'seasons'; status: string; at: string }[]
}

const NOTE =
  '3rd.supply 공개 API 를 웹 클라이언트와 같은 앱 헤더(SP-APP-*)로 불러 받았다. ' +
  '지난시즌 카드만 받는다 — 경기 기록은 이 잡의 범위가 아니다. ' +
  '시즌 응답은 raw 로 통째 보존한다.'

const refsPath = (base: string) => base.replace(/\.json$/, '.leagueplayers.jsonl')
const cardsPath = (base: string) => base.replace(/\.json$/, '.seasons.jsonl')

function emptyCheckpoint(leagueSlug: string): SupplySeasonsCheckpoint {
  return {
    source: '3rd.supply',
    sourceType: 'public-api',
    note: NOTE,
    routes: ['/leagues/{leagueSlug}/players/{playerId}', '/leagueplayers/{leaguePlayerId}/seasons'],
    leagueSlug,
    updatedAt: new Date().toISOString(),
    targets: 0,
    resolved: 0,
    collected: 0,
    failures: [],
  }
}

function readCheckpoint(file: string, leagueSlug: string): SupplySeasonsCheckpoint {
  if (!existsSync(file)) return emptyCheckpoint(leagueSlug)
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as SupplySeasonsCheckpoint
  } catch {
    warn(`체크포인트를 읽지 못했다 — 새로 만든다 (${file})`)
    return emptyCheckpoint(leagueSlug)
  }
}

/** 체크포인트는 **원자적으로** 쓴다. 쓰다 죽으면 다음 실행이 파일을 못 읽는다 */
function writeCheckpoint(file: string, checkpoint: SupplySeasonsCheckpoint): void {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(checkpoint, null, 2), 'utf8')
  renameSync(tmp, file)
}

/**
 * 대상 선수 목록 — **우리 DB 에 있는 그 리그 선수 전원**이다.
 *
 * 미러 수집 파일(수백 MB)을 훑지 않는다. 이미 적재가 끝나 있고,
 * "시즌7에 참가한 선수" 가 곧 `LeaguePlayer` 행이다.
 */
export async function seasonTargets(leagueSlug: string): Promise<string[]> {
  const league = await prisma.league.findUnique({ where: { slug: leagueSlug }, select: { id: true } })
  if (!league) throw new Error(`리그를 찾을 수 없다: ${leagueSlug}`)

  const rows = await prisma.leaguePlayer.findMany({
    where: { leagueId: league.id, player: { sourcePlayerId: { not: null } } },
    select: { player: { select: { sourcePlayerId: true } } },
    orderBy: { id: 'asc' },
  })
  const ids = new Set<string>()
  for (const row of rows) {
    const id = row.player.sourcePlayerId
    if (id) ids.add(id)
  }
  return [...ids]
}

export interface SupplySeasonsResult {
  leagueSlug: string
  file: string
  targets: number
  /** 이번 실행 전에 이미 받아 둔 선수 */
  alreadyDone: number
  /** 이번에 새로 색인한 선수 */
  newRefs: number
  /** 이번에 새로 받은 시즌 응답 */
  newCards: number
  /** 시즌 카드가 한 장이라도 있는 선수 (누적) */
  playersWithSeasons: number
  /** 시즌 카드 줄 수 (누적) */
  seasonRows: number
  failures: number
  dryRun: boolean
}

const BATCH = 200

export async function runSupplySeasons(
  ctx: JobContext,
  input: { leagueSlug: string; file: string; limit?: number | undefined },
): Promise<SupplySeasonsResult> {
  const { leagueSlug, file } = input
  const checkpoint = readCheckpoint(file, leagueSlug)
  const refs = refsPath(file)
  const cards = cardsPath(file)

  const targets = await seasonTargets(leagueSlug)

  /* 이미 받은 것은 다시 받지 않는다. 시즌 응답이 있으면 그 선수는 끝난 것이다 */
  const doneCards = await readJsonlIds(cards, (r) => r['player_id'] as string | undefined)
  /* 색인은 별도로 남는다 — 시즌 호출에서 죽어도 매핑을 다시 사지 않는다 */
  const knownRefs = new Map<string, number | null>()
  await readJsonl<SupplyLeaguePlayerRef>(refs, (r) => {
    knownRefs.set(r.player_id, r.league_player_id)
  })

  let pending = targets.filter((id) => !doneCards.has(id))
  const alreadyDone = targets.length - pending.length
  if (input.limit !== undefined && input.limit !== null) pending = pending.slice(0, input.limit)

  log(
    `${leagueSlug} — 대상 ${targets.length}명 · 이미 받음 ${alreadyDone}명 · 이번 대상 ${pending.length}명`,
  )

  if (ctx.dryRun) {
    /* 예상 요청 수를 알려 준다. **한 건도 보내지 않는다** */
    const lookups = pending.filter((id) => !knownRefs.has(id)).length
    log(`--dry-run — 요청을 보내지 않는다. 예상 요청 ${lookups + pending.length}건`)
    log(`  색인(leaguePlayerId) ${lookups}건 + 시즌 ${pending.length}건 · 동시성 ${SUPPLY_CONCURRENCY}`)
    const stats = await countCollected(cards)
    return {
      leagueSlug,
      file,
      targets: targets.length,
      alreadyDone,
      newRefs: 0,
      newCards: 0,
      playersWithSeasons: stats.playersWithSeasons,
      seasonRows: stats.seasonRows,
      failures: checkpoint.failures.length,
      dryRun: true,
    }
  }

  let newRefs = 0
  let newCards = 0

  for (let offset = 0; offset < pending.length; offset += BATCH) {
    const batch = pending.slice(offset, offset + BATCH)

    /* 1) 색인 — 아직 모르는 선수만 */
    const needLookup = batch.filter((id) => !knownRefs.has(id))
    if (needLookup.length > 0) {
      const refRows = await supplyMapLimited<string, SupplyLeaguePlayerRef | null>(needLookup, async (playerId) => {
        const endpoint = `/leagues/${leagueSlug}/players/${playerId}`
        try {
          const res = await supplyGet<{
            id: number
            player: {
              name: string
              position: number | null
              note: string | null
              renewed_at: string | null
            }
          }>(endpoint)
          return {
            source: '3rd.supply' as const,
            endpoint,
            fetched_at: new Date().toISOString(),
            league_slug: leagueSlug,
            player_id: playerId,
            league_player_id: res.data.id,
            player_name: res.data.player?.name ?? null,
            /* 응답이 준 것을 버리지 않는다 (3-A 1번 · D-161) */
            position: res.data.player?.position ?? null,
            note: res.data.player?.note ?? null,
            renewed_at: res.data.player?.renewed_at ?? null,
          }
        } catch (e) {
          if (e instanceof SupplyApiError && e.status === 404) {
            /* 그 리그에 없는 선수다. **실패가 아니라 사실**이므로 그대로 남기고 넘어간다 */
            return {
              source: '3rd.supply' as const,
              endpoint,
              fetched_at: new Date().toISOString(),
              league_slug: leagueSlug,
              player_id: playerId,
              league_player_id: null,
              player_name: null,
              /* 물어봤고 "없다" 는 답을 받았다. `undefined`(안 물어봤다)와 구분한다 */
              position: null,
              note: null,
              renewed_at: null,
            }
          }
          checkpoint.failures.push({
            playerId,
            stage: 'lookup',
            status: e instanceof SupplyApiError ? String(e.status) : 'error',
            at: new Date().toISOString(),
          })
          return null
        }
      })
      const ok = refRows.filter((r): r is SupplyLeaguePlayerRef => r !== null)
      appendJsonlMany(refs, ok)
      for (const r of ok) knownRefs.set(r.player_id, r.league_player_id)
      newRefs += ok.length
    }

    /* 2) 시즌 카드 */
    const collectable = batch.filter((id) => (knownRefs.get(id) ?? null) !== null)
    const cardRows = await supplyMapLimited<string, SupplySeasonRecord | null>(collectable, async (playerId) => {
      const leaguePlayerId = knownRefs.get(playerId) as number
      const endpoint = `/leagueplayers/${leaguePlayerId}/seasons`
      try {
        const res = await supplyGet<SupplySeasonRow[]>(endpoint)
        return {
          source: '3rd.supply' as const,
          endpoint,
          fetched_at: new Date().toISOString(),
          league_slug: leagueSlug,
          player_id: playerId,
          league_player_id: leaguePlayerId,
          raw: res.data ?? [],
        }
      } catch (e) {
        checkpoint.failures.push({
          playerId,
          stage: 'seasons',
          status: e instanceof SupplyApiError ? String(e.status) : 'error',
          at: new Date().toISOString(),
        })
        return null
      }
    })
    const okCards = cardRows.filter((r): r is SupplySeasonRecord => r !== null)
    appendJsonlMany(cards, okCards)
    newCards += okCards.length

    checkpoint.updatedAt = new Date().toISOString()
    checkpoint.targets = targets.length
    checkpoint.resolved = knownRefs.size
    checkpoint.collected = alreadyDone + newCards
    writeCheckpoint(file, checkpoint)
    log(`  진행 ${Math.min(offset + BATCH, pending.length)}/${pending.length} (실패 ${checkpoint.failures.length})`)
  }

  const stats = await countCollected(cards)
  return {
    leagueSlug,
    file,
    targets: targets.length,
    alreadyDone,
    newRefs,
    newCards,
    playersWithSeasons: stats.playersWithSeasons,
    seasonRows: stats.seasonRows,
    failures: checkpoint.failures.length,
    dryRun: false,
  }
}

/** 수집 파일을 훑어 숫자를 센다 — "수집 완료" 로그가 아니라 이 숫자로 판정한다 (3-A 6번) */
export async function countCollected(
  cardsFile: string,
): Promise<{ players: number; playersWithSeasons: number; seasonRows: number; bySeason: Record<number, number> }> {
  const seen = new Set<string>()
  const withSeasons = new Set<string>()
  const bySeason: Record<number, number> = {}
  let seasonRows = 0
  await readJsonl<SupplySeasonRecord>(cardsFile, (r) => {
    seen.add(r.player_id)
    if (r.raw.length > 0) withSeasons.add(r.player_id)
    for (const row of r.raw) {
      seasonRows += 1
      bySeason[row.season] = (bySeason[row.season] ?? 0) + 1
    }
  })
  return { players: seen.size, playersWithSeasons: withSeasons.size, seasonRows, bySeason }
}

export const supplySeasonsPaths = { refsPath, cardsPath }
