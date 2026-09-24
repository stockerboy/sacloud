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
  PLAYER_CLAN_FALLBACK_SELECT,
  playerClanOf,
  LEAGUE_SUMMARY_SELECT,
  toClanSummaryOrNull,
  toLeagueSummary,
} from '../mappers'
import { notGhostPlayerWhere, publicOriginWhere } from './publicScope'
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
    // 시드 선수는 공개 화면에서 없는 것으로 다룬다 (D-116) · 껍데기 선수도 같은 대접 (2026-09-24)
    where: { id: playerId, ...publicOriginWhere(), ...notGhostPlayerWhere() },
    select: {
      id: true,
      name: true,
      position: true,
      note: true,
      renewedAt: true,
      clan: { select: CLAN_SUMMARY_SELECT },
      /*
       * ★소속을 리그 명부에서도 본다★ (2026-09-10 · 사장님 지적).
       *
       * > «개인기본정보 들어가면 다 무소속이라고 떠 클랜이있는데도»
       *
       * `Player.clanId` 는 ★`3rd.supply` 에서 온 선수만★ 채워지는 칸이다 (D-161).
       * 지금 들어오는 선수는 전부 병영수첩 출신이라 ★그 칸이 언제나 비어 있다.★
       * 실측: IPL 선수 3,812명 중 이 칸이 있는 사람은 극소수고,
       * ★소속을 실제로 관리하는 칸은 `LeaguePlayer.clanId`★ 다
       * (`clan-affiliation` 잡이 병영수첩 명부로 맞춘다 — IPL 87%).
       *
       * 그래서 ★명부 쪽도 같이 읽고, 있으면 그것을 쓴다.★
       * ⚠ `Player.clanId` 를 지우지 않는다 — 3rd.supply 출신은 그 값이 맞다.
       * ⚠ 리그가 여럿이면 ★가장 최근에 손댄 줄★ 하나만 본다. 둘을 합치지 않는다.
       *
       * 같은 규칙을 검색 화면도 쓴다 — 칸과 고르는 법을 ★`mappers.ts` 한 곳★ 에 뒀다.
       */
      ...PLAYER_CLAN_FALLBACK_SELECT,
    },
  })
  if (!player) return null

  return {
    id: player.id,
    name: player.name,
    /* ★계정 칸이 있으면 그것이 먼저다★ — 3rd.supply 출신의 값이 거기 있다 */
    clan: toClanSummaryOrNull(playerClanOf(player)),
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
      /*
       * ★★기본정보의 래더는 ★점수 래더★ 다★★ (2026-09-20 사장님)
       *
       * > 「래더 총점만 기본정보에 써줘 ★보정대상은 보정후의 점수로 써줘★
       * >  그리고 ★래더 3000점 부터 하지말고 그냥 0점부터★ 계산해」
       *
       *   두 마디가 ★같은 값★ 을 가리킨다 —
       *   ・상위권 보정은 ★`scoreRating` 에만★ 들어 있다 (`scoreLadderBuild`)
       *   ・`scoreRating` 은 ★0부터★ 다. 3000에서 시작하는 것은 옛 Elo(`rating`)다
       *
       *   그리고 실측으로 확인했다 — 33,567명 중 ★Elo 가 3000 아닌 사람은 4,034명★ 뿐이라
       *   기본정보의 「래더 3,000점」 은 ★계산된 값이 아니라 아무도 안 건드린 초기값★ 이었다.
       *
       * ⚠ ★못 잰 사람은 `null` 이다★ — 0점으로 우기지 않는다 (D-106).
       */
      scoreRating: true,
      scoreBonus: true,
      scoreGames: true,
      win: true,
      lose: true,
      kill: true,
      death: true,
      placement: true,
      /*
       * ★무기별 판수★ (2026-09-21 사장님: 「기본정보에 ★스나수인지 라플수인지★ 써주고」).
       *
       *   부(division)별로 줄이 나뉘어 있어 ★전부 더해야★ 그 리그의 판수가 된다.
       *   선수 머리 카드(`PlayerHeaderV3`)가 쓰는 값과 ★같은 표·같은 셈★ 이다.
       */
      tierStats: { select: { sniperGames: true, rifleGames: true } },
      league: { select: LEAGUE_SUMMARY_SELECT },
      // 경기 당시가 아니라 리그 참가 시점의 소속 클랜 (Mock의 leagueClan.clanId와 같은 값)
      clan: { select: CLAN_SUMMARY_SELECT },
    },
  })

  return Promise.all(
    rows.map(async (row) => {
      /* ★랭킹 목록과 같은 모집단으로 센다★ (2026-09-21 · 무한 QA) */
      const rank = await playerRankOf({ ...row, leagueSlug: row.league.slug })
      return {
        league: toLeagueSummary(row.league),
        league_player_id: row.id,
        clan: toClanSummaryOrNull(row.clan),
        rating: row.rating,
        /* DB 는 ×100 정수다 — ★나누는 곳은 여기 하나★ (계약 주석과 같은 규칙) */
        score_rating: row.scoreRating === null ? null : Math.round(row.scoreRating / 10) / 10,
        score_bonus: Math.round(row.scoreBonus / 10) / 10,
        score_games: row.scoreGames,
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
        sniper_games: row.tierStats.reduce((n, t) => n + t.sniperGames, 0),
        rifle_games: row.tierStats.reduce((n, t) => n + t.rifleGames, 0),
        placement: row.placement,
        rank: rank.rank,
        rank_count: rank.rankCount,
      }
    }),
  ).then((entries) => withSupply2Card(playerId, entries))
}

