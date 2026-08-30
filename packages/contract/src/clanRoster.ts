/**
 * 클랜페이지 **클랜원 정리** — 포지션별 · 1군/2군 (`docs/SITE_SPEC_V2.md` 5-2).
 *
 * 사용자 원문:
 * > `클랜원 포지별로 싹 정리(1군과 2군을 점수대별로 분리)`
 *
 * ```
 * 1군
 *   숏포지   nudi
 *   2F       쨔잉나
 *   스나수   huwho
 *   B리베    차값 · yuhwan
 * 2군
 *   숏포지   …
 *   포지션 미정  …
 * ```
 *
 * **원본(3rd.supply)에 없는 화면이다.** 사용자 지시로 만든 신규 기능이고
 * 원본과 동일함이 검증되지 않았다 (`CLAUDE.md` 3장 7번).
 * 기존 클랜원 목록(`/league/{slug}/clan/{slug}/player`)은 **그대로 둔다** —
 * 방식을 바꿀 때 앞 버전도 남긴다는 사용자 지시다.
 *
 * ── 왜 계약에 두는가
 *   실제 서버(`apps/web/lib/server/queries/clanRoster.ts`)와 Mock(`packages/mock`)이
 *   **같은 함수**를 부른다. 두 곳에서 따로 나누면 mock↔live 대조가 조용히 어긋난다
 *   (`clanMetrics`(SITE_SPEC_V2 5절) · 육각형(D-185)과 같은 구조다).
 *
 * ── 포지션을 여기서 판정하지 않는다
 *   판정은 이미 끝나 있다 — `PlayerPositionProfile`(좌표) + `resolvePlayerPositionOf()`
 *   (D-199). 이 파일은 **이미 정해진 포지션으로 줄을 세우기만** 한다.
 *
 * ── 모르는 포지션을 지어내지 않는다 (D-106)
 *   좌표 판정의 격차(`margin`)가 좁으면 판정기가 애초에 비워서 준다
 *   (`POSITION_MIN_MARGIN`). 그런 선수는 `포지션 미정` 묶음으로 간다.
 *   빈 자리를 남는 선수로 메우지 않는다 — `B리베` 가 한 명이면 한 명인 것이다.
 */
import { z } from 'zod'
import { Count, Id, Rating } from './common'
import { PlayerSummary } from './entities/summaries'
import {
  POSITION_LABEL,
  POSITION_TEAM_SLOTS,
  type PositionCode,
  type PositionSource,
} from './playerPosition'

/* -------------------------------------------------------------------------- */
/* 상수                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * 1군 인원 — **5명**.
 *
 * 한 팀 구성이 `숏1 · 2F1 · 스나1 · B리베2` 로 다섯 자리이기 때문이다 (D-199).
 * 포지션마다 한 명씩 뽑는 것이 아니라 **클랜 안 상위 5명**을 그대로 1군으로 본다 —
 * 그래야 "B리베가 셋인 1군" 같은 실제 구성이 화면에 그대로 드러난다.
 * 자리를 맞추려고 5위 밖 선수를 끌어올리면 없는 사실을 만드는 것이다.
 *
 * > `[미확인]` 사양에 1군/2군 경계가 없다. 우리가 정한 값이다.
 */
export const CLAN_ROSTER_FIRST_SQUAD_SIZE = 5

/**
 * 1군 후보가 되려면 필요한 **최소 판수** — 10판.
 *
 * ── 왜 필요한가
 *   래더만으로 자르면 **한 판 뛰고 래더가 높은 선수**가 1군 맨 위에 올라온다.
 *   배치고사 직후나 이적 직후에 실제로 그렇게 된다. 판수가 적은 래더는
 *   그 선수의 실력이 아니라 초기값에 가깝다.
 *
 * ── 왜 10인가
 *   `TIER_WIN_RATE_MIN_GAMES`(승률을 보여 주기 시작하는 판수)와 같은 값으로 맞췄다.
 *   같은 화면 안에서 "이 정도는 봐도 되는 표본" 의 기준이 둘로 갈리지 않게 한다.
 *
 * > `[미확인]` 사양에 없다. 우리가 정한 값이고 원본과 무관하다.
 */
export const CLAN_ROSTER_FIRST_SQUAD_MIN_GAMES = 10

