import { prisma } from '@sacloud/db'
import {
  clanAliasesOf,
  isBarracksUrl,
  playerRefsFromBarracksUrl,
  searchClanNames,
  type ClanSummary,
  type GameMap,
  type LeagueSummary,
  type PlayerSearchItem,
} from '@sacloud/contract'
import {
  CLAN_SUMMARY_SELECT,
  LEAGUE_SUMMARY_SELECT,
  toClanSummary,
  toClanSummaryOrNull,
  toLeagueSummary,
} from '../mappers'
import { publicOriginWhere } from './publicScope'

/**
 * 통합검색 (플레이어 · 클랜 · 리그).
 *
 * Mock의 `store.ts`(`findXByName` / `searchX`)와 **같은 결과**를 내야 한다.
 * - `name/{name}` 은 **정확일치** 1건. 검색어를 그대로 제출했을 때 쓴다.
 * - `search/{q}` 는 **부분일치** 자동완성. 최대 10건.
 * - 빈 검색어는 조회하지 않고 빈 배열을 준다 (Mock과 동일).
 *
 * 정렬 기준 컬럼이 따로 없어 **고유 키(id) 오름차순**으로 고정한다 — 같은 검색어에 항상 같은 순서다.
 *
 * ── 대소문자를 구분하지 않는다
 *   예전에는 `contains` 기본값(대소문자 구분)을 썼다. JS `String.includes` 와 결과를
 *   맞추려던 것인데, **검색이 사실상 동작하지 않았다.** 사용자가 `Huwho` 를 넣었는데
 *   저장된 이름이 `huwho` 라 0건이 나왔다 (실측: `Huwho` 0건 · `huwho` 1건).
 *   닉네임을 사람이 손으로 치는 화면에서 이건 결함이다.
 *
 *   원본이 정확히 어떤 조건인지는 **[미확인]** 이다. 다만 "친 대로 안 나오면 안 된다"는
 *   쪽이 원본 동작에 더 가깝다고 보고 대소문자 무시로 정했다.
 *   Mock 쪽(`packages/mock`)도 같은 규칙으로 맞춰 두 모드의 응답이 어긋나지 않게 했다.
 */

/** 자동완성 노출 건수 (Mock 기본값과 동일). 원본의 실제 상한은 [미확인] */
const SEARCH_LIMIT = 10

/** 대소문자를 구분하지 않는 부분일치 조건 */
const ci = (value: string) => ({ contains: value, mode: 'insensitive' as const })
/** 대소문자를 구분하지 않는 정확일치 조건 */
const ciEquals = (value: string) => ({ equals: value, mode: 'insensitive' as const })

function keywordOf(query: string): string {
  return query.trim()
}

/* -------------------------------- 플레이어 -------------------------------- */

/**
 * 닉네임이 유일하다는 보장이 없어(스키마에 `@unique` 없음) 동명이인이 있으면
 * id가 가장 앞선 1건을 준다. Mock이 배열에서 처음 찾은 항목을 주는 것과 같다.
 */
export async function findPlayerByName(name: string): Promise<PlayerSearchItem | null> {
  /* 병영수첩 주소를 그대로 붙여 넣으면 그 선수로 간다 (D-162).
     주소가 아니면 아래 닉네임 조회로 그대로 내려간다 */
  const fromUrl = await findPlayerByBarracksUrl(name)
  if (fromUrl) return fromUrl

  const player = await prisma.player.findFirst({
    where: { name: ciEquals(name), ...publicOriginWhere() },
    orderBy: [{ id: 'asc' }],
    select: { id: true, name: true, clan: { select: CLAN_SUMMARY_SELECT } },
  })
  if (!player) return null
  return { id: player.id, name: player.name, clan: toClanSummaryOrNull(player.clan) }
}

/**
 * 넥슨 병영수첩 주소로 선수를 찾는다.
 *
 * 주소에서 뽑은 후보를 **순서대로** 시도한다 — 계정 번호(ouid)가 먼저다.
 * 그게 사람의 확정 키이고, 닉네임은 바뀌거나 겹칠 수 있다.
 * 주소가 아니거나 우리 DB 에 없으면 `null` 이다. **없는 선수를 만들어 내지 않는다.**
 */
async function findPlayerByBarracksUrl(input: string): Promise<PlayerSearchItem | null> {
  if (!isBarracksUrl(input)) return null

  for (const ref of playerRefsFromBarracksUrl(input)) {
    const where =
      ref.kind === 'ouid'
        ? { nexonOuid: ref.value, ...publicOriginWhere() }
        : { name: ciEquals(ref.value), ...publicOriginWhere() }
    const player = await prisma.player.findFirst({
      where,
      orderBy: [{ id: 'asc' }],
      select: { id: true, name: true, clan: { select: CLAN_SUMMARY_SELECT } },
    })
    if (player) {
      return { id: player.id, name: player.name, clan: toClanSummaryOrNull(player.clan) }
    }
  }
  return null
}

