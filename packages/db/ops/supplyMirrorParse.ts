/**
 * 3rd.supply 미러링 수집 파일 → 우리 도메인 모양 (D-153).
 *
 * ── 이 파일의 경계
 *   **순수 함수만 있다. DB 를 모른다.** 수집 파일 한 건을 받아 우리가 쓰는 모양으로
 *   바꿔 주기만 한다. 쓰기는 `supplyMirrorImport.ts` 가 한다.
 *   변환 규칙이 틀렸다고 판명돼도 원본 파일에서 다시 만들 수 있어야 하기 때문에
 *   여기서는 아무것도 지우지 않고, 판독하지 못한 것은 **사유와 함께 남긴다**.
 *
 * ── 진영(red/blue) ↔ 클랜을 무엇으로 잇는가  ← 이 파일에서 가장 중요한 부분
 *   수집 파일의 경기 목록 항목은 **보는 쪽(`_seenFrom` 클랜) 기준**이다.
 *   `win` · `rating_update` · `opponent` 가 전부 그 클랜 시점의 값이라 절대값이 아니다.
 *   반면 경기 상세는 `red` / `blue` 라는 **진영**으로 온다.
 *   그래서 "`_seenFrom` 클랜이 어느 진영이었나" 를 정해야 둘이 이어진다.
 *
 *   서로 독립인 근거 두 개를 쓴다.
 *     (1) 목록의 `blue_team` — true 면 `_seenFrom` 클랜이 블루다
 *     (2) 상세 참가자의 `win` — 진영별로 값이 균일하고 서로 반대다.
 *         목록의 `win`(=`_seenFrom` 기준)과 같은 쪽이 `_seenFrom` 클랜의 진영이다
 *
 *   둘 다 있고 일치할 때만 `both` 로 확정한다. 하나만 있으면 그 근거를 적어 두고 쓴다.
 *   **둘이 어긋나면 잇지 않는다 — 클랜을 null 로 두고 경기를 버린다.**
 *   팀 판정을 추측으로 메웠다가 크게 데인 적이 있다 (D-150).
 *
 *   실측(2026-08-27): daerule 612건 · supply 4891건 · sanply 3250건 전부
 *   (1)과 (2)가 **한 건도 어긋나지 않았다.**
 *
 * ── 원본이 주는 `rating` 과 `clan` 은 **경기 당시 값이 아니다** (실측 2026-08-27)
 *   상세의 선수 `rating` 은 그 경기의 값이 아니라 **원본 화면이 그 자리에 표시하는 값** —
 *   수집 시점의 현재 래더다. 근거:
 *     · daerule 612경기 — 한 선수의 162경기에서 `rating` distinct 값이 **1개**
 *     · sanply 11983경기 — 2967명 중 값이 바뀐 사람이 225명(7.6%)뿐이고,
 *       그건 **수집이 몇 시간에 걸쳐 돌아가는 동안** 현재 래더가 움직였기 때문이다
 *   같은 이유로 참가자의 `clan` 도 현재 소속이다 — 두 파일 합쳐 3322명 중
 *   경기별로 소속이 달라진 사람이 **0명**이었다. 3개월치라면 이적이 있어야 정상이다.
 *   목록의 `opponent.rating` · `opponent.division` · `opponent.placement` 도 클랜별로
 *   값이 하나뿐이라 같은 성격이다.
 *
 *   반면 `rating_update`(증감)와 참가자 `placement` 는 경기마다 다르다 — 이쪽은 진짜다.
 *   **`sourceRating` 계열을 래더 재현 입력으로 쓰면 안 된다.** 원본 화면 재현용이다.
 *
 * ── 없는 값은 null 이다
 *   K/D/A·딜량·헤드샷·무기는 원본이 주지 않으면 `null` 이다. **0 으로 채우지 않는다**
 *   (`CLAUDE.md` 3-A 8번 · D-034 · D-148). `kd_rate` · `damage_percent` 같은
 *   파생값은 아예 저장하지 않는다 — 우리가 다시 계산할 수 있다 (D-002).
 */

/* ── 수집 파일 모양 (apps/worker/src/jobs/supplyMirror.ts 가 쓴 그대로) ──────────
   `packages/db` 는 `apps/worker` 를 import 하지 않는다(패키지 경계).
   그래서 필요한 부분만 여기에 **구조적으로** 다시 적는다. */

export interface SupplyClanRefRaw {
  id: number
  name: string
  slug: string
  mark_bg?: string | null
  mark_front?: string | null
}

export interface SupplyPlayerRefRaw {
  id: number | null
  name: string | null
  clan?: SupplyClanRefRaw | null
}

