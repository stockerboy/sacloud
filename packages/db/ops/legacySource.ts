/**
 * 과거 시즌 기록 **읽기** 계층 (Phase 11-F).
 *
 * 여기에는 DB가 없다. 입력 파일 → 정규화된 행. 그게 전부다.
 * 그래서 3rd.supply 페이지 구조가 바뀌어도 importer 본체는 손대지 않는다 (정책 22).
 *
 * 지원 입력
 *   - 사용자가 정상 브라우저로 저장한 HTML   (`supplyPc-state` 스크립트에서 API 응답 원문을 꺼낸다)
 *   - 그 JSON을 그대로 저장한 파일
 *   - 운영자가 준 CSV / JSON               (열 이름만 맞춰 주면 된다)
 *
 * 원칙 하나: **원본에 없는 값은 만들지 않는다.** 전부 `null`로 남긴다 (D-099).
 * 승률·킬뎃은 승패로 계산할 수 있지만 계산하지 않는다. 원본이 준 값만 쓴다.
 */

/** 한 선수의 한 시즌. 어느 입력에서 왔든 결국 이 모양이 된다 */
export interface LegacySeasonRow {
  season: number
  /** 3rd.supply `player.id` — 닉네임 대신 이걸로 사람을 가른다 (D-100) */
  legacyPlayerId: string
  /** 3rd.supply `leaguePlayer.id` — 시즌 카드의 원본 키 */
  legacyLeaguePlayerId: string | null
  nickname: string | null
  rank: number | null
  rankCount: number | null
  win: number | null
  lose: number | null
  winRate: number | null
  kill: number | null
  death: number | null
  kdRate: number | null
  rating: number | null
  assist: number | null
  headshot: number | null
  killPerMatch: number | null
  mvpCount: number | null
  clanName: string | null
  division: number | null
  source: string
}

/** 파싱 결과. 못 읽은 건 조용히 버리지 않고 이유를 들고 나온다 */
export interface LegacyParseResult {
  rows: LegacySeasonRow[]
  warnings: string[]
}

const SOURCE_SUPPLY = '3rd.supply'

function toInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

