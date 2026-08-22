import { prisma, type Prisma } from '@sacloud/db'
import {
  kdRate,
  percentOf,
  type MatchDetail,
  type MatchLineupEntry,
  type MatchListItem,
  type MatchPlayerStat,
  type TeamSide,
  type Weapon,
} from '@sacloud/contract'
import { cursorPage, type CursorPage } from '../cursorPage'
import { toKstIso, toKstIsoOrNull } from '../format'
import { CLAN_SUMMARY_SELECT, PLAYER_SUMMARY_SELECT, toClanSummary } from '../mappers'

/**
 * 매치 조회 (기록실 목록 · 매치 상세).
 *
 * Mock의 `packages/mock/src/store.ts` 506~666행과 **같은 응답**을 내야 한다.
 * `toMatchListItem` / `toMatchPlayerStat` / `snapshotOf`의 규칙을 그대로 옮겼고,
 * 다른 점은 데이터를 메모리 배열이 아니라 DB에서 읽는다는 것뿐이다.
 *
 * 정렬은 항상 `startAt desc` + **고유 키 `id desc`**로 끝낸다.
 * 같은 초에 시작된 경기가 있으면 타이브레이커 없이는 커서 페이지네이션이 흔들린다.
 */

/* -------------------------------------------------------------------------- */
/* 읽어올 컬럼                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * 매치 한 건을 카드/상세로 만드는 데 필요한 전부.
 *
 * 한 번의 `findMany`로 맵·양쪽 클랜·참가자 기록·참가자 이름까지 같이 읽는다.
 * 경기마다 추가 쿼리를 날리면 한 페이지(20건)에 수십 번의 왕복이 생긴다(N+1).
 *
 * 참가자 정렬은 `id asc`다. 시드가 red 로스터 → blue 로스터 순으로 넣으므로
 * 삽입 순서가 그대로 유지된다. 원본의 라인업 정렬 기준은 [미확인].
 */
const MATCH_SELECT = {
  id: true,
  leagueId: true,
  playerCount: true,
  startAt: true,
  endAt: true,
  playTime: true,
  blueFirst: true,
  winnerSide: true,
  mvpPlayerId: true,
  redLeagueClanId: true,
  blueLeagueClanId: true,
  redDivisionAtMatch: true,
  blueDivisionAtMatch: true,
  redRatingBefore: true,
  blueRatingBefore: true,
  redPlacement: true,
  bluePlacement: true,
  redRatingUpdate: true,
  blueRatingUpdate: true,
  origin: true,
  participantCompleteness: true,
  evidenceConfidence: true,
  official: true,
  map: { select: { id: true, name: true } },
  redClan: { select: { id: true, clan: { select: CLAN_SUMMARY_SELECT } } },
  blueClan: { select: { id: true, clan: { select: CLAN_SUMMARY_SELECT } } },
  stats: {
    orderBy: { id: 'asc' },
    select: {
      playerId: true,
      side: true,
      kill: true,
      death: true,
      assist: true,
      headshot: true,
      damage: true,
      weapon: true,
      dropout: true,
      mvp: true,
      ratingBefore: true,
      ratingUpdate: true,
      isPlacement: true,
      participantRole: true,
      player: { select: PLAYER_SUMMARY_SELECT },
    },
  },
} satisfies Prisma.MatchSelect

export type MatchRow = Prisma.MatchGetPayload<{ select: typeof MATCH_SELECT }>
type StatRow = MatchRow['stats'][number]

const MATCH_ORDER = [{ startAt: 'desc' }, { id: 'desc' }] as const
const MATCH_ORDER_REVERSED = [{ startAt: 'asc' }, { id: 'asc' }] as const

/* -------------------------------------------------------------------------- */
/* 리그 식별자 해석                                                              */
/* -------------------------------------------------------------------------- */

/**
 * 계약은 매치 관련 경로에 `:leagueId`를 쓰지만, 화면은 URL의 리그 슬러그를 그대로 넣어 부른다
 * (`apps/web/app/league/[leagueSlug]/player/[playerId]/page.tsx`).
 * Mock 핸들러의 `resolveLeagueId`도 둘 다 받는다. 실제 API도 같게 맞춘다.
 */