export interface SupplyMatchListRaw {
  id: string
  map?: string | null
  mvp_player_id?: number | null
  player_count?: number | null
  start_at?: string | null
  end_at?: string | null
  play_time?: string | null
  /** `_seenFrom` 클랜의 래더 증감이다. 절대값이 아니다 */
  rating_update?: number | null
  /** `_seenFrom` 클랜이 이겼는가 */
  win?: boolean | null
  /** `_seenFrom` 클랜이 블루 진영이었는가 */
  blue_team?: boolean | null
  /** `_seenFrom` 클랜이 배치고사 중이었는가 */
  placement?: boolean | null
  opponent?: {
    id?: number | null
    rating?: number | null
    division?: number | null
    placement?: boolean | null
    clan?: SupplyClanRefRaw | null
  } | null
  summary?: {
    red?: { player?: SupplyPlayerRefRaw | null; weapon?: number | null }[] | null
    blue?: { player?: SupplyPlayerRefRaw | null; weapon?: number | null }[] | null
  } | null
  /** 어느 클랜 화면에서 본 경기인가 (수집기가 붙인 값) */
  _seenFrom?: string | null
}

export interface SupplyMatchDetailRowRaw {
  player?: SupplyPlayerRefRaw | null
  kill?: number | null
  death?: number | null
  assist?: number | null
  headshot?: number | null
  damage?: number | null
  win?: boolean | null
  dropout?: boolean | null
  weapon?: number | null
  /** 원본 화면이 그 자리에 표시하는 **선수** 래더 (수집 시점 현재 값 — 경기 당시가 아니다) */
  rating?: number | null
  /** 그 경기의 선수 래더 증감 */
  rating_update?: number | null
  placement?: boolean | null
}

export interface SupplyMatchDetailRaw {
  red?: SupplyMatchDetailRowRaw[] | null
  blue?: SupplyMatchDetailRowRaw[] | null
}

export interface SupplyMirrorFileLike {
  leagueSlug: string
  leagueId: number
  capturedAt?: string | null
  floor?: string | null
  clans?: Record<
    string,
    {
      leagueClanId?: number | null
      clanId?: number | null
      name?: string | null
      division?: number | null
      /** 지금 수집기는 저장하지 않는다. 저장되면 그대로 쓴다 (D-155 후속) */
      rating?: number | null
    }
  > | null
  matches: Record<string, SupplyMatchListRaw>
  details?: Record<string, SupplyMatchDetailRaw | null | undefined> | null
}

/* ── 판독 결과 ────────────────────────────────────────────────────────────── */

export interface ParsedSupplyClan {
  /** 3rd.supply 클랜 id (문자열로 보관한다 — 우리 컬럼이 문자열이다) */
  sourceClanId: string
  name: string
  slug: string
  markBgUrl: string | null
  markFrontUrl: string | null
  /** 수집 파일의 클랜 목록에 있으면 그 값. 없으면 null */
  division: number | null
  /** 3rd.supply 의 league_clan id. 목록에 없으면 null */
  sourceLeagueClanId: string | null
  /**
   * 원본 화면이 보여 주는 **클랜 점수** (D-155 후속).
   *
   * `sourceRating` 과 같은 성질이다 — **경기 당시 값이 아니라 수집 시점의 현재 값**이다.
   * 클랜별로 값이 하나뿐인 것으로 실측 확인했다(daerule 16개 클랜 전부 distinct 1).
   * 래더 재현 입력으로 쓰지 않는다. 원본 화면 재현·클랜 점수 복원용이다.
   *
   * 출처는 둘이다.
   *   · 경기 목록의 `opponent.rating` — 그 클랜이 **누군가의 상대**로 나온 행
   *   · 수집 파일 클랜 목록의 `rating` — 있으면 그쪽이 더 넓다(리그 전체 클랜을 덮는다)
   * 둘 다 없으면 null 이다. **지어내지 않는다.**
   */
  rating: number | null
}

export type SupplySide = 'red' | 'blue'

/** 진영↔클랜을 무엇으로 이었는가. 근거를 값으로 남긴다 */
export type SupplySideEvidence = 'both' | 'blue_team' | 'participant_win'

