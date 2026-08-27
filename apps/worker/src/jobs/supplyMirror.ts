/**
 * 3rd.supply 미러링 수집 (D-153).
 *
 * ── 무엇을 고치는 작업인가
 *   예전 스냅샷은 클랜 페이지 **첫 20건만** 받아 갔다(`paginated: false`).
 *   그래서 시즌7 경기 상당수가 처음부터 없었다. 이 잡은 **커서를 끝까지** 따라간다.
 *
 *   그리고 K/D/A·딜량·헤드샷·경기 당시 선수별 래더는 **경기 목록에 없다.**
 *   경기 상세에만 있다. 그래서 경기마다 상세를 따로 받는다.
 *   우리 옛 스냅샷의 라인업 행은 `[player_id, 닉네임, 클랜id, weapon]` 뿐이라
 *   K/D 가 저장된 적이 아예 없었다 — 파서 버그가 아니라 수집 범위 문제였다.
 *
 * ── 원본을 버리지 않는다 (`CLAUDE.md` 3-A 1번)
 *   받은 응답을 **그대로** 쌓는다. 변환은 별도 잡이 한다.
 *   변환 로직이 틀려도 원본에서 다시 만들 수 있어야 한다.
 *
 * ── 파일을 셋으로 나눈다
 *   처음에는 전부 하나의 `.json` 에 담았다. 2년치로 넓히자 두 가지가 터졌다 —
 *   경기 하나 받을 때마다 60MB 를 다시 쓰느라 **디스크가 네트워크보다 느려졌고**,
 *   상세 13만 건이면 1.5GB 라 **`JSON.parse` 가 죽어 다시 열 수 없는 파일**이 된다.
 *
 *     <base>.json           체크포인트 — 메타·클랜별 커서·실패. 작다. 통째로 쓴다
 *     <base>.matches.jsonl  경기 목록 원본. 한 줄에 하나. 덧붙이기만 한다
 *     <base>.details.jsonl  경기 상세 원본. 같다
 *
 * ── 중단 후 재개 (3-A 4번)
 *   다시 돌리면 이미 받은 것은 건너뛴다. 그래서 이 잡이 그대로 **증분 동기화**가 된다 —
 *   나중에 또 돌리면 새 경기만 받는다.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  SupplyApiError,
  SUPPLY_CONCURRENCY,
  supplyGet,
  supplyMapLimited,
  supplyPaginate,
  supplyRoutes,
  type SupplyClanShow,
  type SupplyLeague,
  type SupplyMatchListRow,
  type SupplyRankClanRow,
} from '../lib/supplyClient.js'
import { appendJsonlMany, readJsonlIds } from '../lib/jsonlStore.js'
import { log, warn } from '../lib/log.js'
import type { JobContext } from './context.js'

export interface SupplyMirrorClan {
  leagueClanId: number | null
  clanId: number
  name: string
  division: number
  done: boolean
  cursor: string | null
}

/** 체크포인트 파일. **데이터는 여기 담지 않는다** — 커지면 못 읽는다 */
export interface SupplyMirrorCheckpoint {
  source: '3rd.supply'
  sourceType: 'public-api'
  note: string
  headersUsed: string[]
  routes: string[]
  capturedAt: string
  leagueSlug: string
  leagueId: number
  /** 이 날짜보다 이전 경기는 받지 않았다 */
  floor: string
  paginated: true
  clans: Record<string, SupplyMirrorClan>
  failures: { matchId: string; status: string; at: string }[]
}

const NOTE =
  '사람이 승인한 뒤, 웹 클라이언트 공개 앱 헤더(SP-APP-*)를 붙여 사이트 자신의 공개 API를 ' +
  '페이지와 같은 속도로 불러 받았다. 커서를 끝까지 따라갔다 — 예전 스냅샷은 클랜당 첫 20건뿐이었다. ' +
  'packages/db/legacy/collect-snippet.js 의 "헤더 위조 없음" 원칙과는 다르다 (2026-08-27 승인).'

