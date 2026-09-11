import { prisma, type Prisma } from '@sacloud/db'
import { softFail } from '../softFail'
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
  restoreClanMark,
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
import { resolvePositionsOf } from './playerPositionQuery'
import { matchClanHexV2 } from './clanHexV2'
import { withSeasonWindow } from './season0Scope'

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
/* `export` 는 홈의 최근 경기(`homeRecent.ts`)가 같은 칸·같은 정렬로 읽기 위해서다 (2026-09-02).
   여기 적힌 것 말고 다른 select 를 새로 만들면 카드가 조용히 갈라진다 */
export const MATCH_SELECT = {
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
  /* 전반 공수 (D-207). 옛 `blueFirst` 는 **읽지 않는다** — 뜻이 `[미확인]` 인 채였고
     실제로 값이 든 것은 mock 시드뿐이었다. 근거로 정해진 값은 이쪽이다 */
  firstHalfAttackSide: true,
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
  /* ★명단이 다 찼는지 이미 잡이 판정해 둔 칸★ — 아래 `completenessOf` 가 쓴다 */
  lineupStatus: true,
  evidenceConfidence: true,
  map: { select: { id: true, name: true } },
  /* 라운드 점수 — 클랜 육각 집계 행의 tally.roundsWon (경기당 2행) */
  clanHexV2: { select: { leagueClanId: true, tally: true } },
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
      /* ★이 값이 「뛴 팀」인지 「본인 태그」인지를 가른다★ (2026-09-10) */
      matchTimeClanSource: true,
      /* ★그 선수 본인의 소속 도장★ (2026-09-09 · 사장님 «나(㈩)로 하고»).
         위의 `matchTime*` 은 `barracks-battlelog` 에서 ★그 경기에서 뛴 팀★ 이라
         한 진영 5명이 전부 같은 값이다 — 용병이 남의 마크를 달고 나왔다.
         이 칸은 수집 시점에 박아 둔 본인 소속이다. ★현재 소속을 join 하는 것이 아니다★ —
         도장이라 이적해도 과거 화면이 안 바뀐다 */
      playerClanId: true,
      playerClan: { select: CLAN_SUMMARY_SELECT },
      player: { select: PLAYER_SUMMARY_SELECT },
    },
  },
} satisfies Prisma.MatchSelect

export type MatchRow = Prisma.MatchGetPayload<{ select: typeof MATCH_SELECT }>
type StatRow = MatchRow['stats'][number]

export const MATCH_ORDER = [{ startAt: 'desc' }, { id: 'desc' }] as const
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
  /** 지금 명부의 티어 (2026-09-10) */
  division: number
  /** 구성 보정은 클랜의 **현재** 값이다 (D-149). 경기별 값이 아니다 */
  compositionScore: number | null
  compositionMembers: number | null
  clan: {
    id: string
    slug: string
    name: string
    markBgUrl: string | null
    markFrontUrl: string | null
    /* 등록 클랜 판정용 세 칸. `CLAN_SUMMARY_SELECT` 와 같은 모양이어야 한다 —
       하나라도 빠지면 IPL 클랜이 전부 `미등록` 으로 떨어진다 (D-146 · 2026-08-31) */
    sourceClanId: string | null
    category: string | null
    tier: number | null
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
      /* ★지금 티어★ (2026-09-10 · 사장님: 상대 티어는 지금 명부로) — 경기 당시 스냅샷은 래더 계산에만 쓴다 */
      division: true,
      compositionScore: true,
      compositionMembers: true,
      clan: { select: CLAN_SUMMARY_SELECT },
    },
  })
  return new Map(rows.map((row) => [row.id, row]))
}