export interface ParsedSupplyParticipant {
  sourcePlayerId: string
  name: string | null
  side: SupplySide
  kill: number | null
  death: number | null
  assist: number | null
  headshot: number | null
  damage: number | null
  /** 0 = 라이플, 1 = 스나이퍼 */
  weapon: number | null
  dropout: boolean | null
  /** 원본이 mvp_player_id 를 주지 않으면 null (모른다) */
  mvp: boolean | null
  win: boolean | null
  /** 그 경기에서 이 선수가 배치고사 중이었는가 */
  placement: boolean | null
  /**
   * 원본 화면이 그 자리에 표시하는 선수 래더.
   * **경기 당시 값이 아니라 수집 시점의 현재 래더다** (위 파일 머리말의 실측 참조).
   * 원본 화면 재현용이며 래더 계산 입력으로 쓰지 않는다.
   */
  sourceRating: number | null
  /** 3rd.supply 의 그 경기 증감. 원본값 그대로다 (3-A 2번) */
  sourceRatingDelta: number | null
  /**
   * 원본이 그 선수 자리에 붙여 주는 소속. 무소속이면 null.
   * 이것도 **수집 시점 현재 소속**이다 — 이적한 사람의 과거 경기에는 틀린 값이 된다.
   */
  clan: ParsedSupplyClan | null
}

export interface ParsedSupplyMatch {
  sourceMatchId: string
  leagueSlug: string
  mapName: string | null
  startAt: Date | null
  endAt: Date | null
  /**
   * 플레이 시간(초). 원본은 `"19분 46초"` 같은 문자열이다.
   * 원본 `end_at` 이 분 단위로 잘려 있어 **음수**가 나오는 경기가 있다.
   * 음수는 실제 경기 시간이 아니므로 null 로 두고 `playTimeNegative` 로 센다
   * (우리 계약 `Count` 가 0 이상만 허용하기도 한다).
   */
  playTime: number | null
  /** 원본 문자열을 그대로 판독한 값. 음수도 그대로다 (대조용) */
  playTimeParsed: number | null
  playTimeNegative: boolean
  playerCount: number | null
  mvpSourcePlayerId: string | null

  /** 근거가 없으면 null 이다. **지어내지 않는다** */
  redClan: ParsedSupplyClan | null
  blueClan: ParsedSupplyClan | null
  sideEvidence: SupplySideEvidence | null
  /** `_seenFrom` 클랜이 앉았던 진영. 근거가 없으면 null */
  seenSide: SupplySide | null
  seenClanSlug: string | null

  redDivision: number | null
  blueDivision: number | null
  redPlacement: boolean | null
  bluePlacement: boolean | null

  /**
   * 원본이 보여 주는 **클랜** 점수. 절반만 온다 —
   * 목록은 상대 클랜의 `rating` 과 보는 쪽의 `rating_update` 만 준다.
   * 나머지 두 칸은 원본에 없으므로 null 이다.
   * 여기서도 `rating` 은 **수집 시점 현재 값**이고 `rating_update` 만 그 경기의 증감이다.
   */
  redSourceRating: number | null
  blueSourceRating: number | null
  redSourceRatingUpdate: number | null
  blueSourceRatingUpdate: number | null

  winnerSide: SupplySide | null
  participants: ParsedSupplyParticipant[]
  /** 판독 중 눈에 걸린 것. 숫자로 세어 사람이 본다 */
  warnings: string[]
}

export interface ParsedSupplyFile {
  leagueSlug: string
  leagueId: number
  capturedAt: Date | null
  /** 파일 전체에서 모은 클랜 사전 (마크까지 갖춘 것을 고른다) */
  clans: ParsedSupplyClan[]
  matches: ParsedSupplyMatch[]
  /** 판독하지 못한 경기 — 사유별로 남긴다. 조용히 버리지 않는다 */
  unparsed: { sourceMatchId: string; reason: string }[]
}

/* ── 작은 판독기들 ─────────────────────────────────────────────────────────── */

const DURATION = /(-?\d+)\s*(시간|분|초)/g

/**
 * `"19분 46초"` → 1186 · `"58초"` → 58 · `"-14초"` → -14.
 * 단위를 하나도 못 찾으면 null 이다 — 0 으로 만들지 않는다.
 */
export function parsePlayTimeSeconds(text: string | null | undefined): number | null {
  if (typeof text !== 'string') return null
  DURATION.lastIndex = 0
  let total = 0
  let found = false
  for (;;) {
    const hit = DURATION.exec(text)
    if (!hit) break
    const value = Number(hit[1])
    if (!Number.isFinite(value)) continue
    found = true
    total += hit[2] === '시간' ? value * 3600 : hit[2] === '분' ? value * 60 : value
  }
  return found ? total : null
}

/**
 * `"2026-07-25 21:39:28"` → UTC Date.
 *
 * 원본 표기는 KST 다. 우리는 UTC 로 저장한다 (기존 `startAtFromMatchId` 와 같은 규칙).
 * 모양이 다르면 **추측하지 않고** null 이다.
 */