/**
 * ★Supply 2.0(cpl) 은 안 뛴 사람도 카드가 있다★ (2026-09-24 사장님 「Supply2.0 은 안뛴 사람도 전부 카드를 만들어줘 0전0킬0데스로」).
 *
 *   리그 참가 기록(LeaguePlayer)이 없어도 ★소속 클랜이 Supply 2.0 에 등록★ 돼 있으면 0전 카드를 하나 붙인다.
 *   DB 에 줄을 만들지 않는다 — 읽을 때만 붙인다(가상 카드 · league_player_id 는 `virtual-cpl-<playerId>`).
 *   실제로 뛰어 LeaguePlayer 가 생기면 그 줄이 대신 나온다(중복 안 됨). 옛 판은 SUPPLY2_ZERO_CARD=false.
 */
const SUPPLY2_ZERO_CARD = true
async function withSupply2Card(playerId: string, entries: PlayerLeagueEntry[]): Promise<PlayerLeagueEntry[]> {
  if (!SUPPLY2_ZERO_CARD) return entries
  if (entries.some((e) => e.league.slug === 'cpl')) return entries
  const me = await prisma.player.findUnique({ where: { id: playerId }, select: { clanId: true } })
  if (!me?.clanId) return entries
  const seat = await prisma.leagueClan.findFirst({
    where: { clanId: me.clanId, expelledAt: null, league: { slug: 'cpl' } },
    select: { league: { select: LEAGUE_SUMMARY_SELECT }, clan: { select: CLAN_SUMMARY_SELECT } },
  })
  if (!seat) return entries
  return [
    ...entries,
    {
      league: toLeagueSummary(seat.league),
      league_player_id: `virtual-cpl-${playerId}`,
      clan: toClanSummaryOrNull(seat.clan),
      rating: 0,
      score_rating: null,
      score_bonus: 0,
      score_games: 0,
      win: 0,
      lose: 0,
      win_rate: 0,
      kill: 0,
      death: 0,
      kd_rate: 0,
      sniper_games: 0,
      rifle_games: 0,
      /* ★배치 중★ — 래더 자리에 「기록 없음」. 0층을 지어내지 않는다 */
      placement: true,
      rank: null,
      rank_count: null,
    },
  ]
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