export async function resolveLeagueId(leagueIdOrSlug: string): Promise<string | null> {
  if (!leagueIdOrSlug) return null
  const league = await prisma.league.findFirst({
    where: { OR: [{ slug: leagueIdOrSlug }, { id: leagueIdOrSlug }] },
    select: { id: true },
  })
  return league?.id ?? null
}

/* -------------------------------------------------------------------------- */
/* 매핑                                                                         */
/* -------------------------------------------------------------------------- */

export function sideOfLeagueClan(
  match: { redLeagueClanId: string; blueLeagueClanId: string },
  leagueClanId: string,
): TeamSide | null {
  if (match.redLeagueClanId === leagueClanId) return 'red'
  if (match.blueLeagueClanId === leagueClanId) return 'blue'
  return null
}

function lineupOf(match: MatchRow, side: TeamSide): MatchLineupEntry[] {
  return match.stats
    .filter((stat) => stat.side === side)
    .map((stat) => ({
      player_id: stat.playerId,
      name: stat.player.name,
      weapon: stat.weapon as Weapon | null,
      dropout: stat.dropout,
    }))
}

/** 같은 팀 전체 딜량. 결측(`null`)은 0으로 본다. */
function teamDamage(match: MatchRow, side: string): number {
  return match.stats.reduce((sum, stat) => (stat.side === side ? sum + (stat.damage ?? 0) : sum), 0)
}

/**
 * 결측 처리.
 *
 * 원본은 **상대 클랜 소속 플레이어의 딜량·헤드샷을 `알수없음`으로 표시한다.**
 * DB에는 값이 있어도 보는 쪽이 아닌 팀은 응답에서 `null`로 지운다.
 * (데이터가 없는 것이 아니라 원본의 노출 한계를 재현하는 것이다 — store.ts와 동일)
 */
function toMatchPlayerStat(match: MatchRow, stat: StatRow, visible: boolean): MatchPlayerStat {
  const damage = visible ? stat.damage : null
  const headshot = visible ? stat.headshot : null
  return {
    player_id: stat.playerId,
    name: stat.player.name,
    side: stat.side as TeamSide,
    kill: stat.kill,
    death: stat.death,
    assist: stat.assist,
    headshot,
    damage,
    kd_rate: kdRate(stat.kill, stat.death),
    damage_percent: damage === null ? null : percentOf(damage, teamDamage(match, stat.side)),
    headshot_percent: headshot === null ? null : percentOf(headshot, stat.kill),
    weapon: stat.weapon as Weapon | null,
    rating: stat.ratingBefore,
    rating_update: stat.ratingUpdate,
    placement: stat.isPlacement,
    dropout: stat.dropout,
    // DB는 진영 승패만 들고 있다 (참가자별 win 컬럼 없음). 진영으로 판정한다.
    win: match.winnerSide === stat.side,
    mvp: stat.mvp,
  }
}

/** DB의 문자열을 계약의 등급으로 좁힌다. 모르는 값이면 null이다 */
function toConfidence(value: string | null): 'high' | 'medium' | 'low' | null {
  return value === 'high' || value === 'medium' || value === 'low' ? value : null
}

/** 경기 시점 클랜 스냅샷 (당시 래더·부리그·배치 여부) */
/**
 * 본클랜원 수 → 클랜 래더 반영률 (D-081).
 *
 * `@sacloud/rating`의 `clanWeightForMembers`와 같은 표다. 화면에서 "왜 덜 올랐는지"를
 * 보여 주기 위해 여기서도 계산한다.
 */
function clanWeight(members: number): number {
  if (members >= 3) return 1
  if (members === 2) return 0.7
  if (members === 1) return 0.4
  return 0
}

