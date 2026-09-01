import { prisma } from '@sacloud/db'
import {
  barracksUsnOf,
  clanAliasesOf,
  clanSlugFromBarracksUrl,
  isBarracksUrl,
  normalizePastedQuery,
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

/**
 * 검색어를 조회에 쓸 수 있게 다듬는다.
 *
 * 예전에는 `trim()` 하나였다. 붙여넣기에는 폭 없는 문자와 유니코드 공백이 딸려 오는데
 * 그것들이 남아 있으면 **정확일치가 조용히 0건**이 된다 (D-254).
 */
function keywordOf(query: string): string {
  return normalizePastedQuery(query)
}

/* -------------------------------- 플레이어 -------------------------------- */

/**
 * 닉네임이 유일하다는 보장이 없어(스키마에 `@unique` 없음) 동명이인이 있으면
 * id가 가장 앞선 1건을 준다. Mock이 배열에서 처음 찾은 항목을 주는 것과 같다.
 */
export async function findPlayerByName(name: string): Promise<PlayerSearchItem | null> {
  /* 붙여넣기에 딸려 온 공백·폭없는문자를 먼저 턴다. 이게 없으면 ` huwho ` 가 404 다 (D-254) */
  const keyword = keywordOf(name)
  if (!keyword) return null

  /* 병영수첩 주소를 그대로 붙여 넣으면 그 선수로 간다 (D-162).
     주소가 아니면 아래 닉네임 조회로 그대로 내려간다 */
  const fromUrl = await findPlayerByBarracksUrl(keyword)
  if (fromUrl) return fromUrl

  const player = await playerByName(keyword)
  if (player) return player

  /* 주소 없이 **계정 번호만** 붙여 넣은 경우 (`D9EBC75CCBD60C12SA`).
     닉네임 조회를 먼저 한 뒤에 본다 — 그런 닉을 쓰는 사람이 있다면 그쪽이 먼저다 (D-254) */
  const usn = barracksUsnOf(keyword)
  return usn ? playerByBarracksUsn(usn) : null
}

/** 닉네임 정확일치 1건 */
async function playerByName(name: string): Promise<PlayerSearchItem | null> {
  const player = await prisma.player.findFirst({
    where: { name: ciEquals(name), ...publicOriginWhere() },
    orderBy: [{ id: 'asc' }],
    select: { id: true, name: true, clan: { select: CLAN_SUMMARY_SELECT } },
  })
  if (!player) return null
  return { id: player.id, name: player.name, clan: toClanSummaryOrNull(player.clan) }
}

/**
 * 병영수첩 계정 번호(`str_usn`) → 우리 선수 (D-254).
 *
 * ── 계산으로는 못 간다. **저장된 짝**을 쓴다
 *   `str_usn` 은 병영수첩 세계의 키이고 우리 `Player.sourcePlayerId` 는 **숫자**
 *   (`user_nexon_sn`)다. 둘 사이를 잇는 계산식은 **없다** — `str_usn` 은 암호화된
 *   8바이트로 보인다 (실측: 짝 11개에서 어떤 선형 관계도 안 나왔다).
 *   그래서 아래 두 표를 순서대로 본다.
 *
 * ── 덮는 범위가 좁다. 숨기지 않는다
 *   운영 실측 2026-09-01: 이어진 계정 **473개 / 공개 선수 22,141명 (2.1%)**.
 *   나머지는 **찾지 못하는 게 맞다** — 없는 선수를 닉네임 추측으로 만들어 내지 않는다
 *   (CLAUDE.md 3-A 8번). 범위를 넓히려면 배틀로그 원문이나 클랜원 명단을 운영에
 *   적재해야 한다 (지금 운영의 `BarracksBattleLogRaw` · `BarracksClanMember` 는 0행이다).
 */
async function playerByBarracksUsn(usn: string): Promise<PlayerSearchItem | null> {
  const playerId = (await identityPlayerId(usn)) ?? (await positionProfilePlayerId(usn))
  if (!playerId) return null

  const player = await prisma.player.findFirst({
    where: { id: playerId, ...publicOriginWhere() },
    select: { id: true, name: true, clan: { select: CLAN_SUMMARY_SELECT } },
  })
  if (!player) return null
  return { id: player.id, name: player.name, clan: toClanSummaryOrNull(player.clan) }
}

/**
 * ① 신원 표 — **이 다리의 제자리다** (D-221 이 이 칸을 만들었다).
 *
 * 여기 있는 값은 `user/basic` 으로 **되돌려 확인**까지 끝난 것이라 가장 믿을 만하다.
 * 다만 운영에는 아직 **0행**이다 (2026-09-01 실측). 채워지면 아래 ②보다 먼저 걸린다 —
 * 코드를 다시 고칠 필요가 없게 지금부터 여기를 먼저 본다.
 */
async function identityPlayerId(usn: string): Promise<string | null> {
  const identity = await prisma.nexonIdentity.findFirst({
    where: { barracksUsn: usn, playerId: { not: null } },
    orderBy: [{ barracksLinkedAt: 'desc' }],
    select: { playerId: true },
  })
  return identity?.playerId ?? null
}

/**
 * ② 포지션 분포 표 — 운영에서 **지금 실제로 답을 주는 유일한 다리**다.
 *
 * 배틀로그 적재가 `str_usn` 을 키로 쓰면서 그때 `playerId` 를 이어 두었다
 * (`apps/worker/src/jobs/battlelog.ts` 의 `resolvePlayerId`).
 * 부산물이지 제자리가 아니다. ①이 채워지면 이 갈래는 보험으로 남는다.
 */
async function positionProfilePlayerId(usn: string): Promise<string | null> {
  const profile = await prisma.playerPositionProfile.findFirst({
    where: { userNexonSn: ciEquals(usn), playerId: { not: null } },
    orderBy: [{ computedAt: 'desc' }],
    select: { playerId: true },
  })
  return profile?.playerId ?? null
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
    /* `str_usn` 은 표를 한 번 더 거쳐야 한다 — 선수 표에 그 칸이 없다 (D-254) */
    if (ref.kind === 'usn') {
      const found = await playerByBarracksUsn(ref.value)
      if (found) return found
      continue
    }
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

  /* 계정 번호만 붙여 넣은 경우도 같다 — 부분일치가 끼어들 여지가 없다 (D-254) */
  const usn = barracksUsnOf(keyword)
  if (usn) {
    const found = await playerByBarracksUsn(usn)
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
  const keyword = keywordOf(name)
  if (!keyword) return null

  /* 병영수첩 **클랜** 주소를 그대로 붙여 넣으면 그 클랜으로 간다 (D-254).
     우리 `Clan.slug` 가 곧 병영수첩 slug 다(스키마 주석). 선수 쪽은 D-162 로
     이미 되던 것이, 클랜 쪽은 규칙이 리그 관리 화면 안에만 있어서 안 됐다 */
  const slug = clanSlugFromBarracksUrl(keyword)
  if (slug) return clanBySlug(slug)

  const clan = await prisma.clan.findFirst({
    where: { name: ciEquals(keyword), ...publicOriginWhere() },
    orderBy: [{ id: 'asc' }],
    select: CLAN_SUMMARY_SELECT,
  })
  if (clan) return toClanSummary(clan)

  const fallback = await clansByReadingOrAlias(keyword, EMPTY_IDS, 1)
  return fallback[0] ?? null
}

/** 병영수첩 slug 정확일치 1건 */
async function clanBySlug(slug: string): Promise<ClanSummary | null> {
  const clan = await prisma.clan.findFirst({
    where: { slug: ciEquals(slug), ...publicOriginWhere() },
    orderBy: [{ id: 'asc' }],
    select: CLAN_SUMMARY_SELECT,
  })
  return clan ? toClanSummary(clan) : null
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

  /* 주소를 붙여 넣는 중에 부분일치가 끼어들면 방해가 된다 — 주소면 그 결과만 준다 (D-254).
     선수 자동완성이 D-162 부터 하던 것과 같은 규칙이다 */
  const slug = clanSlugFromBarracksUrl(keyword)
  if (slug) {
    const found = await clanBySlug(slug)
    return found ? [found] : []
  }

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
  /* 선수·클랜과 같은 규칙으로 다듬는다 — 세 갈래가 서로 다르게 굴면 안 된다 (D-254) */
  const keyword = keywordOf(name)
  if (!keyword) return null

  const league = await prisma.league.findFirst({
    where: { name: ciEquals(keyword), ...publicOriginWhere() },
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