function toFloat(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

/* ------------------------------------------------------- HTML → JSON --- */

/**
 * 저장된 HTML에서 Angular TransferState 덩어리를 꺼낸다.
 *
 * 3rd.supply는 SSR이라 페이지 HTML 안에
 * `<script id="supplyPc-state" type="application/json">{...}</script>` 형태로
 * **API 응답 원문**이 그대로 들어 있다. 그래서 HTML 파싱이 아니라 JSON 파싱으로 끝난다.
 */
export function extractStatePayload(html: string): unknown | null {
  const match = /<script[^>]*id=["']?supplyPc-state["']?[^>]*>([\s\S]*?)<\/script>/i.exec(html)
  if (!match?.[1]) return null
  try {
    return JSON.parse(match[1].trim())
  } catch {
    return null
  }
}

/* --------------------------------------------- 3rd.supply state 페이로드 --- */

interface SupplySeasonEntry {
  id?: unknown
  season?: unknown
  rank?: unknown
  rank_count?: unknown
  win?: unknown
  lose?: unknown
  win_rate?: unknown
  kill?: unknown
  death?: unknown
  kd_rate?: unknown
}

interface SupplyCurrentEntry {
  id?: unknown
  rating?: unknown
  win?: unknown
  lose?: unknown
  win_rate?: unknown
  kill?: unknown
  death?: unknown
  assist?: unknown
  headshot?: unknown
  kd_rate?: unknown
  kill_per_match?: unknown
  mvp_count?: unknown
  rank?: unknown
  rank_count?: unknown
  player?: { id?: unknown; name?: unknown; clan?: { name?: unknown } | null }
}

/** state 객체는 "API URL → 응답" 사전이다. 찾는 응답을 URL 모양으로 고른다 */
function pickByUrl(state: Record<string, unknown>, test: (url: string) => boolean): unknown {
  for (const [url, body] of Object.entries(state)) {
    if (test(url)) return body
  }
  return null
}

function unwrap(body: unknown): unknown {
  if (body && typeof body === 'object' && 'data' in (body as Record<string, unknown>)) {
    return (body as { data: unknown }).data
  }
  return body
}

/**
 * 저장된 선수 페이지 하나에서 그 선수의 시즌 카드를 전부 뽑는다.
 *
 * 두 응답을 합친다.
 *   `/leagueplayers/{id}/seasons`   **종료된** 시즌의 확정값 (rank·승패·킬데스)
 *   `/leagues/{slug}/players/{id}`  **진행 중** 시즌의 현재값 (rating·평균킬·MVP·소속)
 *
 * 진행 중 시즌은 `seasons`에 아직 없다. 그래서 시즌 마감 직전에 뜬 현재값을
 * `currentSeason`으로 지정해 주면 그 번호의 카드로 만들어 준다 (정책 13).
 */
export function fromSupplyState(
  payload: unknown,
  options: { currentSeason?: number } = {},
): LegacyParseResult {
  const warnings: string[] = []
  if (!payload || typeof payload !== 'object') {
    return { rows: [], warnings: ['state 페이로드를 읽을 수 없다'] }
  }
  const state = payload as Record<string, unknown>

  const seasonsBody = unwrap(pickByUrl(state, (url) => /\/leagueplayers\/[^/]+\/seasons/.test(url)))
  const currentBody = unwrap(pickByUrl(state, (url) => /\/leagues\/[^/]+\/players\/[^/]+$/.test(url)))
  const current = (currentBody ?? null) as SupplyCurrentEntry | null

  const legacyPlayerId = toText(current?.player?.id)
  const nickname = toText(current?.player?.name)
  const legacyLeaguePlayerId = toText(current?.id)
  const clanName = toText(current?.player?.clan?.name ?? null)

  if (!legacyPlayerId) {
    return { rows: [], warnings: ['선수 식별자(player.id)가 없어 이 파일은 건너뛴다'] }
  }

  const rows: LegacySeasonRow[] = []

  /* 1) 종료된 시즌 — 확정값 그대로 */
  const seasons = Array.isArray(seasonsBody) ? (seasonsBody as SupplySeasonEntry[]) : []
  for (const entry of seasons) {
    const season = toInt(entry.season)
    if (season === null) {
      warnings.push(`시즌 번호가 없는 카드를 건너뛴다 (선수 ${legacyPlayerId})`)
      continue
    }
    rows.push({
      season,
      legacyPlayerId,
      legacyLeaguePlayerId: toText(entry.id) ?? legacyLeaguePlayerId,
      nickname,
      rank: toInt(entry.rank),
      rankCount: toInt(entry.rank_count),
      win: toInt(entry.win),
      lose: toInt(entry.lose),
      winRate: toFloat(entry.win_rate),
      kill: toInt(entry.kill),
      death: toInt(entry.death),
      kdRate: toFloat(entry.kd_rate),
      // 종료된 시즌 카드에는 아래가 없다. 억지로 만들지 않는다
      rating: null,
      assist: null,
      headshot: null,
      killPerMatch: null,
      mvpCount: null,
      clanName: null,
      division: null,
      source: SOURCE_SUPPLY,
    })
  }

  /* 2) 진행 중 시즌 — 마감 직전에 떠 둔 현재값 */
  if (options.currentSeason !== undefined && current) {
    rows.push({
      season: options.currentSeason,
      legacyPlayerId,
      legacyLeaguePlayerId,
      nickname,
      rank: toInt(current.rank),
      rankCount: toInt(current.rank_count),
      win: toInt(current.win),
      lose: toInt(current.lose),
      winRate: toFloat(current.win_rate),
      kill: toInt(current.kill),
      death: toInt(current.death),
      kdRate: toFloat(current.kd_rate),
      rating: toInt(current.rating),
      assist: toInt(current.assist),
      headshot: toInt(current.headshot),
      killPerMatch: toFloat(current.kill_per_match),
      mvpCount: toInt(current.mvp_count),
      clanName,
      division: null,
      source: SOURCE_SUPPLY,
    })
  }

  return { rows, warnings }
}

/** 저장된 HTML 한 장 → 시즌 카드들 */
export function fromSupplyHtml(
  html: string,
  options: { currentSeason?: number } = {},
): LegacyParseResult {
  const payload = extractStatePayload(html)
  if (payload === null) {
    return { rows: [], warnings: ['supplyPc-state 스크립트를 찾지 못했다'] }
  }
  return fromSupplyState(payload, options)
}

/* ------------------------------------------------------------ CSV/JSON --- */

/**
 * 운영자가 준 CSV. 열 이름은 바뀔 수 있으므로 **매핑을 주입**받는다.
 * 기본 매핑은 3rd.supply API 필드명을 그대로 쓴다.
 */
export const DEFAULT_CSV_MAPPING = {
  season: 'season',
  legacyPlayerId: 'player_id',
  legacyLeaguePlayerId: 'league_player_id',
  nickname: 'name',
  rank: 'rank',
  rankCount: 'rank_count',
  win: 'win',
  lose: 'lose',
  winRate: 'win_rate',
  kill: 'kill',
  death: 'death',
  kdRate: 'kd_rate',
  rating: 'rating',
  assist: 'assist',
  headshot: 'headshot',
  killPerMatch: 'kill_per_match',
  mvpCount: 'mvp_count',
  clanName: 'clan',
  division: 'division',
} as const

export type CsvMapping = Partial<Record<keyof typeof DEFAULT_CSV_MAPPING, string>>

/** 따옴표와 쉼표를 다루는 최소 CSV 분해 */
function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      cells.push(cell)
      cell = ''
    } else cell += char
  }
  cells.push(cell)
  return cells.map((value) => value.trim())
}

