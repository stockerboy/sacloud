import { prisma, type Prisma } from '@sacloud/db'
import {
  kdRateOrNull,
  percentOf,
  type MatchDetail,
  type MatchLineupEntry,
  type MatchListItem,
  type MatchTimeClan,
  type MatchPlayerStat,
  type TeamSide,
  type Weapon,
} from '@sacloud/contract'
import { cursorPage, type CursorPage } from '../cursorPage'
import { toKstIso, toKstIsoOrNull } from '../format'
import {
  CLAN_SUMMARY_SELECT,
  PLAYER_SUMMARY_SELECT,
  isOfficialLeagueClan,
  toClanSummary,
} from '../mappers'
import { publicOriginWhere } from './publicScope'

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
 * 한 번의 `findMany`로 맵·참가자 기록·참가자 이름까지 같이 읽는다.
 * 경기마다 추가 쿼리를 날리면 한 페이지(20건)에 수십 번의 왕복이 생긴다(N+1).
 *
 * **양쪽 클랜은 여기서 읽지 않는다.** Prisma 는 중첩 `select` 하나당 쿼리를 한 번 더
 * 던지므로 `redClan{clan}` · `blueClan{clan}` 만으로 왕복이 4번 늘어나고,
 * 거기에 공식 클랜 판정용 쿼리가 또 하나 붙어 있었다(합 5회).
 * 서버리스 + 풀러 환경에서는 왕복 1회가 곧 네트워크 지연 1회다.
 * 대신 페이지에 등장하는 리그클랜을 모아 `loadLeagueClanContext` 로 **한 번에** 읽는다.
 *
 * 참가자 정렬은 `id asc`다. 시드가 red 로스터 → blue 로스터 순으로 넣으므로
 * 삽입 순서가 그대로 유지된다. 원본의 라인업 정렬 기준은 [미확인].
 */
const MATCH_SELECT = {
  id: true,
  /* 밖으로 나가는 경기 번호는 이 값이다 — `id` 가 아니다 (D-155).
     DB 는 같은 경기를 리그마다 다른 행으로 갖느라 기본키에 리그 slug 를 붙인다
     (`<18자리>@<리그slug>`). 그건 우리 저장 사정이라 사용자 URL 에 새어 나가면 안 된다 */
  sourceMatchId: true,
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
  /* 미러링해 온 경기는 우리 공식(D-145)이 계산한 위 두 칸이 **비어 있다.**
     원본이 준 점수는 아래 `source` 칸에 있다 (D-153). 그래서 둘 다 읽고,
     우리 값이 없으면 원본값을 쓴다. 이걸 안 읽어서 매치 카드 오른쪽 위가
     `알수없음` 으로 나왔다 — supply 13만 경기 중 우리 값이 있는 것은 98건뿐이다. */
  redSourceRating: true,
  blueSourceRating: true,
  redSourceRatingUpdate: true,
  blueSourceRatingUpdate: true,
  origin: true,
  participantCompleteness: true,
  evidenceConfidence: true,
  map: { select: { id: true, name: true } },
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
      /* 참가자도 같다 — 미러 경기는 원본이 **선수별로** 점수와 증감을 준다 (D-153) */
      sourceRating: true,
      sourceRatingDelta: true,
      isPlacement: true,
      participantRole: true,
      /* 경기 당시 소속 스냅샷 (D-131). **현재 소속을 join 하지 않는다** —
         선수가 이적해도 과거 화면이 바뀌면 안 된다 */
      matchTimeClanName: true,
      matchTimeLeagueClanId: true,
      matchTimeClanSlug: true,
      matchTimeClanMarkBgUrl: true,
      matchTimeClanMarkFrontUrl: true,
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
    // 시드 리그는 공개 경로에서 없는 것으로 다룬다 (D-116)
    where: { OR: [{ slug: leagueIdOrSlug }, { id: leagueIdOrSlug }], ...publicOriginWhere() },
    select: { id: true },
  })
  return league?.id ?? null
}

/* -------------------------------------------------------------------------- */
/* 리그클랜 컨텍스트                                                             */
/* -------------------------------------------------------------------------- */

/** 경기 카드 한 장이 클랜에 대해 알아야 하는 전부 */
export interface LeagueClanInfo {
  id: string
  /** 구성 보정은 클랜의 **현재** 값이다 (D-149). 경기별 값이 아니다 */
  compositionScore: number | null
  compositionMembers: number | null
  clan: {
    id: string
    slug: string
    name: string
    markBgUrl: string | null
    markFrontUrl: string | null
    sourceClanId: string | null
  }
}