export async function searchPlayers(query: string): Promise<PlayerSearchItem[]> {
  const keyword = keywordOf(query)
  if (!keyword) return []

  /* 자동완성에도 주소를 받는다. 주소를 붙여 넣는 중에 부분일치가 엉뚱하게 뜨면
     오히려 방해가 되므로, 주소로 찾은 결과가 있으면 **그것만** 준다 (D-162) */
  if (isBarracksUrl(keyword)) {
    const found = await findPlayerByBarracksUrl(keyword)
    return found ? [found] : []
  }

  const players = await prisma.player.findMany({
    where: { name: ci(keyword), ...publicOriginWhere() },
    orderBy: [{ id: 'asc' }],
    take: SEARCH_LIMIT,
    select: { id: true, name: true, clan: { select: CLAN_SUMMARY_SELECT } },
  })
  return players.map((player) => ({
    id: player.id,
    name: player.name,
    clan: toClanSummaryOrNull(player.clan),
  }))
}

/* ---------------------------------- 클랜 ---------------------------------- */

/* ── 클랜명 색인 — 한글 읽기·별칭 검색을 위해 **이름만** 들고 있는다 ──────────────
 *
 * ── 왜 DB 질의만으로는 안 되는가
 *   `veritas` 를 「베리타스」로, `lpcrew` 를 「미라지」로 찾으려면 **이름을 읽어 봐야** 한다.
 *   그건 SQL `LIKE` 로 못 한다 — 규칙이 `@sacloud/contract` 의 `clanSearch.ts` 안에 있고,
 *   별칭 표(`clanAliases.ts`)는 아예 코드 상수다. DB 는 둘 다 모른다.
 *
 * ── 그래서 «이름표» 만 메모리에 둔다
 *   `id · slug · name` 셋뿐이다(클랜마크·티어 따위는 안 담는다). 실측 903곳 규모라
 *   한 줌이고, 걸린 것만 나중에 제대로 조회해 요약을 만든다.
 *
 * ── 5분마다 다시 만든다
 *   클랜이 새로 생기거나 이름을 바꿔도 5분 안에 따라온다. 자동완성은 타자마다 오는데
 *   그때마다 전수 조회를 하면 DB 가 그걸 다 받는다 (D-240 이 캐시를 붙인 이유와 같다).
 *
 * ── **실패해도 검색은 죽지 않는다**
 *   색인 질의가 깨지면 옛 색인을, 그것도 없으면 **빈 색인**을 쓴다.
 *   그러면 아래 `searchClans` 는 예전과 똑같이 DB 부분일치만으로 답한다.
 */
interface ClanIndexRow {
  id: string
  slug: string
  name: string
}

const CLAN_INDEX_TTL_MS = 5 * 60_000

let clanIndex: { rows: ClanIndexRow[]; expiresAt: number } | null = null
/** 같은 순간에 여러 요청이 들어와도 전수 조회는 한 번만 나간다 */
let clanIndexInFlight: Promise<ClanIndexRow[]> | null = null

async function clanNameIndex(): Promise<ClanIndexRow[]> {
  const cached = clanIndex
  if (cached && cached.expiresAt > Date.now()) return cached.rows
  if (clanIndexInFlight) return clanIndexInFlight

  clanIndexInFlight = prisma.clan
    .findMany({
      where: { ...publicOriginWhere() },
      orderBy: [{ id: 'asc' }],
      select: { id: true, slug: true, name: true },
    })
    .then((rows) => {
      clanIndex = { rows, expiresAt: Date.now() + CLAN_INDEX_TTL_MS }
      return rows
    })
    .catch(() => cached?.rows ?? [])
    .finally(() => {
      clanIndexInFlight = null
    })

  return clanIndexInFlight
}

/**
 * 이름 부분일치로는 안 걸리는 것들을 **더한다** — 한글 읽기 · 초성 · 별칭.
 *
 * **거르는 함수가 아니다.** 이미 나온 결과(`excludeIds`)는 손대지 않고 뒤에 붙일 것만 만든다.
 */