export function fromCsv(text: string, mapping: CsvMapping = {}): LegacyParseResult {
  const warnings: string[] = []
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
  if (lines.length < 2) return { rows: [], warnings: ['CSV에 데이터 줄이 없다'] }

  const columns = { ...DEFAULT_CSV_MAPPING, ...mapping }
  const header = splitCsvLine(lines[0] ?? '')
  const indexOf = (name: string) => header.indexOf(name)

  const rows: LegacySeasonRow[] = []
  for (const [offset, line] of lines.slice(1).entries()) {
    const cells = splitCsvLine(line)
    const cell = (key: keyof typeof columns) => {
      const index = indexOf(columns[key])
      return index < 0 ? null : (cells[index] ?? null)
    }
    const season = toInt(cell('season'))
    const legacyPlayerId = toText(cell('legacyPlayerId'))
    if (season === null || !legacyPlayerId) {
      warnings.push(`${offset + 2}번째 줄: season 또는 player_id가 없어 건너뛴다`)
      continue
    }
    rows.push({
      season,
      legacyPlayerId,
      legacyLeaguePlayerId: toText(cell('legacyLeaguePlayerId')),
      nickname: toText(cell('nickname')),
      rank: toInt(cell('rank')),
      rankCount: toInt(cell('rankCount')),
      win: toInt(cell('win')),
      lose: toInt(cell('lose')),
      winRate: toFloat(cell('winRate')),
      kill: toInt(cell('kill')),
      death: toInt(cell('death')),
      kdRate: toFloat(cell('kdRate')),
      rating: toInt(cell('rating')),
      assist: toInt(cell('assist')),
      headshot: toInt(cell('headshot')),
      killPerMatch: toFloat(cell('killPerMatch')),
      mvpCount: toInt(cell('mvpCount')),
      clanName: toText(cell('clanName')),
      division: toInt(cell('division')),
      source: SOURCE_SUPPLY,
    })
  }
  return { rows, warnings }
}

/** 이미 정규화된 JSON 배열 (우리 형식 그대로) */
export function fromJsonRows(payload: unknown): LegacyParseResult {
  const warnings: string[] = []
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { rows?: unknown } | null)?.rows)
      ? ((payload as { rows: unknown[] }).rows)
      : null
  if (!list) return { rows: [], warnings: ['JSON이 배열도 {rows:[]}도 아니다'] }

  const rows: LegacySeasonRow[] = []
  for (const [index, item] of list.entries()) {
    const entry = item as Record<string, unknown>
    const season = toInt(entry.season)
    const legacyPlayerId = toText(entry.legacyPlayerId ?? entry.player_id)
    if (season === null || !legacyPlayerId) {
      warnings.push(`${index}번 항목: season 또는 legacyPlayerId가 없어 건너뛴다`)
      continue
    }
    rows.push({
      season,
      legacyPlayerId,
      legacyLeaguePlayerId: toText(entry.legacyLeaguePlayerId ?? entry.league_player_id),
      nickname: toText(entry.nickname ?? entry.name),
      rank: toInt(entry.rank),
      rankCount: toInt(entry.rankCount ?? entry.rank_count),
      win: toInt(entry.win),
      lose: toInt(entry.lose),
      winRate: toFloat(entry.winRate ?? entry.win_rate),
      kill: toInt(entry.kill),
      death: toInt(entry.death),
      kdRate: toFloat(entry.kdRate ?? entry.kd_rate),
      rating: toInt(entry.rating),
      assist: toInt(entry.assist),
      headshot: toInt(entry.headshot),
      killPerMatch: toFloat(entry.killPerMatch ?? entry.kill_per_match),
      mvpCount: toInt(entry.mvpCount ?? entry.mvp_count),
      clanName: toText(entry.clanName ?? entry.clan),
      division: toInt(entry.division),
      source: toText(entry.source) ?? SOURCE_SUPPLY,
    })
  }
  return { rows, warnings }
}

/* ------------------------------------------------------------- 합치기 --- */

/**
 * 같은 (선수, 시즌) 카드가 여러 파일에서 나오면 합친다.
 *
 * 시즌 마감 **직전** 파일(rating·평균킬·MVP 보유)과 마감 **직후** 파일(확정 rank·승패)을
 * 하나의 Season 7 카드로 만드는 것이 이 함수의 존재 이유다 (정책 13).
 *
 * 규칙: 뒤에 오는 값이 `null`이면 앞의 값을 지우지 않는다. **채우기만 한다.**
 */
export function mergeRows(rows: LegacySeasonRow[]): LegacySeasonRow[] {
  const merged = new Map<string, LegacySeasonRow>()
  for (const row of rows) {
    const key = `${row.legacyPlayerId}#${row.season}`
    const previous = merged.get(key)
    if (!previous) {
      merged.set(key, { ...row })
      continue
    }
    const next = { ...previous }
    for (const field of Object.keys(row) as (keyof LegacySeasonRow)[]) {
      const value = row[field]
      if (value !== null && value !== undefined) {
        // @ts-expect-error 같은 키에 같은 타입이 들어간다
        next[field] = value
      }
    }
    merged.set(key, next)
  }
  return [...merged.values()].sort(
    (left, right) => left.season - right.season || left.legacyPlayerId.localeCompare(right.legacyPlayerId),
  )
}