/**
 * 화면에 그리는 포지션 순서 — **한 팀이 서는 순서 그대로**다.
 *
 * `POSITION_TEAM_SLOTS` 의 선언 순서(스나·2F·B·숏)를 쓰지 않는다.
 * 사용자가 팀 구성을 적을 때 쓴 순서는 `숏1 · 2F1 · 스나1 · B리베2` 이고,
 * 화면은 사용자가 읽는 순서를 따른다.
 */
export const CLAN_ROSTER_POSITION_ORDER: readonly PositionCode[] = ['SHORT', '2F', 'SNIPER', 'B']

/** 포지션을 못 정한 묶음의 표기. `-` 나 `알수없음` 이 아니다 (D-106) */
export const CLAN_ROSTER_UNKNOWN_LABEL = '포지션 미정'

/** 1군 / 2군 표기 */
export const CLAN_ROSTER_SQUAD_LABEL = { first: '1군', second: '2군' } as const

/* -------------------------------------------------------------------------- */
/* 스키마                                                                       */
/* -------------------------------------------------------------------------- */

export const ClanRosterSquadKind = z.enum(['first', 'second'])
export type ClanRosterSquadKind = z.infer<typeof ClanRosterSquadKind>

/** 클랜원 한 명 */
export const ClanRosterMember = z.object({
  league_player_id: Id,
  player: PlayerSummary,
  rating: Rating,
  /** 배치고사 진행중. 그때 `rating` 은 아직 실력이 아니다 */
  placement: z.boolean(),
  /** 시즌 창 안에서 래더에 반영된 판수 (`withLadderMatch` + `seasonWindowWhere`) */
  games: Count,
  /**
   * 포지션 코드. 판정이 없거나 격차가 좁으면 `null` 이다 (D-199).
   * 사람이 우리 코드가 아닌 말로 직접 적었을 때도 `null` 이고 `position_label` 만 남는다.
   */
  position: z.enum(['SNIPER', '2F', 'B', 'SHORT']).nullable(),
  /** 화면에 그대로 쓰는 글자. 모르면 `null` — 화면이 `포지션 미정` 묶음에 넣는다 */
  position_label: z.string().nullable(),
  /** 판정이 어디서 왔나 — 사람이 정한 값인지 밝힐 수 있게 남긴다 */
  position_source: z.enum(['user', 'weapon', 'coords']).nullable(),
})
export type ClanRosterMember = z.infer<typeof ClanRosterMember>

/** 한 포지션 묶음 */
export const ClanRosterGroup = z.object({
  /** `null` 이면 `포지션 미정` 묶음이다 */
  position: z.enum(['SNIPER', '2F', 'B', 'SHORT']).nullable(),
  label: z.string(),
  /** 한 팀에 몇 자리인가 (`B리베` 만 둘). `포지션 미정` 은 `null` */
  slots: Count.nullable(),
  /** 래더 높은 순 */
  members: z.array(ClanRosterMember),
})
export type ClanRosterGroup = z.infer<typeof ClanRosterGroup>

/** 1군 또는 2군 */
export const ClanRosterSquad = z.object({
  squad: ClanRosterSquadKind,
  label: z.string(),
  /** 이 군의 인원 */
  count: Count,
  /** 네 포지션 + (있으면) `포지션 미정`. **빈 묶음도 자리를 지킨다** */
  groups: z.array(ClanRosterGroup),
})
export type ClanRosterSquad = z.infer<typeof ClanRosterSquad>

export const ClanRoster = z.object({
  /** 항상 `[1군, 2군]` 두 칸이다. 2군이 비어도 자리는 남는다 */
  squads: z.array(ClanRosterSquad),
  /** 전체 클랜원 수 */
  member_count: Count,
  /** 포지션을 아직 모르는 인원. 화면이 "왜 미정이 이렇게 많은지" 를 말할 수 있게 낸다 */
  unknown_position_count: Count,
  /** 1군 후보 최소 판수. 화면이 기준을 그대로 적을 수 있게 함께 내보낸다 */
  first_squad_min_games: Count,
})
export type ClanRoster = z.infer<typeof ClanRoster>

/* -------------------------------------------------------------------------- */
/* 계산                                                                        */
/* -------------------------------------------------------------------------- */