const matchesPath = (base: string) => base.replace(/\.json$/, '.matches.jsonl')
const detailsPath = (base: string) => base.replace(/\.json$/, '.details.jsonl')

function emptyCheckpoint(
  leagueSlug: string,
  leagueId: number,
  floor: string,
): SupplyMirrorCheckpoint {
  return {
    source: '3rd.supply',
    sourceType: 'public-api',
    note: NOTE,
    headersUsed: ['SP-APP-TYPE', 'SP-APP-ID', 'SP-APP-VER'],
    routes: [
      '/leagues/{leagueId}/ranks/clans?division=',
      '/leagues/{leagueSlug}/clans/{clanSlug}/show',
      '/leagueclans/{leagueClanId}/matches?cursor=',
      '/leagues/{leagueId}/matches/{matchId}',
    ],
    capturedAt: new Date().toISOString().slice(0, 10),
    leagueSlug,
    leagueId,
    floor,
    paginated: true,
    clans: {},
    failures: [],
  }
}

/**
 * 예전 단일 JSON 을 새 구조로 옮긴다.
 *
 * 이미 받아 둔 수만 건을 버릴 수 없다. 한 번만 돌고, 끝나면 예전 파일을 `.legacy`
 * 로 옮겨 다시 읽지 않게 한다 — **지우지는 않는다** (원본을 버리지 않는다).
 */
function migrateLegacy(base: string): { matches: number; details: number } | null {
  if (!existsSync(base)) return null
  const raw = JSON.parse(readFileSync(base, 'utf8')) as Record<string, unknown>
  const matches = raw['matches'] as Record<string, unknown> | undefined
  const details = raw['details'] as Record<string, unknown> | undefined
  if (matches === undefined && details === undefined) return null

  log('예전 단일 JSON 을 줄 단위 파일로 옮긴다 (한 번만)')
  const matchRows = Object.values(matches ?? {})
  const detailRows = Object.entries(details ?? {}).map(([id, d]) => ({ _matchId: id, ...(d as object) }))
  appendJsonlMany(matchesPath(base), matchRows)
  appendJsonlMany(detailsPath(base), detailRows)

  /* 체크포인트만 남기고 데이터는 뺀다 */
  const checkpoint: SupplyMirrorCheckpoint = {
    ...(raw as unknown as SupplyMirrorCheckpoint),
    clans: (raw['clans'] as Record<string, SupplyMirrorClan>) ?? {},
    failures: (raw['failures'] as SupplyMirrorCheckpoint['failures']) ?? [],
  }
  delete (checkpoint as unknown as Record<string, unknown>)['matches']
  delete (checkpoint as unknown as Record<string, unknown>)['details']
  renameSync(base, `${base}.legacy`)
  writeCheckpoint(base, checkpoint)
  log(`   경기 ${matchRows.length} · 상세 ${detailRows.length} 이관`)
  return { matches: matchRows.length, details: detailRows.length }
}

function readCheckpoint(
  base: string,
  leagueSlug: string,
  leagueId: number,
  floor: string,
): SupplyMirrorCheckpoint {
  if (!existsSync(base)) return emptyCheckpoint(leagueSlug, leagueId, floor)
  try {
    return JSON.parse(readFileSync(base, 'utf8')) as SupplyMirrorCheckpoint
  } catch {
    /* 깨진 체크포인트를 조용히 덮어쓰지 않는다 — 사람이 보고 판단해야 한다 */
    throw new Error(`체크포인트 파일을 읽을 수 없다: ${base}`)
  }
}

function writeCheckpoint(base: string, state: SupplyMirrorCheckpoint): void {
  mkdirSync(dirname(base), { recursive: true })
  writeFileSync(base, JSON.stringify(state, null, 1), 'utf8')
}

export interface SupplyMirrorResult {
  clans: number
  matches: number
  details: number
  newMatches: number
  newDetails: number
  failures: number
  file: string
}

