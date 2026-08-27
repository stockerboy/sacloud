/**
 * 3rd.supply 시즌7 미러링 수집 (D-153).
 *
 * ── 무엇을 고치는 작업인가
 *   예전 스냅샷은 클랜 페이지 **첫 20건만** 받아 갔다(`paginated: false`).
 *   그래서 시즌7 경기 377건이 처음부터 없었다. 이 잡은 **커서를 끝까지** 따라간다.
 *
 *   그리고 K/D/A·딜량·헤드샷·경기 당시 선수별 래더는 **경기 목록에 없다.**
 *   경기 상세에만 있다. 그래서 경기마다 상세를 따로 받는다.
 *   우리 옛 스냅샷의 라인업 행은 `[player_id, 닉네임, 클랜id, weapon]` 뿐이라
 *   K/D 가 저장된 적이 아예 없었다 — 파서 버그가 아니라 수집 범위 문제였다.
 *
 * ── 원본을 버리지 않는다 (`CLAUDE.md` 3-A 1번)
 *   받은 응답을 **그대로** 파일에 쌓는다. 변환은 별도 잡이 한다.
 *   변환 로직이 틀려도 원본에서 다시 만들 수 있어야 한다.
 *
 * ── 중단 후 재개 (3-A 4번)
 *   진행 상황을 같은 파일에 계속 저장한다. 다시 돌리면 이미 받은 것은 건너뛴다.
 *   그래서 이 잡이 그대로 **증분 동기화**가 된다 — 나중에 또 돌리면 새 경기만 받는다.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  SupplyApiError,
  supplyGet,
  supplyPaginate,
  supplyRoutes,
  type SupplyClanShow,
  type SupplyMatchListRow,
  type SupplyLeague,
  type SupplyRankClanRow,
} from '../lib/supplyClient.js'
import { log, warn } from '../lib/log.js'
import type { JobContext } from './context.js'

/** 수집 결과 파일 모양. 원본 응답을 그대로 담는다 */
export interface SupplyMirrorFile {
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
  clans: Record<
    string,
    { leagueClanId: number | null; clanId: number; name: string; division: number; done: boolean; cursor: string | null }
  >
  /** matchId -> 목록 응답 원본 */
  matches: Record<string, SupplyMatchListRow & { _seenFrom: string }>
  /** matchId -> 상세 응답 원본 */
  details: Record<string, unknown>
  failures: { matchId: string; status: string; at: string }[]
}

const NOTE =
  '사람이 승인한 뒤, 웹 클라이언트 공개 앱 헤더(SP-APP-*)를 붙여 사이트 자신의 공개 API를 ' +
  '페이지와 같은 속도로 불러 받았다. 커서를 끝까지 따라갔다 — 예전 스냅샷은 클랜당 첫 20건뿐이었다. ' +
  'packages/db/legacy/collect-snippet.js 의 "헤더 위조 없음" 원칙과는 다르다 (2026-08-27 승인).'

function emptyFile(leagueSlug: string, leagueId: number, floor: string): SupplyMirrorFile {
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
    matches: {},
    details: {},
    failures: [],
  }
}

function read(file: string, leagueSlug: string, leagueId: number, floor: string): SupplyMirrorFile {
  if (!existsSync(file)) return emptyFile(leagueSlug, leagueId, floor)
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as SupplyMirrorFile
  } catch {
    /* 깨진 체크포인트를 조용히 덮어쓰지 않는다 — 사람이 보고 판단해야 한다 */
    throw new Error(`체크포인트 파일을 읽을 수 없다: ${file}`)
  }
}

function write(file: string, state: SupplyMirrorFile): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(state), 'utf8')
}

export interface SupplyMirrorResult {
  clans: number
  matches: number
  details: number
  newMatches: number
  newDetails: number
  failures: number
  range: [string, string] | null
  file: string
}

