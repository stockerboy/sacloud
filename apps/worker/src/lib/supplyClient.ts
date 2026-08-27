/**
 * 3rd.supply 공개 API 클라이언트 (D-153).
 *
 * ── 이 클라이언트가 무엇을 하는가
 *   3rd.supply 가 자기 화면을 그릴 때 부르는 **공개 API** 를 같은 방식으로 부른다.
 *   웹 클라이언트가 붙이는 앱 헤더(`SP-APP-*`)를 함께 보낸다. 없으면 403 이다.
 *   이 값들은 웹 번들에 박힌 **공개 앱 식별자**다 — 사용자 인증 토큰도 비밀값도 아니다.
 *
 * ── 지키는 것
 *   요청 간 간격(기본 130ms) · 429/5xx 지수 백오프 · 동시성 1.
 *   페이지가 사람 손에 움직일 때보다 빠르게 때리지 않는다.
 *
 * ── 지키지 않는 것 (숨기지 않고 적는다)
 *   `packages/db/legacy/collect-snippet.js` 는 "API 우회·헤더 위조 없음" 을 지켰다.
 *   이 클라이언트는 앱 헤더를 붙인다. SSR payload 만 읽으면 클랜당 첫 20건뿐이고,
 *   그게 시즌7 경기 377건이 빠진 원인이었다 — 그 방식으로는 미러링이 성립하지 않는다.
 *   사용자 승인 후 이 방식으로 정했다 (2026-08-27).
 */

/** 웹 클라이언트가 API 에 붙이는 헤더. 페이지 자신의 요청을 관찰해 옮겨 적었다 */
const APP_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/plain, */*',
  'SP-APP-TYPE': 'web',
  'SP-APP-ID': process.env['SUPPLY_APP_ID'] ?? 'ba206eb8-df91-4499-aa6d-f31738ea7e43',
  'SP-APP-VER': process.env['SUPPLY_APP_VER'] ?? '3.1.0',
}

const BASE = process.env['SUPPLY_API_BASE_URL'] ?? 'https://api-v2.3rd.supply'

/** 요청 간격(ms). 사이트를 때리지 않기 위한 값이다. 함부로 줄이지 않는다 */
const DELAY_MS = Number(process.env['SUPPLY_DELAY_MS'] ?? 130)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface SupplyCursor {
  next: string | null
  prev: string | null
}

export interface SupplyEnvelope<T> {
  message: string
  data: T
  metadata?: { cursor?: SupplyCursor }
}

export class SupplyApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
  ) {
    super(`${status} ${path}`)
    this.name = 'SupplyApiError'
  }
}

/**
 * 공개 API 한 번.
 *
 * 429/5xx 는 **물러선다.** 실패를 삼키지 않고 그대로 올린다 — 무엇이 왜 빠졌는지
 * 호출한 쪽이 기록할 수 있어야 한다 (`CLAUDE.md` 3-A 4번).
 */
export async function supplyGet<T>(path: string, tries = 0): Promise<SupplyEnvelope<T>> {
  const res = await fetch(`${BASE}${path}`, { headers: APP_HEADERS })

  if (res.status === 429 || res.status >= 500) {
    if (tries >= 5) throw new SupplyApiError(res.status, path)
    /* 지수 백오프. 사이트가 밀어내면 우리가 물러선다 */
    await sleep(Math.min(30_000, 1000 * 2 ** tries))
    return supplyGet<T>(path, tries + 1)
  }

  if (res.status === 403) {
    /* 앱 버전이 올라가면 헤더 값이 달라진다. 그때 무엇을 해야 하는지 남긴다 */
    throw new SupplyApiError(
      403,
      `${path} — 앱 헤더가 낡았을 수 있다. 브라우저에서 페이지 요청 헤더를 다시 확인하고 SUPPLY_APP_ID / SUPPLY_APP_VER 로 넘긴다`,
    )
  }

  if (!res.ok) throw new SupplyApiError(res.status, path)

  await sleep(DELAY_MS)
  return (await res.json()) as SupplyEnvelope<T>
}