/** 리그클랜 id → 정보. 없는 id 는 "우리 리그 밖" 이라는 뜻이다 */
export type LeagueClanContext = ReadonlyMap<string, LeagueClanInfo>

/**
 * 페이지에 등장하는 리그클랜을 **한 번에** 읽는다.
 *
 * 예전에는 같은 정보를 세 군데서 따로 읽었다 — `redClan` 중첩 select, `blueClan` 중첩
 * select, 그리고 공식 등록 여부를 위한 `officialLeagueClanIds`. Prisma 는 중첩 관계마다
 * 쿼리를 따로 던지므로 실제로는 왕복이 5번이었다.
 *
 * `leagueId` 로 함께 좁히는 것은 예전 `officialLeagueClanIds(leagueId)` 와 같은 규칙을
 * 지키기 위해서다 — **다른 리그의 리그클랜은 공식으로 보지 않는다.**
 * 여기서 찾지 못한 id 는 예전에 `Set.has()` 가 false 를 내던 경우와 같다.
 */
export async function loadLeagueClanContext(
  leagueId: string,
  ids: Iterable<string | null>,
): Promise<LeagueClanContext> {
  const wanted = [...new Set([...ids].filter((id): id is string => Boolean(id)))]
  if (wanted.length === 0) return new Map()

  const rows = await prisma.leagueClan.findMany({
    where: { leagueId, id: { in: wanted } },
    select: {
      id: true,
      compositionScore: true,
      compositionMembers: true,
      clan: { select: CLAN_SUMMARY_SELECT },
    },
  })
  return new Map(rows.map((row) => [row.id, row]))
}