function snapshotOf(match: MatchRow, side: TeamSide) {
  const isRed = side === 'red'
  const leagueClan = isRed ? match.redClan : match.blueClan

  // 재구성 경기만 역할이 기록돼 있다. 아니면 구성을 말할 근거가 없으므로 null이다
  const sideStats = match.stats.filter((stat) => stat.side === side)
  const reconstructed = match.origin === 'nexon' && sideStats.length > 0
  const members = sideStats.filter((stat) => stat.participantRole === 'member').length

  return {
    league_clan_id: leagueClan.id,
    clan: toClanSummary(leagueClan.clan),
    rating: isRed ? match.redRatingBefore : match.blueRatingBefore,
    division: isRed ? match.redDivisionAtMatch : match.blueDivisionAtMatch,
    placement: isRed ? match.redPlacement : match.bluePlacement,
    members_confirmed: reconstructed ? members : null,
    mercenaries_confirmed: reconstructed ? sideStats.length - members : null,
    clan_weight: reconstructed ? clanWeight(members) : null,
  }
}

/**
 * 매치 카드.
 * `win` / `placement` / `rating_update` / `league_clan` / `opponent`는
 * **보는 쪽(viewer) 기준**으로 달라진다.
 */
export function toMatchListItem(
  match: MatchRow,
  viewerLeagueClanId: string,
  viewerPlayerId: string | null,
): MatchListItem | null {
  const viewerSide = sideOfLeagueClan(match, viewerLeagueClanId)
  if (!viewerSide) return null
  const opponentSide: TeamSide = viewerSide === 'red' ? 'blue' : 'red'

  const viewerStat = viewerPlayerId
    ? match.stats.find((stat) => stat.playerId === viewerPlayerId && stat.side === viewerSide)
    : undefined

  return {
    id: match.id,
    league_id: match.leagueId,
    map: match.map,
    player_count: match.playerCount,
    start_at: toKstIso(match.startAt),
    end_at: toKstIsoOrNull(match.endAt),
    play_time: match.playTime,
    win: match.winnerSide === viewerSide,
    blue_team: match.blueFirst,
    placement: viewerSide === 'red' ? match.redPlacement : match.bluePlacement,
    rating_update: viewerSide === 'red' ? match.redRatingUpdate : match.blueRatingUpdate,
    mvp_player_id: match.mvpPlayerId,
    league_clan: snapshotOf(match, viewerSide),
    opponent: snapshotOf(match, opponentSide),
    red: lineupOf(match, 'red'),
    blue: lineupOf(match, 'blue'),
    player_stat: viewerStat ? toMatchPlayerStat(match, viewerStat, true) : null,
    // 재구성 경기만 값이 있다 (D-068). 우리가 몇 명을 확인했는지 숨기지 않는다
    participant_completeness: match.participantCompleteness,
    evidence_confidence: toConfidence(match.evidenceConfidence),
    official: match.official,
  }
}

/* -------------------------------------------------------------------------- */
/* 기록실 매치 목록                                                              */
/* -------------------------------------------------------------------------- */

/** 커서 한 페이지를 매치 카드로 만든다. 페이지 전체를 **한 번의 쿼리**로 읽는다. */
async function matchPage(
  where: Prisma.MatchWhereInput,
  cursor: string | null,
  size: number,
  viewerOf: (match: MatchRow) => { leagueClanId: string; playerId: string | null },
): Promise<CursorPage<MatchListItem>> {
  const page = await cursorPage<MatchRow>({
    cursor,
    size,
    orderBy: [...MATCH_ORDER],
    reversedOrderBy: [...MATCH_ORDER_REVERSED],
    idOf: (row) => row.id,
    fetch: (args) =>
      prisma.match.findMany({
        where,
        take: args.take,
        orderBy: args.orderBy as never,
        ...(args.cursor ? { cursor: args.cursor, skip: args.skip } : {}),
        select: MATCH_SELECT,
      }),
  })

  return {
    cursor: page.cursor,
    items: page.items.flatMap((match) => {
      const viewer = viewerOf(match)
      const item = toMatchListItem(match, viewer.leagueClanId, viewer.playerId)
      return item ? [item] : []
    }),
  }
}

