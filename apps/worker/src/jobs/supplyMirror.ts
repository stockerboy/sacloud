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
import { prisma } from '@sacloud/db'
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
  /**
   * 클랜랭킹 응답이 그대로 보여 주는 값 (D-157).
   *
   * **원본 화면이 쓰는 바로 그 숫자다.** 경기에서 유추한 값이 아니다.
   * 처음에는 이걸 저장하지 않아서, 경기 기록에서 클랜 점수를 되짚어 만들었더니
   * 원본과 어긋났다 — `saint` 1,525 vs 원본 1,561 처럼.
   *
   * `null` 이면 아직 안 받은 것이다. 0 으로 채우지 않는다.
   */
  rating: number | null
  win: number | null
  lose: number | null
  rank: number | null
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

/**
 * 체크포인트에 이미 적혀 있는 리그 숫자 id 만 훔쳐본다.
 *
 * 이게 없으면 리그 id 를 알아내려고 **`--dry-run` 에서도 요청을 한 건 보낸다.**
 * `--dry-run` 은 "요청을 한 건도 보내지 않는다" 가 약속이다 (`CLAUDE.md` 7장).
 * 파일이 없거나 깨져 있으면 `null` — 그때는 원본에 묻는다.
 */
function peekLeagueId(base: string): number | null {
  if (!existsSync(base)) return null
  try {
    const raw = JSON.parse(readFileSync(base, 'utf8')) as { leagueId?: unknown }
    return typeof raw.leagueId === 'number' && raw.leagueId > 0 ? raw.leagueId : null
  } catch {
    return null
  }
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
  input: {
    leagueSlug: string
    leagueId?: number
    floor: string
    file: string
    limit?: number
    /**
     * 증분 모드 — **새 경기만** 훑는다.
     *
     * 전체 수집이 끝나면 클랜마다 커서가 **가장 오래된 지점**에 멈춰 있다.
     * 그 상태로 다시 돌리면 새 경기를 못 찾는다 — 새 경기는 목록 **맨 앞**에 쌓이는데
     * 커서는 맨 뒤를 보고 있기 때문이다. 그래서 증분에서는 커서를 버리고 맨 앞부터
     * 다시 훑되, **이미 아는 경기를 연속으로 만나면 거기서 멈춘다.**
     *
     * 클랜당 보통 1~2페이지면 끝난다. 자주 돌릴 수 있어야 원본이 멈춰도 우리가 먼저 안다.
     */
    incremental?: boolean
    /**
     * "이미 받은 것" 을 **DB 에서** 읽어 온다 (증분 스케줄러용).
     *
     * 평소에는 `.matches.jsonl` / `.details.jsonl` 이 그 기억을 맡는다. 그런데 그 파일은
     * 세 리그 합쳐 2GB 라 저장소에도 CI 캐시에도 올릴 수 없다 (`.gitignore` D-153).
     * GitHub Actions 처럼 **매번 빈 작업공간에서 시작하는 곳**에서는 아는 경기가 0건이 되고,
     * 그러면 증분이 멈출 줄을 몰라 2년치를 통째로 다시 받는다 — 남의 사이트를 때리는 짓이다.
     *
     * 이미 적재된 경기는 DB(`Match.sourceMatchId`, `origin='3rd.supply'`)가 알고 있다.
     * 그 목록을 "이미 받은 것" 으로 삼으면, 빈 작업공간에서도 **새 경기만** 받고
     * 새로 받은 것만 작은 JSONL 에 쌓인다. 읽기만 한다.
     */
    seenFromDb?: boolean
  },
): Promise<SupplyMirrorResult> {
  const base = input.file

  /**
   * 리그 숫자 id 는 slug 로 알아낸다.
   *
   * 다른 경로(`/leagues/{id}/ranks/clans`, `/leagues/{id}/matches/{matchId}`)가
   * **숫자 id** 를 요구하는데 사람이 아는 건 slug 뿐이다.
   * 리그마다 id 를 손으로 적어 넘기게 하면 언젠가 틀린 리그를 긁는다.
   *
   * 이미 받아 둔 체크포인트에 그 값이 있으면 그것을 쓴다. 그래야 `--dry-run` 이
   * **요청을 한 건도 보내지 않는다.** 체크포인트도 `--league-id` 도 없는 dry-run 은
   * 리그 id 를 모르는 채로 "이미 받은 것" 만 세고 끝낸다 — 지어내지 않는다.
   */
  let leagueId = input.leagueId ?? peekLeagueId(base) ?? 0
  if (leagueId === 0) {
    if (ctx.dryRun) {
      warn('체크포인트도 --league-id 도 없다 — dry-run 이라 리그 id 를 묻지 않는다')
    } else {
      leagueId = (await supplyGet<SupplyLeague>(supplyRoutes.league(input.leagueSlug))).data.id
    }
  }

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

  /* 빈 작업공간(CI)에서도 아는 경기를 알아야 증분이 멈출 줄 안다. 읽기만 한다 */
  if (input.seenFromDb === true) {
    const rows = await prisma.match.findMany({
      where: {
        origin: '3rd.supply',
        sourceMatchId: { not: null },
        league: { slug: input.leagueSlug },
      },
      select: { sourceMatchId: true },
    })
    let added = 0
    for (const row of rows) {
      const id = row.sourceMatchId
      if (id === null || seenMatches.has(id)) continue
      seenMatches.add(id)
      /* DB 에 경기가 있다는 것은 상세까지 판독돼 들어갔다는 뜻이다 —
         적재는 상세가 있는 경기만 만든다(`openSupplyMirrorSource` 의 2차 통과).
         그러니 상세를 다시 받지 않는다 */
      seenDetails.add(id)
      added += 1
    }
    log(`DB 에서 이미 아는 경기 ${rows.length}건 (파일에 없던 것 ${added}건)`)
  }

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

  /* 1) 클랜 목록 — 부리그별로 커서 끝까지.
     **클랜랭킹 응답의 점수·승패·순위도 함께 저장한다.** 원본 화면이 그 값을 쓴다.
     경기에서 되짚어 만들면 어긋난다 (D-157).

     이미 클랜을 받아 뒀어도 점수가 비어 있으면 다시 받는다 — 예전 수집에는 없던 값이다. */
  const clanCount = Object.keys(state.clans).length
  const missingRating = Object.values(state.clans).some((c) => c.rating === undefined || c.rating === null)
  if (clanCount === 0 || missingRating) {
    log(clanCount === 0 ? '1) 클랜 목록' : '1) 클랜 목록 — 점수가 비어 있어 다시 받는다')
    for (const division of [1, 2]) {
      await supplyPaginate<SupplyRankClanRow>(
        (cursor) => supplyRoutes.rankClans(leagueId, division, cursor),
        (rows) => {
          for (const row of rows) {
            const c = row.clan
            if (!c?.slug) continue
            const prev = state.clans[c.slug]
            state.clans[c.slug] = {
              leagueClanId: prev?.leagueClanId ?? null,
              clanId: c.id,
              name: c.name,
              division: row.division ?? division,
              done: prev?.done ?? false,
              cursor: prev?.cursor ?? null,
              /* 원본 클랜랭킹이 보여 주는 값 그대로. 없으면 null — 0 으로 채우지 않는다 */
              rating: row.rating ?? null,
              win: row.win ?? null,
              lose: row.lose ?? null,
              rank: row.rank ?? null,
            }
          }
        },
      )
    }
    writeCheckpoint(base, state)
    const withRating = Object.values(state.clans).filter((c) => c.rating !== null).length
    log(`   클랜 ${Object.keys(state.clans).length}개 · 점수 있음 ${withRating}`)
  }

  /* 2) 클랜별 경기 목록 — 클랜끼리 병렬로 돈다.
     한 클랜이 2년치를 받으려면 페이지가 수백 장이라 순차로는 목록만 수십 분이다. */
  const slugs = Object.keys(state.clans)
  if (input.incremental === true) {
    /* 커서를 버리고 맨 앞부터 다시 훑는다. 새 경기는 목록 앞에 쌓인다 */
    for (const clan of Object.values(state.clans)) {
      clan.done = false
      clan.cursor = null
    }
  }
  const pendingClans = slugs.filter((s) => state.clans[s] && !state.clans[s]?.done)
  log(
    `2) 경기 목록 — 받을 클랜 ${pendingClans.length}/${slugs.length} · 동시 ${SUPPLY_CONCURRENCY}` +
      (input.incremental === true ? ' · 증분(새 경기만)' : ''),
  )

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
    /* 증분에서 "이미 아는 경기만 나온 페이지" 를 몇 장 연속으로 봤는가.
       한 장만 보고 멈추면 위험하다 — 같은 경기가 양 클랜에 나오므로 다른 클랜이
       먼저 받아 둔 경기가 앞쪽에 섞여 있을 수 있다. 두 장 연속이면 따라잡은 것으로 본다 */
    let knownPages = 0
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

      if (input.incremental === true) {
        knownPages = fresh.length === 0 ? knownPages + 1 : 0
        if (knownPages >= 2) {
          /* 따라잡았다. 커서를 비워 둬야 다음 증분도 맨 앞부터 본다 */
          clan.cursor = null
          clan.done = true
          break
        }
      }

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