export function parseSupplyDateTime(text: string | null | undefined): Date | null {
  if (typeof text !== 'string') return null
  const hit = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(text.trim())
  if (!hit) return null
  const [, y, mo, d, h, mi, s] = hit
  const date = new Date(
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h) - 9, Number(mi), Number(s ?? '0')),
  )
  return Number.isNaN(date.getTime()) ? null : date
}

function intOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null
}

function boolOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function idOrNull(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value))
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  return null
}

function toClanRef(raw: SupplyClanRefRaw | null | undefined): ParsedSupplyClan | null {
  const sourceClanId = idOrNull(raw?.id)
  if (!raw || !sourceClanId || !raw.slug) return null
  return {
    sourceClanId,
    name: raw.name ?? raw.slug,
    slug: raw.slug,
    markBgUrl: raw.mark_bg ?? null,
    markFrontUrl: raw.mark_front ?? null,
    division: null,
    sourceLeagueClanId: null,
    rating: null,
  }
}

/** 클랜 사전 — slug → 클랜. 수만 건을 흘려 읽으면서도 **이것만** 메모리에 남는다 */
export type SupplyClanDirectory = Map<string, ParsedSupplyClan>

/**
 * 클랜 하나를 사전에 보탠다. **빈 칸만 메우고 이미 있는 값은 덮지 않는다.**
 *
 * 같은 클랜이 상대팀 항목·참가자 소속·클랜 목록 세 군데에 나오는데,
 * 마크 URL 은 앞의 두 곳에만 있고 division 과 league_clan id 는 클랜 목록에만 있다.
 * 한 곳만 보면 항상 뭔가가 빈다 — 그래서 합친다.
 */
export function absorbClanRef(
  directory: SupplyClanDirectory,
  candidate: ParsedSupplyClan | null,
): void {
  if (!candidate) return
  const kept = directory.get(candidate.slug)
  if (!kept) {
    directory.set(candidate.slug, { ...candidate })
    return
  }
  kept.markBgUrl ??= candidate.markBgUrl
  kept.markFrontUrl ??= candidate.markFrontUrl
  kept.division ??= candidate.division
  kept.sourceLeagueClanId ??= candidate.sourceLeagueClanId
  kept.rating ??= candidate.rating
}

/** 경기 목록 한 줄에서 클랜을 거둔다 (상대팀 + 요약 라인업의 소속) */
export function absorbClansFromMatchRow(
  directory: SupplyClanDirectory,
  row: SupplyMatchListRaw,
): void {
  /**
   * 상대팀 항목에는 **그 클랜의 점수와 부리그**가 붙어 있다 (D-155 후속).
   *
   * 이걸 사전에 모아 두면, 같은 클랜이 **자기 화면에서 본 경기**(그 행에는 자기 점수가 없다)
   * 에서도 점수를 채울 수 있다. 한 클랜의 점수는 파일 전체에서 하나뿐이라 안전하다.
   */
  const opponent = toClanRef(row.opponent?.clan)
  if (opponent) {
    opponent.rating = intOrNull(row.opponent?.rating)
    opponent.division = intOrNull(row.opponent?.division)
  }
  absorbClanRef(directory, opponent)
  for (const entry of [...(row.summary?.red ?? []), ...(row.summary?.blue ?? [])]) {
    absorbClanRef(directory, toClanRef(entry?.player?.clan))
  }
}

/** 경기 상세 한 건에서 클랜을 거둔다 (참가자 소속) */
export function absorbClansFromDetail(
  directory: SupplyClanDirectory,
  detail: SupplyMatchDetailRaw,
): void {
  for (const entry of [...(detail.red ?? []), ...(detail.blue ?? [])]) {
    absorbClanRef(directory, toClanRef(entry?.player?.clan))
  }
}

/**
 * 수집 파일의 **클랜 목록**을 얹는다.
 * division 과 league_clan id 는 여기에만 있다. key 가 곧 slug 다.
 */