/**
 * GET /leagueclans/{leagueClanId}/matches — 클랜 기록실.
 * viewer는 언제나 그 클랜이다.
 */
export async function getLeagueClanMatches(
  leagueClanId: string,
  cursor: string | null,
  size: number,
): Promise<CursorPage<MatchListItem> | null> {
  const leagueClan = await prisma.leagueClan.findUnique({
    where: { id: leagueClanId },
    select: { id: true },
  })
  if (!leagueClan) return null

  return matchPage(
    { OR: [{ redLeagueClanId: leagueClanId }, { blueLeagueClanId: leagueClanId }] },
    cursor,
    size,
    () => ({ leagueClanId, playerId: null }),
  )
}

/**
 * GET /leagues/{leagueId}/players/{playerId}/matches — 개인 기록실.
 *
 * viewer는 그 플레이어의 **현재 소속 리그클랜**이다(store.ts와 동일).
 * store.ts는 카드를 만든 뒤 `null`을 걸러내고 페이지를 자르므로,
 * "리그클랜이 참여한 경기"라는 조건을 `where`에 넣은 것과 결과가 같다.
 */
export async function getLeaguePlayerMatches(
  leagueId: string,
  playerId: string,
  cursor: string | null,
  size: number,
): Promise<CursorPage<MatchListItem> | null> {
  const leaguePlayer = await prisma.leaguePlayer.findUnique({
    where: { leagueId_playerId: { leagueId, playerId } },
    select: { id: true, clanId: true },
  })
  if (!leaguePlayer) return null

  const leagueClanId = await leagueClanIdOfPlayer(leagueId, leaguePlayer.clanId)
  // 소속 리그클랜이 없으면 store.ts도 전 항목이 걸러져 빈 페이지가 된다
  if (!leagueClanId) return { items: [], cursor: { prev: null, next: null } }

  return matchPage(
    {
      leagueId,
      stats: { some: { playerId } },
      OR: [{ redLeagueClanId: leagueClanId }, { blueLeagueClanId: leagueClanId }],
    },
    cursor,
    size,
    () => ({ leagueClanId, playerId }),
  )
}

/**
 * 리그플레이어의 소속 리그클랜 ID.
 * DB의 `LeaguePlayer`는 `clanId`(전역 클랜)만 들고 있어 리그 안에서 한 번 더 찾아야 한다.
 */
export async function leagueClanIdOfPlayer(
  leagueId: string,
  clanId: string | null,
): Promise<string | null> {
  if (!clanId) return null
  const leagueClan = await prisma.leagueClan.findUnique({
    where: { leagueId_clanId: { leagueId, clanId } },
    select: { id: true },
  })
  return leagueClan?.id ?? null
}

/* -------------------------------------------------------------------------- */
/* 매치 상세                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * GET /leagues/{leagueId}/matches/{matchId}
 *
 * `viewerLeagueClanId`는 어느 기록실에서 아코디언을 펼쳤는지를 나타낸다.
 * 원본 URL에는 이 정보가 없지만(개별 URL이 없다) 결측 처리를 재현하려면 필요해서
 * 선택적 쿼리 파라미터로 뒀다 (`docs/DECISIONS.md` D-004). 없으면 red 쪽을 기본으로 본다.
 */
export async function getMatch(
  leagueId: string,
  matchId: string,
  viewerLeagueClanId: string | null,
): Promise<MatchDetail | null> {
  const match = await prisma.match.findFirst({
    where: { id: matchId, leagueId },
    select: MATCH_SELECT,
  })
  if (!match) return null

  const viewerId = viewerLeagueClanId ?? match.redLeagueClanId
  const base = toMatchListItem(match, viewerId, null)
  if (!base) return null
  const viewerSide = sideOfLeagueClan(match, viewerId)
  if (!viewerSide) return null

  const statsOf = (side: TeamSide): MatchPlayerStat[] =>
    match.stats
      .filter((stat) => stat.side === side)
      .map((stat) => toMatchPlayerStat(match, stat, side === viewerSide))

  return { ...base, red_stats: statsOf('red'), blue_stats: statsOf('blue') }
}