async function clansByReadingOrAlias(
  keyword: string,
  excludeIds: ReadonlySet<string>,
  take: number,
): Promise<ClanSummary[]> {
  if (take <= 0) return []

  const rows = await clanNameIndex()
  if (rows.length === 0) return []

  const hits = searchClanNames(
    rows,
    keyword,
    (row) => row.name,
    (row) => clanAliasesOf(row.slug),
  )
    .filter((row) => !excludeIds.has(row.id))
    .slice(0, take)
  if (hits.length === 0) return []

  /* 색인에는 요약에 필요한 칸이 없다. 걸린 것만 제대로 조회한다 */
  const found = await prisma.clan.findMany({
    where: { id: { in: hits.map((row) => row.id) }, ...publicOriginWhere() },
    select: CLAN_SUMMARY_SELECT,
  })
  const byId = new Map(found.map((clan) => [clan.id, clan]))

  /* 순서는 색인이 매긴 순서(잘 맞는 것부터)를 그대로 지킨다 */
  return hits.flatMap((row) => {
    const clan = byId.get(row.id)
    return clan ? [toClanSummary(clan)] : []
  })
}

/**
 * 클랜명 조회.
 *
 * ── 2026-09-01: **정확일치로 못 찾으면 한 번 더 본다**
 *   홈 통합검색은 엔터를 치면 이 함수를 부른다. 예전에는 여기서 정확일치만 봐서
 *   「베리타스」를 치면 아무 일도 일어나지 않았다 — 검색창 밑에 «한글로 읽어서 쳐도
 *   찾습니다» 라고 써 놓고 **실제로는 안 되던 상태**였다.
 *   이제 정확일치가 없을 때만 읽기·별칭으로 한 번 더 찾아 **가장 잘 맞는 1건**을 준다.
 *   정확일치가 있으면 그게 먼저다 — 기존 동작은 바뀌지 않는다.
 */
export async function findClanByName(name: string): Promise<ClanSummary | null> {
  const clan = await prisma.clan.findFirst({
    where: { name: ciEquals(name), ...publicOriginWhere() },
    orderBy: [{ id: 'asc' }],
    select: CLAN_SUMMARY_SELECT,
  })
  if (clan) return toClanSummary(clan)

  const keyword = keywordOf(name)
  if (!keyword) return null
  const fallback = await clansByReadingOrAlias(keyword, EMPTY_IDS, 1)
  return fallback[0] ?? null
}

const EMPTY_IDS: ReadonlySet<string> = new Set<string>()

/**
 * 클랜 자동완성.
 *
 * ── 순서
 *   ① 지금까지 하던 **이름·slug 부분일치** (원본 주소를 그대로 붙여 넣는 흐름도 여기서 걸린다)
 *   ② 그다음에 **한글 읽기 · 초성 · 별칭**으로 걸린 것을 뒤에 붙인다
 *
 *   ①이 먼저이고 ②는 더하기만 한다 — **기존 결과는 하나도 사라지지 않는다.**
 */
export async function searchClans(query: string): Promise<ClanSummary[]> {
  const keyword = keywordOf(query)
  if (!keyword) return []

  const clans = await prisma.clan.findMany({
    where: { OR: [{ name: ci(keyword) }, { slug: ci(keyword) }], ...publicOriginWhere() },
    orderBy: [{ id: 'asc' }],
    take: SEARCH_LIMIT,
    select: CLAN_SUMMARY_SELECT,
  })
  const base = clans.map(toClanSummary)
  if (base.length >= SEARCH_LIMIT) return base

  const extra = await clansByReadingOrAlias(
    keyword,
    new Set(clans.map((clan) => clan.id)),
    SEARCH_LIMIT - base.length,
  )
  return [...base, ...extra]
}

/* ---------------------------------- 리그 ---------------------------------- */

export async function findLeagueByName(name: string): Promise<LeagueSummary | null> {
  const league = await prisma.league.findFirst({
    where: { name: ciEquals(name), ...publicOriginWhere() },
    orderBy: [{ id: 'asc' }],
    select: LEAGUE_SUMMARY_SELECT,
  })
  return league ? toLeagueSummary(league) : null
}

export async function searchLeagues(query: string): Promise<LeagueSummary[]> {
  const keyword = keywordOf(query)
  if (!keyword) return []

  const leagues = await prisma.league.findMany({
    where: { OR: [{ name: ci(keyword) }, { slug: ci(keyword) }], ...publicOriginWhere() },
    orderBy: [{ id: 'asc' }],
    take: SEARCH_LIMIT,
    select: LEAGUE_SUMMARY_SELECT,
  })
  return leagues.map(toLeagueSummary)
}

/* ------------------------------- 맵 목록 --------------------------------- */

/**
 * 리그 만들기 폼의 맵 선택 목록.
 *
 * 실제 맵 목록은 원본 조사 범위 밖이라 [미확인]이고, 시드에는 자리표시자 이름이 들어 있다.
 * 목록 자체가 소수(관측 규모 8개)라 페이지네이션 없이 전량을 준다 (Mock과 동일).
 */
export async function listMaps(): Promise<GameMap[]> {
  return prisma.gameMap.findMany({
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true },
  })
}