export function absorbClanList(
  directory: SupplyClanDirectory,
  clans: SupplyMirrorFileLike['clans'],
): void {
  for (const [slug, entry] of Object.entries(clans ?? {})) {
    const kept = directory.get(slug)
    if (kept) {
      kept.division ??= intOrNull(entry?.division)
      kept.sourceLeagueClanId ??= idOrNull(entry?.leagueClanId)
      /* 수집 파일의 클랜 목록에 점수가 있으면 그것도 쓴다.
         지금 수집기는 이 값을 저장하지 않지만, 저장하는 순간 여기서 자동으로 잡힌다 */
      kept.rating ??= intOrNull((entry as { rating?: number | null } | undefined)?.rating)
      continue
    }
    const sourceClanId = idOrNull(entry?.clanId)
    if (!sourceClanId) continue
    directory.set(slug, {
      sourceClanId,
      name: entry?.name ?? slug,
      slug,
      markBgUrl: null,
      markFrontUrl: null,
      division: intOrNull(entry?.division),
      sourceLeagueClanId: idOrNull(entry?.leagueClanId),
      rating: intOrNull((entry as { rating?: number | null } | undefined)?.rating),
    })
  }
}

/** 파일 전체(예전 단일 JSON)에서 클랜 사전을 만든다 */
export function buildClanDirectory(file: SupplyMirrorFileLike): SupplyClanDirectory {
  const bySlug: SupplyClanDirectory = new Map()
  for (const row of Object.values(file.matches ?? {})) absorbClansFromMatchRow(bySlug, row)
  for (const detail of Object.values(file.details ?? {})) {
    if (detail) absorbClansFromDetail(bySlug, detail)
  }
  absorbClanList(bySlug, file.clans)
  return bySlug
}

/** 한 진영의 참가자 승패가 균일하면 그 값. 갈리거나 비었으면 null */
function sideWin(rows: SupplyMatchDetailRowRaw[]): boolean | null {
  let value: boolean | null = null
  for (const row of rows) {
    const win = boolOrNull(row.win)
    if (win === null) return null
    if (value === null) value = win
    else if (value !== win) return null
  }
  return value
}

export interface SupplySideResolution {
  seenSide: SupplySide | null
  evidence: SupplySideEvidence | null
  /** 근거가 어긋났는가 — 어긋나면 잇지 않는다 */
  conflict: boolean
}

/**
 * `_seenFrom` 클랜이 어느 진영이었는지 정한다.
 *
 * 근거 두 개가 어긋나면 **아무것도 정하지 않는다.** 둘 중 하나를 고르지 않는다 —
 * 어느 쪽이 맞는지 우리가 알 방법이 없기 때문이다.
 */
export function resolveSeenSide(
  row: SupplyMatchListRaw,
  detail: SupplyMatchDetailRaw,
): SupplySideResolution {
  const fromFlag: SupplySide | null =
    typeof row.blue_team === 'boolean' ? (row.blue_team ? 'blue' : 'red') : null

  let fromWin: SupplySide | null = null
  const listWin = boolOrNull(row.win)
  const redWin = sideWin(detail.red ?? [])
  const blueWin = sideWin(detail.blue ?? [])
  if (listWin !== null && redWin !== null && blueWin !== null && redWin !== blueWin) {
    fromWin = redWin === listWin ? 'red' : 'blue'
  }

  if (fromFlag && fromWin) {
    if (fromFlag !== fromWin) return { seenSide: null, evidence: null, conflict: true }
    return { seenSide: fromFlag, evidence: 'both', conflict: false }
  }
  if (fromFlag) return { seenSide: fromFlag, evidence: 'blue_team', conflict: false }
  if (fromWin) return { seenSide: fromWin, evidence: 'participant_win', conflict: false }
  return { seenSide: null, evidence: null, conflict: false }
}

function toParticipants(
  rows: SupplyMatchDetailRowRaw[],
  side: SupplySide,
  mvpSourcePlayerId: string | null,
  warnings: string[],
): ParsedSupplyParticipant[] {
  const out: ParsedSupplyParticipant[] = []
  for (const row of rows) {
    const sourcePlayerId = idOrNull(row.player?.id)
    if (!sourcePlayerId) {
      /* 선수 id 가 없으면 우리 쪽에서 누구인지 정할 근거가 없다. 지어내지 않는다 */
      warnings.push('participant_without_player_id')
      continue
    }
    out.push({
      sourcePlayerId,
      name: row.player?.name ?? null,
      side,
      kill: intOrNull(row.kill),
      death: intOrNull(row.death),
      assist: intOrNull(row.assist),
      headshot: intOrNull(row.headshot),
      damage: intOrNull(row.damage),
      weapon: intOrNull(row.weapon),
      dropout: boolOrNull(row.dropout),
      /* 원본이 MVP 를 지목했으면 나머지는 "MVP 가 아니다" 라는 **사실**이다.
         지목 자체가 없으면 모르는 것이라 전부 null 이다 (D-034) */
      mvp: mvpSourcePlayerId === null ? null : mvpSourcePlayerId === sourcePlayerId,
      win: boolOrNull(row.win),
      placement: boolOrNull(row.placement),
      sourceRating: intOrNull(row.rating),
      sourceRatingDelta: intOrNull(row.rating_update),
      clan: toClanRef(row.player?.clan),
    })
  }
  return out
}