/** 매치 목록/상세가 참조하는 모든 리그클랜 id (양 진영 + 참가자의 경기 당시 소속) */
function leagueClanIdsOf(matches: readonly MatchRow[]): string[] {
  const ids: string[] = []
  for (const match of matches) {
    ids.push(match.redLeagueClanId, match.blueLeagueClanId)
    for (const stat of match.stats) {
      if (stat.matchTimeLeagueClanId) ids.push(stat.matchTimeLeagueClanId)
    }
  }
  return ids
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

/**
 * 경기 당시 소속 클랜 (D-131).
 *
 * `MatchPlayerStat`에 박아 둔 스냅샷만 읽는다. **현재 소속을 join 하지 않는다** —
 * 선수가 이적하면 과거 기록실이 통째로 바뀌기 때문이다.
 * 근거가 없으면 `null`이다. 현재 소속으로 메우지 않는다.
 */
function matchTimeClanOf(stat: StatRow, clans: LeagueClanContext): MatchTimeClan | null {
  if (!stat.matchTimeClanName) return null
  /* **경기 당시** 공식 1/2부 등록 클랜이었는가 (D-146).
     우리 리그 클랜으로 연결됐고, 그 클랜이 공식 레지스트리에서 온 것이어야 한다.
     외부 클랜은 이름만 남기고 마크는 내보내지 않는다 — 화면이 fallback 마크를 그린다. */
  const linked = stat.matchTimeLeagueClanId ? clans.get(stat.matchTimeLeagueClanId) : undefined
  const official = linked ? isOfficialLeagueClan(linked.clan) : false
  return {
    // 우리 리그 밖의 클랜이면 이름만 안다. 빈 문자열로 있는 척하지 않는다 (D-138)
    league_clan_id: stat.matchTimeLeagueClanId,
    slug: stat.matchTimeClanSlug,
    name: stat.matchTimeClanName,
    mark: official
      ? { bg: stat.matchTimeClanMarkBgUrl, front: stat.matchTimeClanMarkFrontUrl }
      : { bg: null, front: null },
    is_official_clan: official,
  }
}

function lineupOf(
  match: MatchRow,
  side: TeamSide,
  clans: LeagueClanContext,
): MatchLineupEntry[] {
  return match.stats
    .filter((stat) => stat.side === side)
    .map((stat) => ({
      player_id: stat.playerId,
      name: stat.player.name,
      weapon: stat.weapon as Weapon | null,
      dropout: stat.dropout,
      match_time_clan: matchTimeClanOf(stat, clans),
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
function toMatchPlayerStat(
  match: MatchRow,
  stat: StatRow,
  visible: boolean,
  clans: LeagueClanContext,
): MatchPlayerStat {
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
    kd_rate: kdRateOrNull(stat.kill, stat.death),
    damage_percent: damage === null ? null : percentOf(damage, teamDamage(match, stat.side)),
    headshot_percent: headshot === null || stat.kill === null ? null : percentOf(headshot, stat.kill),
    weapon: stat.weapon as Weapon | null,
    /* 우리 계산값이 없으면 원본값을 쓴다 (D-153 · D-164 와 같은 이유).
       `sourceRating` 은 **경기 당시가 아니라 수집 시점의 현재 래더**다 — 원본 화면도
       그 값을 그대로 보여 준다. 래더 재계산에는 절대 쓰지 않는다 (스키마 주석 참조). */
    rating: stat.ratingBefore ?? stat.sourceRating,
    rating_update: stat.ratingUpdate ?? stat.sourceRatingDelta,
    placement: stat.isPlacement,
    dropout: stat.dropout,
    // DB는 진영 승패만 들고 있다 (참가자별 win 컬럼 없음). 진영으로 판정한다.
    win: match.winnerSide === stat.side,
    mvp: stat.mvp,
    match_time_clan: matchTimeClanOf(stat, clans),
  }
}

/** DB의 문자열을 계약의 등급으로 좁힌다. 모르는 값이면 null이다 */
function toConfidence(value: string | null): 'high' | 'medium' | 'low' | null {
  return value === 'high' || value === 'medium' || value === 'low' ? value : null
}

/** 경기 시점 클랜 스냅샷 (당시 래더·부리그·배치 여부) */
/**
 * 클랜 래더 반영률 — **D-145 에서 폐기됐다.**
 *
 * 예전에는 본클랜원 수로 증감을 깎았다(3명↑ 100% · 2명 70% · 1명 40% · 0명 0%).
 * **D-145 에서 폐기됐다.** 정상 5v5 면 양 팀 모두 그대로 반영되고, 클랜원 수는
 * 최근 20경기 평균이 상한 +50 의 구성 보정으로만 클랜 점수에 들어간다.
 *
 * 그래서 `clan_weight`(반영률) 필드도 D-149 에서 **없앴다** — 남겨 두면
 * 누군가 다시 퍼센트로 그린다. 대신 실제 구성 보정값을 그대로 내보낸다.
 */

function snapshotOf(match: MatchRow, side: TeamSide, clans: LeagueClanContext) {
  const isRed = side === 'red'
  const leagueClanId = isRed ? match.redLeagueClanId : match.blueLeagueClanId
  /* 경기가 걸려 있으면 리그클랜 행은 반드시 있다(FK). 그래도 조회 결과가 비면
     여기서 터뜨리지 말고 빈 값으로 내려보낸다 — 목록 전체가 500이 되는 편이 더 나쁘다 */
  const leagueClan = clans.get(leagueClanId)

  // 재구성 경기만 역할이 기록돼 있다. 아니면 구성을 말할 근거가 없으므로 null이다
  const sideStats = match.stats.filter((stat) => stat.side === side)
  const reconstructed = match.origin === 'nexon' && sideStats.length > 0
  const members = sideStats.filter((stat) => stat.participantRole === 'member').length

  return {
    league_clan_id: leagueClanId,
    clan: toClanSummary(
      leagueClan?.clan ?? {
        id: '',
        slug: '',
        name: '',
        markBgUrl: null,
        markFrontUrl: null,
        sourceClanId: null,
      },
    ),
    /* 클랜 점수도 우리 계산값이 없으면 원본값을 쓴다 (D-153) */
    rating: isRed
      ? (match.redRatingBefore ?? match.redSourceRating)
      : (match.blueRatingBefore ?? match.blueSourceRating),
    division: isRed ? match.redDivisionAtMatch : match.blueDivisionAtMatch,
    placement: isRed ? match.redPlacement : match.bluePlacement,
    members_confirmed: reconstructed ? members : null,
    mercenaries_confirmed: reconstructed ? sideStats.length - members : null,
    /* DB 에 계산돼 있는 값을 그대로 쓴다. 여기서 다시 계산하지 않는다 (D-149) */
    composition_score: leagueClan?.compositionScore ?? null,
    composition_members: leagueClan?.compositionMembers ?? null,
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
  clans: LeagueClanContext,
): MatchListItem | null {
  const viewerSide = sideOfLeagueClan(match, viewerLeagueClanId)
  if (!viewerSide) return null
  const opponentSide: TeamSide = viewerSide === 'red' ? 'blue' : 'red'

  const viewerStat = viewerPlayerId
    ? match.stats.find((stat) => stat.playerId === viewerPlayerId && stat.side === viewerSide)
    : undefined

  return {
    /* 원본 경기 번호(18자리)를 그대로 내보낸다. 옛 행은 `id` 가 곧 경기 번호라 그대로 떨어진다.
       mock 시드처럼 `sourceMatchId` 가 없는 행도 기존 동작이 유지된다 (D-155) */
    id: match.sourceMatchId ?? match.id,
    league_id: match.leagueId,
    map: match.map,
    player_count: match.playerCount,
    start_at: toKstIso(match.startAt),
    end_at: toKstIsoOrNull(match.endAt),
    play_time: match.playTime,
    win: match.winnerSide === viewerSide,
    blue_team: match.blueFirst,
    placement: viewerSide === 'red' ? match.redPlacement : match.bluePlacement,
    rating_update:
      viewerSide === 'red'
        ? (match.redRatingUpdate ?? match.redSourceRatingUpdate)
        : (match.blueRatingUpdate ?? match.blueSourceRatingUpdate),
    mvp_player_id: match.mvpPlayerId,
    league_clan: snapshotOf(match, viewerSide, clans),
    opponent: snapshotOf(match, opponentSide, clans),
    red: lineupOf(match, 'red', clans),
    blue: lineupOf(match, 'blue', clans),
    player_stat: viewerStat ? toMatchPlayerStat(match, viewerStat, true, clans) : null,
    // 재구성 경기만 값이 있다 (D-068). 우리가 몇 명을 확인했는지 숨기지 않는다
    participant_completeness: match.participantCompleteness,
    evidence_confidence: toConfidence(match.evidenceConfidence),

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
  leagueId: string,
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

  /* 페이지에 등장하는 리그클랜을 한 번에 읽는다 (공식 등록 판정 포함, D-146) */
  const clans = await loadLeagueClanContext(leagueId, leagueClanIdsOf(page.items))

  return {
    cursor: page.cursor,
    items: page.items.flatMap((match) => {
      const viewer = viewerOf(match)
      const item = toMatchListItem(match, viewer.leagueClanId, viewer.playerId, clans)
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
    select: { id: true, leagueId: true },
  })
  if (!leagueClan) return null

  return matchPage(
    { OR: [{ redLeagueClanId: leagueClanId }, { blueLeagueClanId: leagueClanId }] },
    cursor,
    size,
    () => ({ leagueClanId, playerId: null }),
    leagueClan.leagueId,
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

  /* 보는 기준은 **그 경기에서 뛴 팀**이다. 현재 소속으로 거르지 않는다 (D-131).
     현재 클랜으로 필터하면 이적한 선수의 과거 경기가 자기 기록실에서 통째로 사라진다.
     `stats.some`이 이미 "이 선수가 뛴 경기"로 좁히므로 클랜 조건은 필요 없다. */
  return matchPage(
    { leagueId, stats: { some: { playerId } } },
    cursor,
    size,
    (match) => ({ leagueClanId: leagueClanOfPlayerInMatch(match, playerId), playerId }),
    leagueId,
  )
}

/** 그 경기에서 이 선수가 뛴 팀의 리그클랜. 참가 기록이 없으면 red 쪽을 기본으로 본다 */
function leagueClanOfPlayerInMatch(match: MatchRow, playerId: string): string {
  const stat = match.stats.find((row) => row.playerId === playerId)
  if (!stat) return match.redLeagueClanId
  return stat.side === 'red' ? match.redLeagueClanId : match.blueLeagueClanId
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
  /**
   * **리그를 반드시 함께 건다** (D-155).
   *
   * 같은 경기 번호가 여러 리그에 있다 — 클랜이 리그를 겸하면 그 경기는 양쪽에 다 찍힌다.
   * 리그 없이 경기 번호로만 찾으면 **엉뚱한 리그의 기록**이 나온다. 실제로 나올 수 있다:
   * 공식리그와 열산리그에 같은 번호의 행이 1,828건 겹친다.
   *
   * `sourceMatchId` 를 먼저 보고 `id` 도 함께 본다 — 이 파이프라인이 예전에 넣은 행은
   * `id === sourceMatchId` 이고(12,567행), mock 시드는 `sourceMatchId` 가 없다.
   */
  const match = await prisma.match.findFirst({
    where: { leagueId, OR: [{ sourceMatchId: matchId }, { id: matchId }] },
    select: MATCH_SELECT,
  })
  if (!match) return null

  const clans = await loadLeagueClanContext(leagueId, leagueClanIdsOf([match]))
  const viewerId = viewerLeagueClanId ?? match.redLeagueClanId
  const base = toMatchListItem(match, viewerId, null, clans)
  if (!base) return null
  const viewerSide = sideOfLeagueClan(match, viewerId)
  if (!viewerSide) return null

  const statsOf = (side: TeamSide): MatchPlayerStat[] =>
    match.stats
      .filter((stat) => stat.side === side)
      .map((stat) => toMatchPlayerStat(match, stat, side === viewerSide, clans))

  return { ...base, red_stats: statsOf('red'), blue_stats: statsOf('blue') }
}