/** 매치 목록/상세가 참조하는 모든 리그클랜 id (양 진영 + 참가자의 경기 당시 소속) */
export function leagueClanIdsOf(matches: readonly MatchRow[]): string[] {
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
 * 보는 쪽이 **전반에 선 진영** — 화면의 `선레드` / `선블루` (D-207).
 *
 * ```
 * 선레드 = 레드진영(공격)을 먼저 한 팀
 * 선블루 = 블루진영(수비)을 먼저 한 팀
 * ```
 *
 * ── 슬롯과 진영을 구분한다
 *   `Match.firstHalfAttackSide` 는 **슬롯 이름**(`"red"`/`"blue"`)으로 적힌
 *   "전반에 공격을 맡은 쪽"이다. 보는 쪽이 그 슬롯이면 공격으로 시작했다는 뜻이므로
 *   `선레드`(→ `'red'`), 아니면 `선블루`(→ `'blue'`) 다.
 *
 *   슬롯 자체는 `assignSides()` 가 `team_id` 오름차순으로 정한 내부 자리라
 *   **진영이 아니다.** 실측: red 슬롯이 전반 수비인 경기가 99.87% 였다.
 *
 * ── 모르면 `null`
 *   저장된 값이 없거나 우리가 아는 두 값이 아니면 비운다. 슬롯 순서로 메우지 않는다.
 */
export function firstSideOf(
  firstHalfAttackSide: string | null,
  viewerSide: TeamSide,
): 'red' | 'blue' | null {
  if (firstHalfAttackSide !== 'red' && firstHalfAttackSide !== 'blue') return null
  return firstHalfAttackSide === viewerSide ? 'red' : 'blue'
}

/**
 * 경기 당시 소속 클랜 (D-131).
 *
 * `MatchPlayerStat`에 박아 둔 스냅샷만 읽는다. **현재 소속을 join 하지 않는다** —
 * 선수가 이적하면 과거 기록실이 통째로 바뀌기 때문이다.
 * 근거가 없으면 `null`이다. 현재 소속으로 메우지 않는다.
 */
/**
 * ★「래더 미반영」 배지가 멀쩡한 경기에 다 붙던 것을 고친다★ (2026-09-10 · 사장님 지적).
 *
 * ── 무엇이 잘못됐나
 *   그 배지는 `participant_completeness` 가 `5v5` 가 아닐 때 뜬다. 그런데 ★병영수첩으로
 *   들어온 경기는 그 칸을 아무도 안 쓴다.★ 실측 —
 *   ```
 *   IPL 시즌0 경기 2,344건 중 `participantCompleteness` 가 채워진 것   ★0건★
 *   그런데 실제로 명단이 10명 다 있는 경기                          2,325건
 *   ```
 *   서플라이에서 온 옛 경기(재구성 · D-068)에만 값이 있다. 그래서 ★멀쩡한 경기 전부에
 *   「래더 미반영」이 붙었다.★ 래더 계산은 이 칸을 보지도 않는다 — ★화면 표시만 틀렸다.★
 *
 * ── 어떻게 고치나 — ★새로 세지 않는다★
 *   명단이 다 찼는지는 ★`battlelog-lineup` 잡이 이미 판정해서 `lineupStatus` 에 적어 뒀다.★
 *   그 값을 쓴다. 실측으로 맞춰 봤다 —
 *   ```
 *   lineupStatus='complete' 인 IPL 경기   2,326건
 *   그중 실제로 정확히 5대5               ★2,326건 (전부)★
 *   ```
 *   ★한 건도 안 어긋난다.★ DB 를 고치지 않아도 옛 경기까지 한 번에 바로잡힌다.
 *
 * ⚠ 저장된 값이 있으면 ★그 값이 먼저다.★ 재구성 경기의 `5v3` 같은 값을 덮지 않는다.
 * ⚠ 모르면 ★지어내지 않고 `null`★ 이다. 화면은 그때만 배지를 그린다.
 */
function completenessOf(match: { participantCompleteness: string | null; lineupStatus: string | null }) {
  if (match.participantCompleteness) return match.participantCompleteness
  return match.lineupStatus === 'complete' ? '5v5' : null
}

function matchTimeClanOf(stat: StatRow, clans: LeagueClanContext): MatchTimeClan | null {
  /*
   * ★도장이 있으면 도장이 이긴다★ (2026-09-09).
   *
   * `matchTime*` 은 `barracks-battlelog` 에서 「그 경기에서 뛴 팀」 이라
   * 용병을 표현하지 못한다. 실측 — 시즌0 IPL 참가 21,736줄 중
   * ★1,774줄(8.4%)이 남의 클랜 마크를 달고 있었다.★
   * («베리타스 3명 아마릴리스 2명인데 5명 다 아마릴리스로 뜼다» — 사장님)
   *
   * ★도장도 스냅샷이다.★ 수집 시점에 박았고 다시 안 바꿈다 —
   * 그 선수가 이적해도 과거 경기는 그대로다 (D-131 의 정신 그대로).
   *
   * ⚠ 도장이 없으면 ★옛 방식(팀 값)으로 되돌아간다.★ 지우지 않았다.
   */
  if (stat.playerClan) {
    const official = isOfficialLeagueClan(stat.playerClan)
    return {
      /* 도장은 `Clan` 을 가리킨다. 리그클랜 id 는 이 길로 알 수 없으니
         ★지어내지 않고 비운다★ — 화면은 slug 로 클랜 기록실로 간다 */
      league_clan_id: null,
      slug: stat.playerClan.slug,
      name: stat.playerClan.name,
      mark: official
        ? restoreClanMark({
            bg: stat.playerClan.markBgUrl,
            front: stat.playerClan.markFrontUrl,
          })
        : { bg: null, front: null },
      is_official_clan: official,
    }
  }
  if (!stat.matchTimeClanName) return null

  /*
   * ★도장이 없는데 출처가 「뛴 팀」이면 그 팀을 이 사람 소속인 척하지 않는다★
   * (2026-09-10 · 사장님 지적).
   *
   * > «얘네는 전부 같은 클랜 소속으로 나오는데 막상 눌러서 개인정보 들어가보면
   * >  구름표시로돼있어 가입된 클랜이 없다고 뜨는데 이건 왜이런 현상이 나는지 조사해»
   *
   * `barracks-battlelog` 은 ★선수 개인의 소속을 아예 안 준다.★ 팀까지만 안다.
   * 그래서 그 값을 그대로 쓰면 ★경기 명단에는 팀 마크, 개인정보에는 무소속★ 이 되어
   * 같은 사람이 두 화면에서 다르게 보였다.
   *
   * ★모르면 모른다고 한다.★ 이름을 비우면 화면이 ★공통 구름 마크★ 를 그린다 —
   * 사장님 상시 지시(«이름 앞에 반드시 마크»)는 구름으로 지켜진다.
   *
   * ⚠ 다른 출처(`supply-mirror` · `nexon-detail` · `supply-lineup`)는 ★그 선수 본인의
   *   클랜 태그★ 라 그대로 쓴다. 지운 것이 아니라 ★출처를 가려 쓰는 것★ 이다.
   * ⚠ 되돌리려면 아래 상수를 `false` 로 둔다 (`CLAUDE.md` 1-4).
   */
  const HIDE_TEAM_AS_AFFILIATION: boolean = true
  if (HIDE_TEAM_AS_AFFILIATION && stat.matchTimeClanSource === 'barracks-battlelog') return null

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
    /* 경기 당시 스냅샷은 **DB 에 원본값 그대로 남겨 둔다** (`CLAUDE.md` 5장 1·2번).
       바꾸는 것은 내보내는 값뿐이다 — 저장된 과거 기록은 손대지 않고 화면만 넥슨을 본다 (D-227) */
    mark: official
      ? restoreClanMark({
          bg: stat.matchTimeClanMarkBgUrl,
          front: stat.matchTimeClanMarkFrontUrl,
        })
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
  /**
   * 선수의 **고유 포지션** 표기 (D-199). 경기 **상세**에서만 채운다 —
   * 목록에서는 비어 있고(`null`) 화면은 이름만 적는다. 계약 주석 참조.
   */
  positions?: Map<string, string | null>,
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
    /* 포지션은 이 경기의 사실이 아니라 **그 선수의 고유 자리**다 (D-199).
       바로 위 `weapon` 과 나란히 놓으면 `숏 · 스나` 처럼 읽힌다 —
       "스나수가 무조건 스나를 드는것만은 아니야" 를 화면이 그대로 말할 수 있다.
       모르면 `null` 이고 화면은 이름만 적는다 (D-106) */
    position_label: positions?.get(stat.playerId) ?? null,
    /* 세이브는 경기 상세가 배틀로그 표를 읽어 덮어쓴다. 목록에서는 모른다 (2026-09-10) */
    saves: null,
    save_chances: null,
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
    /* 지금 명부의 티어. 명부에 없으면 경기 당시 값 (2026-09-10) */
    division: leagueClan?.division ?? (isRed ? match.redDivisionAtMatch : match.blueDivisionAtMatch),
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
/** 목록 줄의 라운드 점수 — 상세(`roundsWonOf`)와 같은 자리에서 같은 값을 읽는다 */
function roundsWonInList(match: MatchRow, leagueClanId: string): number | null {
  const row = match.clanHexV2.find((r) => r.leagueClanId === leagueClanId)
  const tally = row?.tally as { roundsWon?: unknown } | null | undefined
  return typeof tally?.roundsWon === 'number' ? tally.roundsWon : null
}

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
    /* 보는 쪽이 **전반에 선 진영** (D-207).

       `firstHalfAttackSide` 는 우리 **슬롯** 이름이다 — 전반에 레드진영(공격)을 맡은
       슬롯이 red 였나 blue 였나. 보는 쪽이 그 슬롯이면 `선레드`, 아니면 `선블루` 다.

       **슬롯 이름을 그대로 진영으로 내보내지 않는다.** red/blue 슬롯은 `assignSides()` 가
       `team_id` 오름차순으로 정한 내부 자리이고, 실측상 red 슬롯은 99.87% 가 전반 **수비**였다.
       그걸 `선레드` 로 적던 것이 이번에 고친 결함이다.

       근거가 없으면 `null` 이다. `team_id` 순서를 후퇴값으로 쓰지 않는다 —
       반례 5건(0.13%)이 실재한다. */
    first_side: firstSideOf(match.firstHalfAttackSide, viewerSide),
    placement: viewerSide === 'red' ? match.redPlacement : match.bluePlacement,
    /* 카드 오른쪽 위 증감.

       **선수 본인 값을 먼저 쓴다.** 원본 화면도 그 선수의 증감을 보여 준다.
       클랜 단위 칸(`red/blueSourceRatingUpdate`)은 **한 경기에 한쪽만** 채워져 있다 —
       실측: supply 13만 경기 중 red 64,860 · blue 65,162 로 합이 딱 13만이다.
       그래서 반대편에서 보면 늘 비었고 화면에 `알수없음` 이 절반이나 나왔다.
       선수별 값(`sourceRatingDelta`)은 참가행 130만 건에 **전부** 있다. */
    rating_update:
      viewerStat?.ratingUpdate ??
      viewerStat?.sourceRatingDelta ??
      (viewerSide === 'red'
        ? (match.redRatingUpdate ?? match.redSourceRatingUpdate)
        : (match.blueRatingUpdate ?? match.blueSourceRatingUpdate)),
    mvp_player_id: match.mvpPlayerId,
    red_rounds: roundsWonInList(match, match.redLeagueClanId),
    blue_rounds: roundsWonInList(match, match.blueLeagueClanId),
    league_clan_side: viewerSide,
    league_clan: snapshotOf(match, viewerSide, clans),
    opponent: snapshotOf(match, opponentSide, clans),
    red: lineupOf(match, 'red', clans),
    blue: lineupOf(match, 'blue', clans),
    player_stat: viewerStat ? toMatchPlayerStat(match, viewerStat, true, clans) : null,
    // 재구성 경기만 값이 있다 (D-068). 우리가 몇 명을 확인했는지 숨기지 않는다
    participant_completeness: completenessOf(match),
    evidence_confidence: toConfidence(match.evidenceConfidence),

  }
}