export interface ParseSupplyMatchOptions {
  leagueSlug: string
  /** `buildClanDirectory` 결과. 마크·division 을 여기서 보충한다 */
  clans?: Map<string, ParsedSupplyClan>
}

/**
 * 경기 한 건 판독. 이을 근거가 없으면 **null 로 두고 표시하지 않는다.**
 */
export function parseSupplyMatch(
  sourceMatchId: string,
  row: SupplyMatchListRaw,
  detail: SupplyMatchDetailRaw,
  options: ParseSupplyMatchOptions,
): ParsedSupplyMatch {
  const warnings: string[] = []
  const directory = options.clans ?? new Map<string, ParsedSupplyClan>()

  const mvpSourcePlayerId = idOrNull(row.mvp_player_id)
  const red = toParticipants(detail.red ?? [], 'red', mvpSourcePlayerId, warnings)
  const blue = toParticipants(detail.blue ?? [], 'blue', mvpSourcePlayerId, warnings)

  const { seenSide, evidence, conflict } = resolveSeenSide(row, detail)
  if (conflict) warnings.push('side_evidence_conflict')
  if (!seenSide) warnings.push('side_unresolved')

  const seenClanSlug = row._seenFrom ?? null
  const seenClan = seenClanSlug ? (directory.get(seenClanSlug) ?? null) : null
  if (seenClanSlug && !seenClan) warnings.push('seen_clan_not_in_file')

  const opponentRaw = toClanRef(row.opponent?.clan)
  const opponentClan = opponentRaw
    ? (directory.get(opponentRaw.slug) ?? opponentRaw)
    : null
  if (!opponentClan) warnings.push('opponent_clan_missing')

  const opponentDivision = intOrNull(row.opponent?.division) ?? opponentClan?.division ?? null
  const seenDivision = seenClan?.division ?? null

  /* 진영이 정해졌을 때만 클랜을 앉힌다. 정해지지 않았으면 양쪽 다 null 이다 */
  const seenIsRed = seenSide === 'red'
  const linked = seenSide !== null
  const redClan = linked ? (seenIsRed ? seenClan : opponentClan) : null
  const blueClan = linked ? (seenIsRed ? opponentClan : seenClan) : null

  const listRatingUpdate = intOrNull(row.rating_update)
  /**
   * 클랜 점수는 **양쪽 다 채운다** (D-155 후속).
   *
   * 경기 목록 한 행에는 상대 클랜 점수만 들어 있다. 예전에는 그것만 넣어서
   * **자기 화면에서만 보인 클랜은 점수가 한 번도 안 채워졌다** — 실측으로 12개 클랜이
   * `LeagueClan.rating` 기본값 3000 에 남아 800~1700대 리그에서 가짜 1위가 됐다.
   *
   * 그래서 보는 쪽 점수는 **파일 전체에서 모은 클랜 사전**에서 가져온다.
   * 그 클랜이 다른 경기에서 누군가의 상대로 나왔으면 거기에 점수가 적혀 있다.
   * 한 클랜의 점수는 파일 안에서 하나뿐이라(수집 시점 현재값) 섞일 위험이 없다.
   *
   * 어디에도 없으면 **null 이다.** 상대 점수를 자기 점수로 돌려쓰지 않는다.
   */
  const opponentRating = intOrNull(row.opponent?.rating) ?? opponentClan?.rating ?? null
  const seenRating = seenClan?.rating ?? null
  const seenPlacement = boolOrNull(row.placement)
  const opponentPlacement = boolOrNull(row.opponent?.placement)

  const redWin = sideWin(detail.red ?? [])
  const blueWin = sideWin(detail.blue ?? [])
  const winnerSide: SupplySide | null =
    redWin !== null && blueWin !== null && redWin !== blueWin ? (redWin ? 'red' : 'blue') : null
  if (!winnerSide) warnings.push('winner_unresolved')

  const playTimeParsed = parsePlayTimeSeconds(row.play_time)
  const playTimeNegative = playTimeParsed !== null && playTimeParsed < 0
  if (playTimeNegative) warnings.push('play_time_negative')

  return {
    sourceMatchId,
    leagueSlug: options.leagueSlug,
    mapName: row.map ?? null,
    startAt: parseSupplyDateTime(row.start_at),
    endAt: parseSupplyDateTime(row.end_at),
    playTime: playTimeNegative ? null : playTimeParsed,
    playTimeParsed,
    playTimeNegative,
    playerCount: intOrNull(row.player_count),
    mvpSourcePlayerId,

    redClan,
    blueClan,
    sideEvidence: linked ? evidence : null,
    seenSide,
    seenClanSlug,

    redDivision: linked ? (seenIsRed ? seenDivision : opponentDivision) : null,
    blueDivision: linked ? (seenIsRed ? opponentDivision : seenDivision) : null,
    redPlacement: linked ? (seenIsRed ? seenPlacement : opponentPlacement) : null,
    bluePlacement: linked ? (seenIsRed ? opponentPlacement : seenPlacement) : null,

    /* 점수는 양쪽 다 채운다 (위 주석 참조).
       증감(`rating_update`)은 **보는 쪽 것만** 원본에 있다 — 상대 증감은 어디에도 없다 */
    redSourceRating: linked ? (seenIsRed ? seenRating : opponentRating) : null,
    blueSourceRating: linked ? (seenIsRed ? opponentRating : seenRating) : null,
    redSourceRatingUpdate: linked ? (seenIsRed ? listRatingUpdate : null) : null,
    blueSourceRatingUpdate: linked ? (seenIsRed ? null : listRatingUpdate) : null,

    winnerSide,
    participants: [...red, ...blue],
    warnings,
  }
}

