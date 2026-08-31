import { prisma } from '@sacloud/db'
import {
  winRate,
  type Clan,
  type ClanLeagueEntry,
  type ClanPlayer,
  type ClanSettingInput,
  type RenewResult,
  restoreClanMark,
} from '@sacloud/contract'
import { cursorPage, type CursorPage } from '../cursorPage'
import { toKstDateOrNull, toKstIso, toKstIsoOrNull } from '../format'
import { LEAGUE_SUMMARY_SELECT, toLeagueSummary, toPlayerSummaryOrNull } from '../mappers'
import { publicOriginWhere } from './publicScope'
import { clanRankOf } from './leagues'
import { enqueueRenewJob } from './ingestQueue'

/**
 * 클랜 조회 · 갱신.
 *
 * Mock의 `store.ts`(`getClan` / `getClanPlayers` / `getClanLeagues`)와 **같은 결과**를 내야 한다.
 * 클랜은 계약상 slug로 참조한다 (원본이 넥슨 병영수첩 slug를 그대로 식별자로 쓴다).
 */

/* --------------------------------- 기본정보 -------------------------------- */

export async function getClan(clanSlug: string): Promise<Clan | null> {
  const clan = await prisma.clan.findFirst({
    // 시드 클랜은 공개 화면에서 없는 것으로 다룬다 (D-116)
    where: { slug: clanSlug, ...publicOriginWhere() },
    select: {
      id: true,
      slug: true,
      name: true,
      markBgUrl: true,
      markFrontUrl: true,
      notice: true,
      establishedAt: true,
      renewedAt: true,
      master: { select: { id: true, name: true } },
      _count: { select: { members: true } },
    },
  })
  if (!clan) return null

  return {
    id: clan.id,
    slug: clan.slug,
    name: clan.name,
    // 넥슨 원본 주소로 되돌려 내보낸다 (D-227)
    mark: restoreClanMark({ bg: clan.markBgUrl, front: clan.markFrontUrl }),
    master: toPlayerSummaryOrNull(clan.master),
    // 설립일은 날짜만 노출한다 (계약 `IsoDate`)
    established_at: toKstDateOrNull(clan.establishedAt),
    notice: clan.notice,
    renewed_at: toKstIsoOrNull(clan.renewedAt),
    member_count: clan._count.members,
  }
}

/* ---------------------------------- 클랜원 --------------------------------- */

/**
 * 클랜원 목록 (커서).
 *
 * 가입 시각 컬럼이 없어서 **플레이어 id 오름차순**으로 고정한다.
 * Mock의 `clan.playerIds` 배열 순서와 같은 결과이며, 고유 키 단독 정렬이라 커서가 흔들리지 않는다.
 */
export async function getClanPlayers(
  clanSlug: string,
  cursor: string | null,
  size: number,
): Promise<CursorPage<ClanPlayer> | null> {
  const clan = await prisma.clan.findUnique({
    where: { slug: clanSlug },
    select: { id: true, masterPlayerId: true },
  })
  if (!clan) return null

  return cursorPage<ClanPlayer>({
    cursor,
    size,
    orderBy: [{ id: 'asc' }],
    reversedOrderBy: [{ id: 'desc' }],
    idOf: (row) => row.id,
    fetch: async (args) => {
      const rows = await prisma.player.findMany({
        where: { clanId: clan.id },
        take: args.take,
        orderBy: args.orderBy as never,
        ...(args.cursor ? { cursor: args.cursor, skip: args.skip } : {}),
        select: { id: true, name: true, position: true },
      })
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        position: row.position,
        master: row.id === clan.masterPlayerId,
      }))
    },
  })
}

/* ------------------------------ 리그별 성적 ------------------------------- */

/**
 * 클랜이 참여중인 리그별 성적.
 *
 * 순위는 리그·부리그 전체를 세야 나오므로 행마다 따로 조회한다.
 * 한 클랜이 참여하는 리그 수는 소수(관측 4개 이하)라 N+1이 문제되지 않는다.
 */
export async function getClanLeagues(clanSlug: string): Promise<ClanLeagueEntry[] | null> {
  const clan = await prisma.clan.findUnique({ where: { slug: clanSlug }, select: { id: true } })
  if (!clan) return null

  const rows = await prisma.leagueClan.findMany({
    /* 추방(등록 해제)된 리그는 `참여중인 리그` 가 아니다 (2026-08-30).
       경기 기록은 그대로 남는다 — 이 목록에서만 빠진다 */
    where: { clanId: clan.id, expelledAt: null },
    orderBy: [{ id: 'asc' }],
    select: {
      id: true,
      leagueId: true,
      rating: true,
      division: true,
      win: true,
      lose: true,
      placement: true,
      status: true,
      joinedAt: true,
      league: { select: LEAGUE_SUMMARY_SELECT },
    },
  })

  return Promise.all(
    rows.map(async (row) => {
      const rank = await clanRankOf(row)
      return {
        league: toLeagueSummary(row.league),
        league_clan_id: row.id,
        rating: row.rating,
        division: row.division,
        win: row.win,
        lose: row.lose,
        win_rate: winRate(row.win, row.lose),
        placement: row.placement,
        status: row.status,
        joined_at: toKstIso(row.joinedAt),
        rank: rank.rank,
        rank_count: rank.rankCount,
      }
    }),
  )
}

/* -------------------------------- 전적갱신 -------------------------------- */

/**
 * `전적갱신` 요청.
 *
 * **실제 전적 수집은 Phase 8(수집 파이프라인)에서 붙인다.** 지금은 수집을 하지 않으므로
 * 마지막 갱신 시각만 현재 시각으로 올린다. 수집한 것처럼 꾸미지 않는다.
 *
 * `retry_after`(재요청 제한)는 원본 값이 [미확인]이라 null로 둔다.
 */
export async function renewClan(clanSlug: string): Promise<RenewResult | null> {
  const clan = await prisma.clan.findUnique({ where: { slug: clanSlug }, select: { id: true } })
  if (!clan) return null

  const renewedAt = new Date()
  await prisma.clan.update({ where: { id: clan.id }, data: { renewedAt } })
  // 넥슨 API를 인라인 호출하지 않는다. 수집 작업만 큐에 등록한다 (E 결정)
  await enqueueRenewJob({ kind: 'clan', id: clan.id })

  return { accepted: true, renewed_at: toKstIso(renewedAt), retry_after: null }
}

/* -------------------------------- 설정 변경 -------------------------------- */

/** 클랜 설정(공지·초대차단) 저장. 저장 후 갱신된 기본정보를 그대로 돌려준다. */
export async function updateClanSetting(
  clanSlug: string,
  input: ClanSettingInput,
): Promise<Clan | null> {
  const clan = await prisma.clan.findUnique({ where: { slug: clanSlug }, select: { id: true } })
  if (!clan) return null

  await prisma.clan.update({
    where: { id: clan.id },
    data: { notice: input.notice, blockInvitation: input.block_invitation },
  })
  return getClan(clanSlug)
}
