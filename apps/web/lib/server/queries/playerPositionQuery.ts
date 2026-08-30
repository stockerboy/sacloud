/**
 * 좌표로 판정한 **포지션** 을 읽는다 (D-199).
 *
 * 판정 자체는 `apps/worker` 의 `position-build` 가 하고 `PlayerPositionProfile` 에 담는다.
 * 여기서는 읽기만 한다.
 *
 * 판정이 없는 선수는 `null` 이다. **비어 있는 것을 채우지 않는다** (D-106) —
 * 지금 판정이 있는 선수는 517명뿐이고, 나머지는 배틀로그 좌표가 없어서 못 정한다.
 */
import { prisma } from '@sacloud/db'
import { POSITION_CLASSIFIER_VERSION } from '@sacloud/nexon'
import {
  mainWeaponOf,
  resolvePlayerPositionOf,
  WEAPON,
  type ResolvedPosition,
} from '@sacloud/contract'
import { withLadderMatch } from './ladderScope'
import { seasonWindowWhere } from './season0Scope'

export interface JudgedPosition {
  position: string | null
  /** 1등·2등 닮음의 격차. 좁으면 화면이 그 판정을 쓰지 않는다 (D-199) */
  margin: number | null
}

export async function playerJudgedPosition(playerId: string): Promise<JudgedPosition | null> {
  const row = await prisma.playerPositionProfile.findFirst({
    /* 판정 규칙 버전을 **반드시 건다.** 규칙이 바뀌면 옛 줄이 남으므로,
       필터가 없으면 DB 반환 순서에 따라 아무 쪽이나 이긴다 */
    where: { playerId, classifierVersion: POSITION_CLASSIFIER_VERSION },
    select: { position: true, margin: true },
  })
  return row ? { position: row.position, margin: row.margin } : null
}

/* -------------------------------------------------------------------------- */
/* 여러 명을 한 번에                                                             */
/* -------------------------------------------------------------------------- */

/**
 * 여러 선수의 **화면 표기 포지션**을 한 번에 고른다 (D-199).
 *
 * 고르는 규칙은 여기 없다. 전부 계약의 `resolvePlayerPositionOf()` 가 정한다 —
 * 사람이 정한 값 > 주무기가 스나 > 좌표 판정 > 비움. 이 함수가 하는 일은
 * 그 세 가지 재료를 **왕복 세 번**에 모아 읽어 넘기는 것뿐이다.
 *
 * ── 왜 한 번에 읽는가
 *   경기 상세 한 판에 참가자가 열 명이고 클랜원은 수십 명이다. 선수마다
 *   `playerJudgedPosition()` 을 부르면 왕복이 그만큼 늘어난다.
 *
 * ── 주무기 모집단은 화면의 다른 수치와 **같다**
 *   `withLadderMatch()`(D-164 · D-178) + `seasonWindowWhere()`(D-175 · D-178).
 *   여기만 다른 경기를 세면 같은 화면에서 "스나수" 판정과 무기별 전적이 어긋난다.
 *
 * 판정할 재료가 하나도 없는 선수는 **맵에 들어가되 전부 `null`** 이다.
 * 호출부는 그 선수의 이름만 적는다 — `-` 로 채우지 않는다 (D-106).
 */
export async function resolvePositionsOf(
  leagueId: string,
  playerIds: readonly string[],
): Promise<Map<string, ResolvedPosition>> {
  const ids = [...new Set(playerIds)].filter((id) => id.length > 0)
  const resolved = new Map<string, ResolvedPosition>()
  if (ids.length === 0) return resolved

  const [players, profiles, weaponGames] = await Promise.all([
    /* 선수가 직접 등록/수정한 값. 리그별이 아니라 **전역 선수 값**이다 (D-161) */
    prisma.player.findMany({ where: { id: { in: ids } }, select: { id: true, position: true } }),
    prisma.playerPositionProfile.findMany({
      /* 규칙 버전을 반드시 건다 — 단건 조회와 같은 이유다 */
      where: { playerId: { in: ids }, classifierVersion: POSITION_CLASSIFIER_VERSION },
      select: { playerId: true, position: true, margin: true },
    }),
    /* 주무기. 무기를 모르는 참가 기록(`null`)은 세지 않는다 —
       0 으로 떨어뜨리면 "라플을 들었다" 는 없는 사실이 된다 (D-034 · D-106) */
    prisma.matchPlayerStat.groupBy({
      by: ['playerId', 'weapon'],
      where: {
        playerId: { in: ids },
        weapon: { not: null },
        match: withLadderMatch({ leagueId, ...seasonWindowWhere() }),
      },
      _count: { _all: true },
    }),
  ])

  const userSetOf = new Map(players.map((row) => [row.id, row.position]))
  const judgedOf = new Map(profiles.map((row) => [row.playerId, row]))
  /* playerId → [라플 판수, 스나 판수] */
  const gamesOf = new Map<string, [number, number]>()
  for (const row of weaponGames) {
    const bucket = gamesOf.get(row.playerId) ?? [0, 0]
    if (row.weapon === WEAPON.SNIPER) bucket[1] += row._count._all
    else if (row.weapon === WEAPON.RIFLE) bucket[0] += row._count._all
    gamesOf.set(row.playerId, bucket)
  }

  for (const id of ids) {
    const judged = judgedOf.get(id)
    const games = gamesOf.get(id) ?? [0, 0]
    resolved.set(
      id,
      resolvePlayerPositionOf({
        userSet: userSetOf.get(id) ?? null,
        mainWeapon: mainWeaponOf(games[0], games[1]),
        judged: judged?.position ?? null,
        judgedMargin: judged?.margin ?? null,
      }),
    )
  }
  return resolved
}