export interface ParseSupplyFileOptions {
  /** 앞에서부터 N 건만 (점검용). 정렬은 경기 시작 시각 오름차순이다 */
  limit?: number | null
}

/**
 * 수집 파일 전체 판독.
 *
 * 상세가 없는 경기는 **넣지 않는다.** 참가자를 모르는 경기를 만들면
 * 나중에 그 경기가 "참가자 0명" 으로 남아 통계를 오염시킨다.
 * 대신 사유(`detail_missing`)와 함께 세어 보고한다.
 */
export function parseSupplyMirrorFile(
  file: SupplyMirrorFileLike,
  options: ParseSupplyFileOptions = {},
): ParsedSupplyFile {
  const clans = buildClanDirectory(file)
  const matches: ParsedSupplyMatch[] = []
  const unparsed: { sourceMatchId: string; reason: string }[] = []

  /* 오래된 것부터 처리한다 — 중단 후 다시 돌려도 같은 순서다 */
  const ids = Object.keys(file.matches ?? {}).sort()
  for (const id of ids) {
    const row = file.matches[id]
    if (!row) continue
    const detail = file.details?.[id]
    if (!detail || (!detail.red && !detail.blue)) {
      unparsed.push({ sourceMatchId: id, reason: 'detail_missing' })
      continue
    }
    matches.push(parseSupplyMatch(id, row, detail, { leagueSlug: file.leagueSlug, clans }))
  }

  matches.sort((a, b) => (a.sourceMatchId < b.sourceMatchId ? -1 : a.sourceMatchId > b.sourceMatchId ? 1 : 0))

  return {
    leagueSlug: file.leagueSlug,
    leagueId: file.leagueId,
    capturedAt: file.capturedAt ? parseSupplyDateTime(`${file.capturedAt} 00:00:00`) : null,
    clans: [...clans.values()],
    matches: options.limit && options.limit > 0 ? matches.slice(0, options.limit) : matches,
    unparsed,
  }
}

/* ── 판독 결과 요약 (숫자 대조용) ──────────────────────────────────────────── */

export interface ParsedSupplySummary {
  matches: number
  unparsed: number
  unparsedByReason: Record<string, number>
  participants: number
  /** 진영↔클랜을 이은 경기 / 잇지 못한 경기 */
  sideLinked: number
  sideUnlinked: number
  sideEvidence: Record<string, number>
  tenParticipants: number
  incompleteParticipants: number
  kdaComplete: number
  weaponComplete: number
  damageComplete: number
  headshotComplete: number
  sourceRatingComplete: number
  playTimeNull: number
  playTimeNegative: number
  endAtNull: number
  mvpNull: number
  warnings: Record<string, number>
}

export function createSupplySummary(): ParsedSupplySummary {
  return {
    matches: 0,
    unparsed: 0,
    unparsedByReason: {},
    participants: 0,
    sideLinked: 0,
    sideUnlinked: 0,
    sideEvidence: {},
    tenParticipants: 0,
    incompleteParticipants: 0,
    kdaComplete: 0,
    weaponComplete: 0,
    damageComplete: 0,
    headshotComplete: 0,
    sourceRatingComplete: 0,
    playTimeNull: 0,
    playTimeNegative: 0,
    endAtNull: 0,
    mvpNull: 0,
    warnings: {},
  }
}

