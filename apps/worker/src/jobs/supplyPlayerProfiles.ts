/**
 * 3rd.supply **선수 프로필 값** 수집 — `position` · `note` · `renewed_at` (D-161).
 *
 * ── 왜 따로 받는가
 *   `supplySeasons.ts` 가 이미 `/leagues/{slug}/players/{playerId}` 를 부르고 있었지만
 *   응답에서 `player_id` · `league_player_id` · `player_name` 만 뽑고
 *   **`position` · `note` · `renewed_at` 을 버렸다.** 그래서 이미 받아 둔
 *   `.leagueplayers.jsonl` 29,798 줄에는 그 값이 없다 (`CLAUDE.md` 3-A 1번 위반이었다).
 *   지금부터의 색인은 세 값을 함께 남기지만(같은 파일 `supplySeasons.ts` 를 고쳤다),
 *   **이미 받은 줄은 되살릴 수 없어** 이 잡으로 한 번 더 받는다.
 *
 * ── 왜 리그별이 아니라 전역인가 (실측 2026-08-28)
 *   `position` · `note` · `renewed_at` 은 **리그와 무관한 전역 선수 값**이다.
 *   같은 선수를 supply · sanply · daerule 세 리그에서 조회하면 셋 다 같은 값이 왔다.
 *   그래서 `/players/{playerId}` 를 **선수당 한 번만** 부른다.
 *   리그별 경로로 받으면 21,107명이 29,798요청이 된다 — 8,691요청을 아낀다.
 *
 * ── 실측한 응답 (그대로 옮긴다)
 *   GET /players/1896093983
 *   {"message":"success","data":{
 *     "id":1896093983,"name":"Yolloanswag","clan":null,"note":null,
 *     "position":3,"me":false,"renewed_at":"2026-08-05 06:53:00"}}
 *
 *   **`position` 은 문자열이 아니라 숫자 코드다.** 화면에는 `A 숏` 처럼 나온다.
 *   즉 원본이 코드 → 한글 표기를 매핑해 그린다. 관측된 코드는 `0 1 2 3 4 5 6`.
 *   우리가 화면에서 확인한 매핑은 **`3 = A 숏` 하나뿐**이고 나머지는 `[미확인]` 이다.
 *   코드→표기는 `supplyPlayerProfilesImport.ts` 의 `POSITION_LABELS` 에 모아 두었다.
 *   여기서는 **응답을 그대로** 남긴다 — 표기를 모른다고 코드를 버리지 않는다.
 *
 *   `renewed_at` 은 ISO 가 아니라 `YYYY-MM-DD HH:mm:ss` 다. 시간대 표기가 없다 `[미확인]`.
 *   변환은 적재 쪽이 한다. 여기서는 문자열 그대로 둔다.
 *
 * ── 중단 후 재개 (3-A 4번)
 *   JSONL 에 이미 있는 선수는 건너뛴다. `--dry-run` 은 **요청을 한 건도 보내지 않는다.**
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

/** `/players/{id}` 의 `data` — 실측 그대로. 우리가 쓰지 않는 칸도 버리지 않는다 */
export interface SupplyPlayerProfileRaw {
  id: number
  name: string
  clan: { id: number; name: string; slug: string } | null
  /** 선수 소개/메모. 선수가 직접 쓴다 */
  note: string | null
  /** 포지션 **코드**. 화면 표기는 따로 매핑된다 (`0 1 2 3 4 5 6` 관측) */
  position: number | null
  /** 조회자 본인 여부. 우리는 쓰지 않지만 원본을 자르지 않는다 */
  me?: boolean
  /** `YYYY-MM-DD HH:mm:ss`. 시간대 표기 없음 `[미확인]` */
  renewed_at: string | null
}

export interface SupplyPlayerProfileRecord {
  source: '3rd.supply'
  endpoint: string
  fetched_at: string
  /** 3rd.supply 의 player id (원본 화면 URL 에 쓰이는 값) */
  player_id: string
  /** 응답 `data` 를 **그대로** 담는다 */
  raw: SupplyPlayerProfileRaw | null
}