/**
 * 여러 건을 **제한된 동시성**으로 가져온다.
 *
 * 경기 상세는 경기당 1요청이라 순차로 돌리면 2년치가 몇 시간이다.
 * 그렇다고 한꺼번에 던지면 남의 사이트를 때리는 것이다.
 * 동시에 도는 수를 정해 두고 그 안에서만 겹치게 한다 (기본 6).
 *
 * `SUPPLY_CONCURRENCY` 로 조절한다. **올리기 전에 429 가 나는지 먼저 본다.**
 */
export const SUPPLY_CONCURRENCY = Number(process.env['SUPPLY_CONCURRENCY'] ?? 6)

export async function supplyMapLimited<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  onDone?: (completed: number) => void,
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  let completed = 0

  const lanes = Array.from({ length: Math.min(SUPPLY_CONCURRENCY, items.length) }, async () => {
    for (;;) {
      const i = next
      next += 1
      if (i >= items.length) return
      const item = items[i] as T
      out[i] = await worker(item, i)
      completed += 1
      onDone?.(completed)
    }
  })

  await Promise.all(lanes)
  return out
}

/** 커서를 끝까지 따라간다. `stop` 이 true 를 주면 거기서 멈춘다 */
export async function supplyPaginate<T>(
  buildPath: (cursor: string | null) => string,
  onPage: (rows: T[]) => { stop: boolean } | void,
): Promise<void> {
  let cursor: string | null = null
  for (;;) {
    const r: SupplyEnvelope<T[]> = await supplyGet<T[]>(buildPath(cursor))
    const rows = r.data ?? []
    const verdict = onPage(rows)
    cursor = r.metadata?.cursor?.next ?? null
    if (verdict?.stop === true || cursor === null || rows.length === 0) return
  }
}

/* ── 응답 모양 (실측 2026-08-27) ────────────────────────────────────────────── */

export interface SupplyClanRef {
  id: number
  name: string
  slug: string
  mark_bg: string | null
  mark_front: string | null
}

export interface SupplyRankClanRow {
  rank: number
  rating: number
  division: number
  win: number
  lose: number
  win_rate: number
  clan: SupplyClanRef
}

/** 경기 목록 한 줄. **K/D/A 는 여기 없다** — 상세에만 있다 */
export interface SupplyMatchListRow {
  id: string
  map: string
  mvp_player_id: number | null
  player_count: number
  start_at: string
  end_at: string | null
  play_time: string | null
  rating_update: number | null
  win: boolean
  blue_team: boolean | null
  placement: boolean
  opponent: { id: number; rating: number; division: number; placement: boolean; clan: SupplyClanRef }
  summary?: { red: { player: { id: number; name: string; clan: SupplyClanRef | null } ; weapon: number | null }[]; blue: { player: { id: number; name: string; clan: SupplyClanRef | null }; weapon: number | null }[] }
}

/** 클랜 페이지의 `show` 응답 — `id` 가 경기 목록 호출에 쓰는 leagueClanId 다 */
export interface SupplyClanShow {
  id: number
  rating: number
  division: number
  win: number
  lose: number
  clan: SupplyClanRef
}

/** `/leagues/{slug}` 응답 — 여기서 숫자 `id` 를 얻어 다른 경로에 쓴다 */
export interface SupplyLeague {
  id: number
  name: string
  slug: string
  clan_count: number
  division_count: number
}

export const supplyRoutes = {
  league: (leagueSlug: string) => `/leagues/${leagueSlug}`,
  rankClans: (leagueId: number, division: number, cursor: string | null) =>
    `/leagues/${leagueId}/ranks/clans?division=${division}` +
    (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''),
  clanShow: (leagueSlug: string, clanSlug: string) => `/leagues/${leagueSlug}/clans/${clanSlug}/show`,
  clanMatches: (leagueClanId: number, cursor: string | null) =>
    `/leagueclans/${leagueClanId}/matches` + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''),
  matchDetail: (leagueId: number, matchId: string) => `/leagues/${leagueId}/matches/${matchId}`,
} as const