/**
 * 경기 한 건을 요약에 보탠다.
 *
 * 흘려 읽는 경로(JSONL)는 판독 결과를 배열로 들고 있을 수 없다 — 13만 건이다.
 * 그래서 한 건씩 세고 버린다. 배열을 받는 `summarizeParsedSupply` 도 이 함수를 쓴다.
 */
export function countParsedMatch(summary: ParsedSupplySummary, match: ParsedSupplyMatch): void {
  summary.matches += 1
  summary.participants += match.participants.length
  if (match.redClan && match.blueClan) summary.sideLinked += 1
  else summary.sideUnlinked += 1
  if (match.sideEvidence) {
    summary.sideEvidence[match.sideEvidence] = (summary.sideEvidence[match.sideEvidence] ?? 0) + 1
  }
  if (match.participants.length === 10) summary.tenParticipants += 1
  else summary.incompleteParticipants += 1
  if (match.playTime === null) summary.playTimeNull += 1
  if (match.playTimeNegative) summary.playTimeNegative += 1
  if (match.endAt === null) summary.endAtNull += 1
  if (match.mvpSourcePlayerId === null) summary.mvpNull += 1
  for (const warning of match.warnings) {
    summary.warnings[warning] = (summary.warnings[warning] ?? 0) + 1
  }

  const all = match.participants
  const every = (pick: (p: ParsedSupplyParticipant) => unknown): boolean =>
    all.length > 0 && all.every((p) => pick(p) !== null)
  if (every((p) => (p.kill === null || p.death === null || p.assist === null ? null : 1))) {
    summary.kdaComplete += 1
  }
  if (every((p) => p.weapon)) summary.weaponComplete += 1
  if (every((p) => p.damage)) summary.damageComplete += 1
  if (every((p) => p.headshot)) summary.headshotComplete += 1
  if (every((p) => p.sourceRating)) summary.sourceRatingComplete += 1
}

/** 판독하지 못한 경기를 사유별로 센다. **조용히 버리지 않는다** */
export function countUnparsed(
  summary: ParsedSupplySummary,
  reason: string,
  count = 1,
): void {
  if (count <= 0) return
  summary.unparsed += count
  summary.unparsedByReason[reason] = (summary.unparsedByReason[reason] ?? 0) + count
}

export function summarizeParsedSupply(parsed: ParsedSupplyFile): ParsedSupplySummary {
  const summary = createSupplySummary()
  for (const row of parsed.unparsed) countUnparsed(summary, row.reason)
  for (const match of parsed.matches) countParsedMatch(summary, match)
  return summary
}

/* ── 판독 결과를 **흘려** 넘기는 통로 ──────────────────────────────────────── */

/**
 * 판독된 경기를 한 건씩 흘려 주는 원본.
 *
 * 예전 단일 JSON 은 통째로 읽어도 되지만(수 MB), 새 JSONL 은 경기 13만 건이라
 * 배열로 들고 있을 수 없다. 두 포맷이 **같은 통로**로 나오게 해서
 * 적재 쪽(`supplyMirrorImport`)이 포맷을 몰라도 되게 한다.
 */
export interface ParsedSupplySource {
  leagueSlug: string
  leagueId: number
  capturedAt: Date | null
  /** 클랜 사전. 이것만은 전부 메모리에 있어도 된다 (수백 건) */
  clans: ParsedSupplyClan[]
  /** 판독된 경기를 한 건씩. **여러 번 호출하지 않는다** (파일을 다시 읽는다) */
  matches: () => AsyncIterable<ParsedSupplyMatch>
  /**
   * 판독하지 못한 경기의 사유별 건수.
   * 흘려 읽는 원본은 **다 흘려 본 뒤에야** 채워진다 — 읽는 시점에 주의한다.
   */
  unparsed: Record<string, number>
}

/** 이미 통째로 읽어 둔 결과를 같은 통로에 얹는다 (예전 단일 JSON 경로) */
export function sourceFromParsedFile(parsed: ParsedSupplyFile): ParsedSupplySource {
  const unparsed: Record<string, number> = {}
  for (const row of parsed.unparsed) unparsed[row.reason] = (unparsed[row.reason] ?? 0) + 1
  return {
    leagueSlug: parsed.leagueSlug,
    leagueId: parsed.leagueId,
    capturedAt: parsed.capturedAt,
    clans: parsed.clans,
    unparsed,
    matches: async function* () {
      for (const match of parsed.matches) yield match
    },
  }
}