export interface SupplyPlayerProfilesCheckpoint {
  source: '3rd.supply'
  sourceType: 'public-api'
  note: string
  routes: string[]
  updatedAt: string
  targets: number
  collected: number
  failures: { playerId: string; status: string; at: string }[]
}

const NOTE =
  '3rd.supply 공개 API 를 웹 클라이언트와 같은 앱 헤더(SP-APP-*)로 불러 받았다. ' +
  '선수 프로필(position · note · renewed_at)만 받는다 — 경기·시즌은 이 잡의 범위가 아니다. ' +
  '응답은 raw 로 통째 보존한다. position 은 숫자 코드이고 화면 표기 매핑은 대부분 [미확인] 이다.'

const rowsPath = (base: string) => base.replace(/\.json$/, '.jsonl')

function emptyCheckpoint(): SupplyPlayerProfilesCheckpoint {
  return {
    source: '3rd.supply',
    sourceType: 'public-api',
    note: NOTE,
    routes: ['/players/{playerId}'],
    updatedAt: new Date().toISOString(),
    targets: 0,
    collected: 0,
    failures: [],
  }
}

function readCheckpoint(file: string): SupplyPlayerProfilesCheckpoint {
  if (!existsSync(file)) return emptyCheckpoint()
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as SupplyPlayerProfilesCheckpoint
  } catch {
    warn(`체크포인트를 읽지 못했다 — 새로 만든다 (${file})`)
    return emptyCheckpoint()
  }
}

/** 체크포인트는 **원자적으로** 쓴다. 쓰다 죽으면 다음 실행이 파일을 못 읽는다 */
function writeCheckpoint(file: string, checkpoint: SupplyPlayerProfilesCheckpoint): void {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(checkpoint, null, 2), 'utf8')
  renameSync(tmp, file)
}

/**
 * 대상 — **우리 DB 의 `origin='3rd.supply'` 선수 전원**이다.
 *
 * 넥슨 경로로 들어온 선수(`origin='nexon'`)와 개발 시드(`origin='mock'`)는 대상이 아니다.
 * 원본에 없는 사람을 원본에 물어볼 수 없고, 시드 값을 원본 값으로 덮지도 않는다.
 */
export async function playerProfileTargets(): Promise<string[]> {
  const rows = await prisma.player.findMany({
    where: { origin: '3rd.supply', sourcePlayerId: { not: null } },
    select: { sourcePlayerId: true },
    orderBy: { id: 'asc' },
  })
  const ids = new Set<string>()
  for (const row of rows) {
    if (row.sourcePlayerId) ids.add(row.sourcePlayerId)
  }
  return [...ids]
}

export interface SupplyPlayerProfilesResult {
  file: string
  targets: number
  alreadyDone: number
  newRows: number
  /** 누적 — 응답을 받은 선수 */
  collected: number
  /** 누적 — `position` 이 `null` 이 아닌 선수 */
  withPosition: number
  /** 누적 — `note` 가 `null` 이 아닌 선수 */
  withNote: number
  /** 누적 — 관측된 포지션 코드별 인원 */
  positionCodes: Record<string, number>
  failures: number
  dryRun: boolean
}

const BATCH = 500