/** 서버·Mock 이 채워 주는 재료 한 줄 */
export interface ClanRosterInput {
  leaguePlayerId: string
  playerId: string
  playerName: string
  rating: number
  placement: boolean
  games: number
  position: PositionCode | null
  positionLabel: string | null
  positionSource: PositionSource | null
}

/**
 * 1군은 **래더 높은 순 상위 5명**이다. 다만 아래 둘은 후보에서 뺀다.
 *
 * ```
 * 배치고사 진행중          래더가 아직 실력이 아니다 (3-B 7번)
 * 판수 < 10               한 판 뛰고 높은 래더가 1군에 올라오면 안 된다
 * ```
 *
 * 뺀 선수가 사라지는 것은 아니다 — **2군으로 간다.** 명단에서 지우지 않는다.
 */
function sortByRating(left: ClanRosterInput, right: ClanRosterInput): number {
  if (right.rating !== left.rating) return right.rating - left.rating
  /* 동점이면 많이 뛴 쪽이 위다. 그래도 같으면 id 로 못 박아 순서를 고정한다 —
     정렬이 흔들리면 같은 데이터에서 1군 명단이 요청마다 달라진다 */
  if (right.games !== left.games) return right.games - left.games
  return left.leaguePlayerId < right.leaguePlayerId ? -1 : 1
}

function toMember(input: ClanRosterInput): ClanRosterMember {
  return {
    league_player_id: input.leaguePlayerId,
    player: { id: input.playerId, name: input.playerName },
    rating: input.rating,
    placement: input.placement,
    games: input.games,
    position: input.position,
    position_label: input.positionLabel,
    position_source: input.positionSource,
  }
}

/** 한 군을 포지션별로 나눈다. 네 포지션은 **비어도 자리를 지킨다** */
function toSquad(
  squad: ClanRosterSquadKind,
  members: readonly ClanRosterInput[],
): ClanRosterSquad {
  const groups: ClanRosterGroup[] = CLAN_ROSTER_POSITION_ORDER.map((code) => ({
    position: code,
    label: POSITION_LABEL[code],
    slots: POSITION_TEAM_SLOTS[code],
    members: members.filter((row) => row.position === code).map(toMember),
  }))

  /* 코드로 떨어지지 않는 사람 — 포지션이 아예 없는 선수와, 사람이 우리 코드가 아닌
     말로 직접 적은 선수(`position === null` 인데 `positionLabel` 은 있다)가 함께 온다.
     둘 다 "네 묶음 어디에도 못 넣는다" 는 점에서 같다 */
  const rest = members.filter((row) => row.position === null)
  if (rest.length > 0) {
    groups.push({
      position: null,
      label: CLAN_ROSTER_UNKNOWN_LABEL,
      slots: null,
      members: rest.map(toMember),
    })
  }

  return {
    squad,
    label: CLAN_ROSTER_SQUAD_LABEL[squad],
    count: members.length,
    groups,
  }
}

/**
 * 클랜원을 1군/2군 × 포지션으로 정리한다.
 *
 * 클랜원이 하나도 없으면 `null` 이다 — 0 으로 채운 빈 카드를 그리지 않는다 (D-106).
 */
export function buildClanRoster(rows: readonly ClanRosterInput[]): ClanRoster | null {
  if (rows.length === 0) return null

  const sorted = [...rows].sort(sortByRating)

  /* 1군 후보 — 배치고사 중이 아니고, 판수가 기준 이상인 선수 */
  const eligible = sorted.filter(
    (row) => !row.placement && row.games >= CLAN_ROSTER_FIRST_SQUAD_MIN_GAMES,
  )
  const firstIds = new Set(
    eligible.slice(0, CLAN_ROSTER_FIRST_SQUAD_SIZE).map((row) => row.leaguePlayerId),
  )

  const first = sorted.filter((row) => firstIds.has(row.leaguePlayerId))
  const second = sorted.filter((row) => !firstIds.has(row.leaguePlayerId))

  return {
    squads: [toSquad('first', first), toSquad('second', second)],
    member_count: rows.length,
    unknown_position_count: rows.filter((row) => row.position === null).length,
    first_squad_min_games: CLAN_ROSTER_FIRST_SQUAD_MIN_GAMES,
  }
}
