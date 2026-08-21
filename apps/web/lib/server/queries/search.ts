import { prisma } from '@sacloud/db'
import type { ClanSummary, GameMap, LeagueSummary, PlayerSearchItem } from '@sacloud/contract'
import {
  CLAN_SUMMARY_SELECT,
  LEAGUE_SUMMARY_SELECT,
  toClanSummary,
  toClanSummaryOrNull,
  toLeagueSummary,
} from '../mappers'

/**
 * 통합검색 (플레이어 · 클랜 · 리그).
 *
 * Mock의 `store.ts`(`findXByName` / `searchX`)와 **같은 결과**를 내야 한다.
 * - `name/{name}` 은 **정확일치** 1건. 검색어를 그대로 제출했을 때 쓴다.
 * - `search/{q}` 는 **부분일치** 자동완성. 최대 10건.
 * - 빈 검색어는 조회하지 않고 빈 배열을 준다 (Mock과 동일).
 *
 * 부분일치는 Postgres의 `contains`(대소문자 구분)라 JS `String.includes`와 결과가 같다.
 * 정렬 기준 컬럼이 따로 없어 **고유 키(id) 오름차순**으로 고정한다 — 같은 검색어에 항상 같은 순서다.
 */

/** 자동완성 노출 건수 (Mock 기본값과 동일). 원본의 실제 상한은 [미확인] */
const SEARCH_LIMIT = 10

function keywordOf(query: string): string {
  return query.trim()
}

/* -------------------------------- 플레이어 -------------------------------- */

/**
 * 닉네임이 유일하다는 보장이 없어(스키마에 `@unique` 없음) 동명이인이 있으면
 * id가 가장 앞선 1건을 준다. Mock이 배열에서 처음 찾은 항목을 주는 것과 같다.
 */
export async function findPlayerByName(name: string): Promise<PlayerSearchItem | null> {
  const player = await prisma.player.findFirst({
    where: { name },
    orderBy: [{ id: 'asc' }],
    select: { id: true, name: true, clan: { select: CLAN_SUMMARY_SELECT } },
  })
  if (!player) return null
  return { id: player.id, name: player.name, clan: toClanSummaryOrNull(player.clan) }
}

export async function searchPlayers(query: string): Promise<PlayerSearchItem[]> {
  const keyword = keywordOf(query)
  if (!keyword) return []

  const players = await prisma.player.findMany({
    where: { name: { contains: keyword } },
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
    where: { name },
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
    where: { OR: [{ name: { contains: keyword } }, { slug: { contains: keyword } }] },
    orderBy: [{ id: 'asc' }],
    take: SEARCH_LIMIT,
    select: CLAN_SUMMARY_SELECT,
  })
  return clans.map(toClanSummary)
}

/* ---------------------------------- 리그 ---------------------------------- */

export async function findLeagueByName(name: string): Promise<LeagueSummary | null> {
  const league = await prisma.league.findFirst({
    where: { name },
    orderBy: [{ id: 'asc' }],
    select: LEAGUE_SUMMARY_SELECT,
  })
  return league ? toLeagueSummary(league) : null
}

export async function searchLeagues(query: string): Promise<LeagueSummary[]> {
  const keyword = keywordOf(query)
  if (!keyword) return []

  const leagues = await prisma.league.findMany({
    where: { OR: [{ name: { contains: keyword } }, { slug: { contains: keyword } }] },
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