export async function runSupplyPlayerProfiles(
  ctx: JobContext,
  input: { file: string; limit?: number | undefined },
): Promise<SupplyPlayerProfilesResult> {
  const { file } = input
  const checkpoint = readCheckpoint(file)
  const rows = rowsPath(file)

  const targets = await playerProfileTargets()
  const done = await readJsonlIds(rows, (r) => r['player_id'] as string | undefined)

  let pending = targets.filter((id) => !done.has(id))
  const alreadyDone = targets.length - pending.length
  if (input.limit !== undefined && input.limit !== null) pending = pending.slice(0, input.limit)

  log(`대상 ${targets.length}명 · 이미 받음 ${alreadyDone}명 · 이번 대상 ${pending.length}명`)

  if (ctx.dryRun) {
    /* 예상 요청 수를 알려 준다. **한 건도 보내지 않는다** */
    log(`--dry-run — 요청을 보내지 않는다. 예상 요청 ${pending.length}건 (선수당 1회)`)
    log(`  동시성 ${SUPPLY_CONCURRENCY}`)
    const stats = await countProfiles(rows)
    return {
      file,
      targets: targets.length,
      alreadyDone,
      newRows: 0,
      collected: stats.collected,
      withPosition: stats.withPosition,
      withNote: stats.withNote,
      positionCodes: stats.positionCodes,
      failures: checkpoint.failures.length,
      dryRun: true,
    }
  }

  let newRows = 0

  for (let offset = 0; offset < pending.length; offset += BATCH) {
    const batch = pending.slice(offset, offset + BATCH)

    const fetched = await supplyMapLimited<string, SupplyPlayerProfileRecord | null>(
      batch,
      async (playerId) => {
        const endpoint = `/players/${playerId}`
        try {
          const res = await supplyGet<SupplyPlayerProfileRaw>(endpoint)
          return {
            source: '3rd.supply' as const,
            endpoint,
            fetched_at: new Date().toISOString(),
            player_id: playerId,
            raw: res.data ?? null,
          }
        } catch (e) {
          if (e instanceof SupplyApiError && e.status === 404) {
            /* 원본에 없는 선수다. **실패가 아니라 사실**이므로 그대로 남기고 넘어간다 —
               다시 물어보지 않기 위해서도 줄을 남긴다 */
            return {
              source: '3rd.supply' as const,
              endpoint,
              fetched_at: new Date().toISOString(),
              player_id: playerId,
              raw: null,
            }
          }
          checkpoint.failures.push({
            playerId,
            status: e instanceof SupplyApiError ? String(e.status) : 'error',
            at: new Date().toISOString(),
          })
          return null
        }
      },
    )

    const ok = fetched.filter((r): r is SupplyPlayerProfileRecord => r !== null)
    appendJsonlMany(rows, ok)
    newRows += ok.length

    checkpoint.updatedAt = new Date().toISOString()
    checkpoint.targets = targets.length
    checkpoint.collected = alreadyDone + newRows
    writeCheckpoint(file, checkpoint)
    log(
      `  진행 ${Math.min(offset + BATCH, pending.length)}/${pending.length} (실패 ${checkpoint.failures.length})`,
    )
  }

  const stats = await countProfiles(rows)
  return {
    file,
    targets: targets.length,
    alreadyDone,
    newRows,
    collected: stats.collected,
    withPosition: stats.withPosition,
    withNote: stats.withNote,
    positionCodes: stats.positionCodes,
    failures: checkpoint.failures.length,
    dryRun: false,
  }
}

/** 수집 파일을 훑어 숫자를 센다 — "수집 완료" 로그가 아니라 이 숫자로 판정한다 (3-A 6번) */
export async function countProfiles(rowsFile: string): Promise<{
  collected: number
  withPosition: number
  withNote: number
  positionCodes: Record<string, number>
}> {
  /* 같은 선수가 두 번 들어갈 수 있다(재시작). **나중 줄이 이긴다** */
  const position = new Map<string, number | null>()
  const note = new Map<string, boolean>()
  await readJsonl<SupplyPlayerProfileRecord>(rowsFile, (r) => {
    position.set(r.player_id, r.raw?.position ?? null)
    note.set(r.player_id, (r.raw?.note ?? null) !== null)
  })

  const positionCodes: Record<string, number> = {}
  let withPosition = 0
  for (const code of position.values()) {
    if (code === null) continue
    withPosition += 1
    positionCodes[String(code)] = (positionCodes[String(code)] ?? 0) + 1
  }
  let withNote = 0
  for (const has of note.values()) if (has) withNote += 1

  return { collected: position.size, withPosition, withNote, positionCodes }
}

export const supplyPlayerProfilesPaths = { rowsPath }
