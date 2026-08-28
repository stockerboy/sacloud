import { prisma } from '@sacloud/db'
import {
  isBarracksUrl,
  playerRefsFromBarracksUrl,
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

export async function findClanByName(name: string): Promise<ClanSummary | null> {
  const clan = await prisma.clan.findFirst({
    where: { name: ciEquals(name), ...publicOriginWhere() },
    orderBy: [{ id: 'asc' }],
    select: CLAN_SUMMARY_SELECT,
  })
  return clan ? toClanSummary(clan) : null
}

/** 클랜은 이름뿐 아니라 slug로도 찾는다 (원본 주소를 그대로 붙여 넣는 흐름) */
export async function searchClans(query: string): Promise<ClanSummary[]> {
  const keyword = keywordOf(query)
  if (!keyword) return []

  const clans = await prisma.clan.findMany({
    where: { OR: [{ name: ci(keyword) }, { slug: ci(keyword) }], ...publicOriginWhere() },
    orderBy: [{ id: 'asc' }],
    take: SEARCH_LIMIT,
    select: CLAN_SUMMARY_SELECT,
  })
  return clans.map(toClanSummary)
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