export async function runSupplyMirror(
  ctx: JobContext,
  input: { leagueSlug: string; leagueId?: number; floor: string; file: string; limit?: number },
): Promise<SupplyMirrorResult> {
  const base = input.file

  /**
   * 리그 숫자 id 는 slug 로 알아낸다.
   *
   * 다른 경로(`/leagues/{id}/ranks/clans`, `/leagues/{id}/matches/{matchId}`)가
   * **숫자 id** 를 요구하는데 사람이 아는 건 slug 뿐이다.
   * 리그마다 id 를 손으로 적어 넘기게 하면 언젠가 틀린 리그를 긁는다.
   */
  const leagueId =
    input.leagueId ?? (await supplyGet<SupplyLeague>(supplyRoutes.league(input.leagueSlug))).data.id

  migrateLegacy(base)
  const state = readCheckpoint(base, input.leagueSlug, leagueId, input.floor)
  if (state.leagueId !== leagueId) {
    throw new Error(
      `체크포인트의 리그(${state.leagueId})와 요청한 리그(${leagueId})가 다르다 — 파일을 섞지 않는다: ${base}`,
    )
  }

  /**
   * floor 를 **과거로 넓히는 것**은 허용한다.
   *
   * 클랜은 floor 를 만나면 거기서 멈추고 `done` 이 된다. 그때 커서는 이미 그 다음
   * 페이지를 가리키므로, `done` 만 풀면 **멈춘 지점부터 이어서** 받는다.
   *
   * 반대로 미래로 좁히는 것은 막는다. 이미 받은 과거 경기가 남아 있는데 floor 만
   * 올리면 "이 파일은 이 기간 것" 이라는 기록이 거짓이 된다.
   */
  let floor = state.floor
  if (input.floor < state.floor) {
    log(`floor 를 과거로 넓힌다: ${state.floor} → ${input.floor}`)
    for (const clan of Object.values(state.clans)) clan.done = false
    state.floor = input.floor
    floor = input.floor
    writeCheckpoint(base, state)
  } else if (input.floor > state.floor) {
    warn(`요청 floor(${input.floor})가 파일(${state.floor})보다 늦다 — 파일 값을 쓴다`)
  }

  /* 이미 받은 id 만 읽는다. 본문은 들고 있지 않는다 — 13만 건을 메모리에 올릴 이유가 없다 */
  const seenMatches = await readJsonlIds(matchesPath(base), (r) =>
    r['id'] === undefined ? undefined : String(r['id']),
  )
  const seenDetails = await readJsonlIds(detailsPath(base), (r) =>
    r['_matchId'] === undefined ? undefined : String(r['_matchId']),
  )
  log(`이미 받은 것 — 경기 ${seenMatches.size} · 상세 ${seenDetails.size}`)

  if (ctx.dryRun) {
    log('[dry-run] 요청을 한 건도 보내지 않는다')
    return {
      clans: Object.keys(state.clans).length,
      matches: seenMatches.size,
      details: seenDetails.size,
      newMatches: 0,
      newDetails: 0,
      failures: state.failures.length,
      file: base,
    }
  }

  const before = { m: seenMatches.size, d: seenDetails.size }

  /* 1) 클랜 목록 — 부리그별로 커서 끝까지 */
  if (Object.keys(state.clans).length === 0) {
    log('1) 클랜 목록')
    for (const division of [1, 2]) {
      await supplyPaginate<SupplyRankClanRow>(
        (cursor) => supplyRoutes.rankClans(leagueId, division, cursor),
        (rows) => {
          for (const row of rows) {
            const c = row.clan
            if (!c?.slug) continue
            state.clans[c.slug] ??= {
              leagueClanId: null,
              clanId: c.id,
              name: c.name,
              division: row.division ?? division,
              done: false,
              cursor: null,
            }
          }
        },
      )
    }
    writeCheckpoint(base, state)
    log(`   클랜 ${Object.keys(state.clans).length}개`)
  }

  /* 2) 클랜별 경기 목록 — 클랜끼리 병렬로 돈다.
     한 클랜이 2년치를 받으려면 페이지가 수백 장이라 순차로는 목록만 수십 분이다. */
  const slugs = Object.keys(state.clans)
  const pendingClans = slugs.filter((s) => state.clans[s] && !state.clans[s]?.done)
  log(`2) 경기 목록 — 받을 클랜 ${pendingClans.length}/${slugs.length} · 동시 ${SUPPLY_CONCURRENCY}`)

  await supplyMapLimited(pendingClans, async (slug) => {
    const clan = state.clans[slug]
    if (!clan) return

    if (clan.leagueClanId === null) {
      const show = await supplyGet<SupplyClanShow>(supplyRoutes.clanShow(input.leagueSlug, slug))
      clan.leagueClanId = show.data?.id ?? null
      clan.division = show.data?.division ?? clan.division
    }
    const leagueClanId = clan.leagueClanId
    if (leagueClanId === null) {
      clan.done = true
      return
    }

    let added = 0
    let cursor = clan.cursor
    for (;;) {
      const r = await supplyGet<SupplyMatchListRow[]>(supplyRoutes.clanMatches(leagueClanId, cursor))
      const rows = r.data ?? []
      let hitFloor = false
      const fresh: unknown[] = []
      for (const m of rows) {
        if (String(m.start_at ?? '') < floor) {
          hitFloor = true
          continue
        }
        if (!seenMatches.has(String(m.id))) {
          seenMatches.add(String(m.id))
          /* 어느 클랜 화면에서 봤는지 남긴다. 같은 경기가 양 클랜에 다 나오므로
             나중에 팀 판정을 대조할 수 있다 — D-150 에서 팀 판정으로 크게 데였다 */
          fresh.push({ ...m, _seenFrom: slug })
          added += 1
        }
      }
      /* 덧붙이기만 한다. 전체를 다시 쓰지 않는다 */
      appendJsonlMany(matchesPath(base), fresh)
      cursor = r.metadata?.cursor?.next ?? null
      clan.cursor = cursor
      if (hitFloor || cursor === null || rows.length === 0) {
        clan.done = true
        break
      }
    }
    /* 체크포인트는 클랜이 끝났을 때만 쓴다 */
    writeCheckpoint(base, state)
    log(`   ${slug} +${added} (누적 ${seenMatches.size})`)
  })
  writeCheckpoint(base, state)

  /* 3) 경기 상세 — 여기에만 K/D/A·딜량·헤드샷·경기 당시 선수별 래더가 있다 */
  const pending = [...seenMatches].filter((id) => !seenDetails.has(id))
  const target = input.limit ? pending.slice(0, input.limit) : pending
  log(`3) 경기 상세 ${target.length}건 · 동시 ${SUPPLY_CONCURRENCY}`)

  /* 모아서 쓴다. 한 건씩 덧붙이면 파일 열기/닫기가 그만큼 늘어난다 */
  let buffer: unknown[] = []
  const flush = () => {
    appendJsonlMany(detailsPath(base), buffer)
    buffer = []
  }

  await supplyMapLimited(
    target,
    async (matchId) => {
      try {
        const r = await supplyGet<Record<string, unknown>>(
          supplyRoutes.matchDetail(leagueId, matchId),
        )
        buffer.push({ _matchId: matchId, ...(r.data ?? r) })
        seenDetails.add(matchId)
      } catch (e) {
        /* 실패를 삼키지 않는다. 무엇이 왜 빠졌는지 남긴다 (3-A 4번) */
        const status = e instanceof SupplyApiError ? String(e.status) : String((e as Error).message)
        state.failures.push({ matchId, status, at: new Date().toISOString() })
      }
    },
    (done) => {
      if (buffer.length >= 200) flush()
      if (done % 1000 === 0) {
        flush()
        writeCheckpoint(base, state)
      }
      if (done % 500 === 0) log(`   상세 ${done}/${target.length}`)
    },
  )
  flush()
  writeCheckpoint(base, state)

  return {
    clans: Object.keys(state.clans).length,
    matches: seenMatches.size,
    details: seenDetails.size,
    newMatches: seenMatches.size - before.m,
    newDetails: seenDetails.size - before.d,
    failures: state.failures.length,
    file: base,
  }
}
