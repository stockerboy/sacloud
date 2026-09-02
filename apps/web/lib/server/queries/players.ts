import { prisma } from '@sacloud/db'
import {
  kdRate,
  winRate,
  type Player,
  type PlayerLeagueEntry,
  type PlayerSettingInput,
  type RenewResult,
} from '@sacloud/contract'
import { toKstIso, toKstIsoOrNull } from '../format'
import {
  CLAN_SUMMARY_SELECT,
  LEAGUE_SUMMARY_SELECT,
  toClanSummaryOrNull,
  toLeagueSummary,
} from '../mappers'
import { publicOriginWhere } from './publicScope'
import { playerRankOf } from './leagues'
import { cumulativeKd } from './visibility'
import { enqueueRenewJob } from './ingestQueue'

/**
 * 플레이어 조회 · 갱신.
 *
 * Mock의 `store.ts`(`getPlayer` / `getPlayerLeagues`)와 **같은 결과**를 내야 한다.
 * 정렬·필터·파생값 규칙을 그대로 옮겼고, 다른 점은 출처가 메모리 배열이 아니라 DB라는 것뿐이다.
 *
 * 정렬에는 항상 **고유 키(id)를 마지막 기준으로** 넣는다. 래더·승패는 동점이 흔해서
 * 타이브레이커가 없으면 같은 행이 두 번 나오거나 빠진다.
 */

/* --------------------------------- 기본정보 -------------------------------- */

export async function getPlayer(playerId: string): Promise<Player | null> {
  const player = await prisma.player.findFirst({
    // 시드 선수는 공개 화면에서 없는 것으로 다룬다 (D-116)
    where: { id: playerId, ...publicOriginWhere() },
    select: {
      id: true,
      name: true,
      position: true,
      note: true,
      renewedAt: true,
      clan: { select: CLAN_SUMMARY_SELECT },
    },
  })
  if (!player) return null

  return {
    id: player.id,
    name: player.name,
    clan: toClanSummaryOrNull(player.clan),
    position: player.position,
    note: player.note,
    renewed_at: toKstIsoOrNull(player.renewedAt),
  }
}

/* ------------------------------ 참여중인 리그 ------------------------------ */

/**
 * 참여중인 리그별 요약.
 *
 * 존재하지 않는 플레이어여도 **404가 아니라 빈 배열**을 준다 (Mock과 동일).
 * 화면은 이 목록이 비어 있는 경우를 이미 다루고 있어서, 여기서 404를 내면 흐름이 달라진다.
 *
 * 순위(`rank` / `rank_count`)는 리그 전체를 세야 나오는 값이라 행마다 따로 조회한다.
 * 한 플레이어가 참여하는 리그 수는 소수(관측 4개 이하)라 N+1이 문제되지 않는다.
 */
export async function getPlayerLeagues(playerId: string): Promise<PlayerLeagueEntry[]> {
  const rows = await prisma.leaguePlayer.findMany({
    where: { playerId },
    orderBy: [{ id: 'asc' }],
    select: {
      id: true,
      leagueId: true,
      rating: true,
      win: true,
      lose: true,
      kill: true,
      death: true,
      placement: true,
      league: { select: LEAGUE_SUMMARY_SELECT },
      // 경기 당시가 아니라 리그 참가 시점의 소속 클랜 (Mock의 leagueClan.clanId와 같은 값)
      clan: { select: CLAN_SUMMARY_SELECT },
    },
  })

  return Promise.all(
    rows.map(async (row) => {
      const rank = await playerRankOf(row)
      return {
        league: toLeagueSummary(row.league),
        league_player_id: row.id,
        clan: toClanSummaryOrNull(row.clan),
        rating: row.rating,
        win: row.win,
        lose: row.lose,
        win_rate: winRate(row.win, row.lose),
        /* 카드 하나가 리그 하나다. 무소속리그 카드에서는 누적 킬·데스·킬뎃만 비고,
           래더·승패·승률·순위는 공식리그 카드와 똑같이 나온다 (D-107) */
        ...cumulativeKd(
          row.league,
          { kill: row.kill, death: row.death, kdRate: kdRate(row.kill, row.death) },
          rank.rank,
        ),
        placement: row.placement,
        rank: rank.rank,
        rank_count: rank.rankCount,
      }
    }),
  )
}

/* -------------------------------- 정보갱신 -------------------------------- */

/**
 * `정보갱신` 요청.
 *
 * **넥슨 API를 여기서 호출하지 않는다** (E 결정). 수집 작업을 큐(`ImportJob`)에 등록하고
 * 마지막 갱신 시각만 올린다. 실제 수집은 워커(`pnpm nexon:collect`)가 한다.
 * 수집이 끝난 것처럼 꾸미지 않는다.
 *
 * `retry_after`(재요청 제한)는 원본 값이 [미확인]이라 null로 둔다.
 * 로그인이 필요한 동작인지도 [미확인] — Mock과 같이 인증을 요구하지 않는다.
 */
export async function renewPlayer(playerId: string): Promise<RenewResult | null> {
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { id: true } })
  if (!player) return null

  const renewedAt = new Date()
  await prisma.player.update({ where: { id: playerId }, data: { renewedAt } })
  await enqueueRenewJob({ kind: 'player', id: playerId })

  return { accepted: true, renewed_at: toKstIso(renewedAt), retry_after: null }
}

/* -------------------------------- 설정 변경 -------------------------------- */

/** 플레이어 설정(소개·포지션) 저장. 저장 후 갱신된 기본정보를 그대로 돌려준다. */
export async function updatePlayerSetting(
  playerId: string,
  input: PlayerSettingInput,
): Promise<Player | null> {
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { id: true } })
  if (!player) return null

  await prisma.player.update({
    where: { id: playerId },
    data: { note: input.note, position: input.position },
  })
  return getPlayer(playerId)
}