/* -------------------------------------------------------------------------- */
/* 기록실 매치 목록                                                              */
/* -------------------------------------------------------------------------- */

/**
 * 커서 한 페이지를 매치 카드로 만든다. 페이지 전체를 **한 번의 쿼리**로 읽는다.
 *
 * ── ★ 2026-09-02 결함 #32 — **기록실 경기 목록에도 시즌 창을 건다**
 *   사장님: *"시즌이 7/1부터인데 기록이 … 내가 짜르라고 했잖아"*. 선수 기록실에 6월 3일 경기가
 *   「3달 전」 카드로 그대로 나왔다.
 *
 *   ⚠ 옛 규칙 (D-175 정한 것 ② · `season0Scope.ts` 머리말) — «기록실(경기 목록)·매치 상세에는 창을
 *     **안 건다**. 옛 기록은 거기서 계속 보인다». 그 판단을 사장님 지시로 뒤집는다.
 *     성적 수치(요약 · 일별 · 오늘 · 티어별 · 클랜 지표 · 명단)는 이미 다 걸려 있었고
 *     **목록만** 전 기간이라 숫자와 카드가 어긋나 보였다.
 *
 *   데이터는 지우지 않는다 — 화면이 거를 뿐이다. 과거 시즌 조회는 별도 기능이다 (`CLAUDE.md` 3-A 7).
 *   매치 상세(`getMatch` · 주소로 직접 여는 것)도 2026-09-04 부터 같이 걸린다 — 아래 `getMatch` 참조.
 *   같은 함수(`withSeasonWindow`)라 창이 바뀌면 여기도 같이 바뀐다 — 새 기준을 만들지 않았다.
 */
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
        where: withSeasonWindow(where),
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
  /** 상대 하나로 거른다 — 클랜 상세 «맞대결 기록» (2026-09-10) */
  opponentLeagueClanId: string | null = null,
): Promise<CursorPage<MatchListItem> | null> {
  const leagueClan = await prisma.leagueClan.findUnique({
    where: { id: leagueClanId },
    select: { id: true, leagueId: true },
  })
  if (!leagueClan) return null

  return matchPage(
    opponentLeagueClanId
      ? {
          OR: [
            { redLeagueClanId: leagueClanId, blueLeagueClanId: opponentLeagueClanId },
            { redLeagueClanId: opponentLeagueClanId, blueLeagueClanId: leagueClanId },
          ],
        }
      : { OR: [{ redLeagueClanId: leagueClanId }, { blueLeagueClanId: leagueClanId }] },
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

/**
 * **리그 전체 경기 목록** (2026-09-03 · O-015).
 *
 * ══ 왜 생겼나 ══
 *
 * **닉네임도 클랜명도 모르는 사람은 이 사이트에서 볼 게 하나도 없었다.**
 * 홈의 최근경기는 O-001 로 뺐고(사장님 지시), 경기 목록 화면은 원래 없었다.
 * > 강민재 — *"검색어를 모르는 사람이 사이트에서 처음으로 볼 게 생긴다."*
 *
 * ══ 옛 함수를 고쳐 쓰지 않았다 ══
 *
 * `homeRecent.ts` 의 `getLeagueRecentMatches()` 가 같은 모양을 돌려주지만
 * **최신 N건**만 준다 — 커서가 없다. 그것을 고치면 홈(옛 화면)의 동작이 같이 바뀐다.
 * 그래서 **옆에 새로 만들었다.** 옛 함수는 그대로 산다 (`CLAUDE.md` 10-4).
 *
 * ══ 보는 쪽을 누구로 두나 — ★한 번 틀렸다★ ══
 *
 * 선수 기록실은 **그 선수가 뛴 팀**, 클랜 기록실은 **그 클랜**을 기준으로 본다.
 * 이 목록은 **아무 편도 아니다** — 리그 전체를 늘어놓는 자리다.
 *
 * 처음에는 `homeRecent.ts` 를 따라 **이긴 팀**을 기준으로 삼았다. 그런데 그 파일은
 * 「이긴 팀 · 진 팀」을 나란히 적는 **한 줄짜리** 화면용이고, 이 목록이 쓰는 `MatchCard` 는
 * **보는 쪽 기준으로 「승리 / 패배」를 크게 적는다.**
 * ```
 * 결과   ★스무 줄이 전부 「승리」★   (2026-09-03 운영 실측 · 강민재)
 *        경기상세를 열면 승패가 멀쩡히 나온다 — 목록만 거짓말을 했다
 * ```
 * **이긴 팀을 「우리」로 세우면 언제나 우리가 이긴다.** 당연한데 못 봤다.
 *
 * 그래서 **`red` 슬롯**을 기준으로 본다. `red`/`blue` 는 **슬롯 이름이지 진영이 아니고**
 * (D-184 · D-207) 누구 편도 아니다. 그러면 카드가 「red 클랜 승리/패배 vs blue 클랜」이 되어
 * **양쪽이 다 보인다.**
 *
 * ⚠ **선수·클랜 기록실은 안 건드렸다.** 거기서는 「내 편」이 있고 지금이 맞다.
 * ⚠ 편을 지어내지 않는다 — `red` 는 경기 자신이 들고 있는 값이다.
 */
export async function getLeagueMatches(
  leagueId: string,
  cursor: string | null,
  size: number,
): Promise<CursorPage<MatchListItem>> {
  return matchPage(
    { leagueId },
    cursor,
    size,
    /* `red` 슬롯 고정. 승자를 보지 않는다 — 위 「한 번 틀렸다」 참조 */
    (match) => ({ leagueClanId: match.redLeagueClanId, playerId: null }),
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
  /**
   * **창 밖 경기는 열리지 않는다** (2026-09-04 · 사장님 지시).
   *
   * 사장님: *"9/3일 오전 7시 전 기록은 전부 다 버린다"* · *"못 열게"* ·
   * *"SPL 경기 굳이 경기상세 이전꺼 띄우지말고 걍 카드로 만들어서"*.
   *
   * ⚠ 옛 규칙 — «매치 상세는 그대로 둔다». 그 판단을 뒤집는다.
   *   목록은 이미 창에 걸려 있었는데(`matchPage`) 상세만 안 걸려서,
   *   **목록엔 없는데 주소로는 열리는** 상태였다. 한쪽만 막는 건 막은 게 아니다.
   *
   * **지우지 않는다 — 화면이 거를 뿐이다** (사장님이 「B」로 고르셨다).
   * 행은 DB 에 그대로 있고, 나중에 지난시즌 조회를 붙이면 다시 보인다.
   */
  const match = await prisma.match.findFirst({
    where: withSeasonWindow({ leagueId, OR: [{ sourceMatchId: matchId }, { id: matchId }] }),
    select: MATCH_SELECT,
  })
  if (!match) return null

  const clans = await loadLeagueClanContext(leagueId, leagueClanIdsOf([match]))
  const viewerId = viewerLeagueClanId ?? match.redLeagueClanId
  const base = toMatchListItem(match, viewerId, null, clans)
  if (!base) return null
  const viewerSide = sideOfLeagueClan(match, viewerId)
  if (!viewerSide) return null

  /* 참가자 포지션 — **여기서만** 읽는다 (D-199). 목록에서는 읽지 않는다.
     한 경기 열 명이라 왕복 세 번으로 끝난다 (`resolvePositionsOf`).
     실패해도 경기 상세를 죽이지 않는다 — 그때는 포지션 없이 그린다 */
  const positionsResolved = await softFail(
    'match-positions',
    new Map<string, { label: string | null }>(),
    { leagueId, matchId: match.id },
  )(resolvePositionsOf(leagueId, match.stats.map((stat) => stat.playerId)))
  const positions = new Map<string, string | null>(
    [...positionsResolved].map(([id, value]) => [id, value.label]),
  )

  /* ★세이브 · 라운드 스코어★ (2026-09-10) — 배틀로그에서 접어 둔 표를 읽는다. 없으면 null */
  const [saveRows, hexRows] = await Promise.all([
    softFail('match-saves', [] as { playerId: string; aloneWon: number; aloneRounds: number }[], { matchId: match.id })(
      prisma.matchPlayerHex.findMany({ where: { matchId: match.id }, select: { playerId: true, aloneWon: true, aloneRounds: true } }),
    ),
    softFail('match-rounds', [] as { leagueClanId: string; tally: unknown }[], { matchId: match.id })(
      prisma.matchClanHexV2.findMany({ where: { matchId: match.id }, select: { leagueClanId: true, tally: true } }),
    ),
  ])
  const savesOf = new Map(saveRows.map((row) => [row.playerId, row.aloneWon]))
  const chancesOf = new Map(saveRows.map((row) => [row.playerId, row.aloneRounds]))
  const roundsWonOf = (leagueClanId: string): number | null => {
    const row = hexRows.find((entry) => entry.leagueClanId === leagueClanId)
    const tally = row?.tally as { roundsWon?: unknown } | null | undefined
    return typeof tally?.roundsWon === 'number' ? tally.roundsWon : null
  }
  const statsOf = (side: TeamSide): MatchPlayerStat[] =>
    match.stats
      .filter((stat) => stat.side === side)
      .map((stat) => ({
        ...toMatchPlayerStat(match, stat, side === viewerSide, clans, positions),
        saves: saveRows.length > 0 ? (savesOf.get(stat.playerId) ?? 0) : null,
        save_chances: saveRows.length > 0 ? (chancesOf.get(stat.playerId) ?? 0) : null,
      }))

  /* 두 클랜의 육각형 V2 — **겹쳐 그리라고** 양쪽 다 읽는다 (D-235 Q7).
     경기 하나라 표본이 1이고, 그래서 리그 백분위가 아니라 **두 클랜의 상대 비교**다.
     슬롯(`red`/`blue`)은 이미 알고 있으니 넘겨 준다 — 왕복 한 번을 아낀다.
     배틀로그 행이 없으면 `null` 이고 화면은 도형을 안 그린다 (D-106).
     실패해도 경기 상세를 죽이지 않는다 — 그때는 육각형 없이 그린다 */
  const hexV2 = await softFail('match-hexagon-v2', null, { matchId: match.id })(
    matchClanHexV2(match.id, {
      redLeagueClanId: match.redLeagueClanId,
      blueLeagueClanId: match.blueLeagueClanId,
    }),
  )

  return {
    ...base,
    red_stats: statsOf('red'),
    blue_stats: statsOf('blue'),
    viewer_side: viewerSide,
    red_rounds: roundsWonOf(match.redLeagueClanId),
    blue_rounds: roundsWonOf(match.blueLeagueClanId),
    red_hexagon_v2: hexV2?.red
      ? { league_clan_id: hexV2.red.leagueClanId, hexagon: hexV2.red.hexagon }
      : null,
    blue_hexagon_v2: hexV2?.blue
      ? { league_clan_id: hexV2.blue.leagueClanId, hexagon: hexV2.blue.hexagon }
      : null,
  }
}