export async function runSupplyMirror(
  ctx: JobContext,
  input: { leagueSlug: string; leagueId?: number; floor: string; file: string; limit?: number },
): Promise<SupplyMirrorResult> {
  /**
   * 리그 숫자 id 는 slug 로 알아낸다.
   *
   * 다른 경로(`/leagues/{id}/ranks/clans`, `/leagues/{id}/matches/{matchId}`)가
   * **숫자 id** 를 요구하는데, 사람이 아는 건 slug 뿐이다.
   * 리그마다 id 를 손으로 적어 넘기게 하면 언젠가 틀린 리그를 긁는다.
   */
  const leagueId =
    input.leagueId ??
    (await supplyGet<SupplyLeague>(supplyRoutes.league(input.leagueSlug))).data.id

  const state = read(input.file, input.leagueSlug, leagueId, input.floor)
  if (state.leagueId !== leagueId) {
    throw new Error(
      `체크포인트의 리그(${state.leagueId})와 요청한 리그(${leagueId})가 다르다 — 파일을 섞지 않는다: ${input.file}`,
    )
  }
  /* floor 를 바꿔서 다시 돌리면 이미 받은 범위와 섞인다. 파일에 적힌 값을 따른다 */
  if (state.floor !== input.floor) {
    warn(`파일의 floor(${state.floor})와 요청(${input.floor})이 다르다 — 파일 값을 쓴다`)
  }
  const floor = state.floor

  if (ctx.dryRun) {
    log('[dry-run] 요청을 한 건도 보내지 않는다. 현재 체크포인트만 보고한다')
    return summarize(state, input.file, 0, 0)
  }

  const before = { m: Object.keys(state.matches).length, d: Object.keys(state.details).length }

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
    write(input.file, state)
    log(`   클랜 ${Object.keys(state.clans).length}개`)
  }

  /* 2) 클랜별 경기 목록 — floor 를 만날 때까지 커서 끝까지 */
  log('2) 경기 목록')
  const slugs = Object.keys(state.clans)
  for (const [i, slug] of slugs.entries()) {
    const clan = state.clans[slug]
    if (!clan || clan.done) continue

    if (clan.leagueClanId === null) {
      const show = await supplyGet<SupplyClanShow>(supplyRoutes.clanShow(input.leagueSlug, slug))
      clan.leagueClanId = show.data?.id ?? null
      clan.division = show.data?.division ?? clan.division
      write(input.file, state)
    }
    const leagueClanId = clan.leagueClanId
    if (leagueClanId === null) {
      clan.done = true
      write(input.file, state)
      continue
    }

    let added = 0
    let cursor = clan.cursor
    for (;;) {
      const r = await supplyGet<SupplyMatchListRow[]>(supplyRoutes.clanMatches(leagueClanId, cursor))
      const rows = r.data ?? []
      let hitFloor = false
      for (const m of rows) {
        if (String(m.start_at ?? '') < floor) {
          hitFloor = true
          continue
        }
        if (!state.matches[m.id]) {
          /* 어느 클랜 화면에서 봤는지 남긴다. 같은 경기가 양 클랜에 다 나오므로
             나중에 팀 판정을 대조할 수 있다 — D-150 에서 팀 판정으로 크게 데였다 */
          state.matches[m.id] = { ...m, _seenFrom: slug }
          added += 1
        }
      }
      cursor = r.metadata?.cursor?.next ?? null
      clan.cursor = cursor
      write(input.file, state)
      if (hitFloor || cursor === null || rows.length === 0) {
        clan.done = true
        write(input.file, state)
        break
      }
    }
    log(`   ${i + 1}/${slugs.length} ${slug} +${added} (누적 ${Object.keys(state.matches).length})`)
  }

  /* 3) 경기 상세 — 여기에만 K/D/A·딜량·헤드샷·경기 당시 선수별 래더가 있다 */
  const pending = Object.keys(state.matches).filter((id) => !state.details[id])
  const target = input.limit ? pending.slice(0, input.limit) : pending
  log(`3) 경기 상세 ${target.length}건 (전체 미수신 ${pending.length})`)
  for (const [i, matchId] of target.entries()) {
    try {
      const r = await supplyGet<unknown>(supplyRoutes.matchDetail(leagueId, matchId))
      state.details[matchId] = r.data ?? r
    } catch (e) {
      /* 실패를 삼키지 않는다. 무엇이 왜 빠졌는지 남긴다 (3-A 4번) */
      const status = e instanceof SupplyApiError ? String(e.status) : String((e as Error).message)
      state.failures.push({ matchId, status, at: new Date().toISOString() })
    }
    if ((i + 1) % 25 === 0) {
      write(input.file, state)
      log(`   상세 ${i + 1}/${target.length}`)
    }
  }
  write(input.file, state)

  return summarize(
    state,
    input.file,
    Object.keys(state.matches).length - before.m,
    Object.keys(state.details).length - before.d,
  )
}

function summarize(
  state: SupplyMirrorFile,
  file: string,
  newMatches: number,
  newDetails: number,
): SupplyMirrorResult {
  const dates = Object.values(state.matches)
    .map((m) => m.start_at)
    .sort()
  return {
    clans: Object.keys(state.clans).length,
    matches: Object.keys(state.matches).length,
    details: Object.keys(state.details).length,
    newMatches,
    newDetails,
    failures: state.failures.length,
    range: dates.length > 0 ? [dates[0] as string, dates[dates.length - 1] as string] : null,
    file,
  }
}
