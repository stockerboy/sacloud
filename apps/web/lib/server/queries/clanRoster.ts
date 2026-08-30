/**
 * 클랜페이지 **클랜원 정리** — 포지션별 · 1군/2군 (`docs/SITE_SPEC_V2.md` 5-2).
 *
 * **나누는 규칙은 여기 없다.** 전부 `@sacloud/contract` 의 `clanRoster` 에 있고
 * Mock(`packages/mock/src/store.ts`)도 **같은 함수**를 부른다. 이 파일이 하는 일은
 * DB 에서 재료를 읽어 계약이 원하는 모양(`ClanRosterInput`)으로 맞춰 주는 것뿐이다
 * (`clanMetrics.ts` 와 같은 구조다).
 *
 * ── 포지션을 여기서 판정하지 않는다
 *   판정은 이미 끝나 있다 — `PlayerPositionProfile`(좌표) + `resolvePlayerPositionOf()`
 *   (D-199). `resolvePositionsOf()` 로 읽기만 한다.
 *
 * ── 판수 모집단은 화면의 다른 수치와 **같다**
 *   `withLadderMatch()`(D-164 · D-178) + `seasonWindowWhere()`(D-175 · D-178).
 *   `LeaguePlayer.win + lose` 를 쓰지 않는다 — 그 칸은 배치 집계가 채우는 값이라
 *   집계가 훑는 창 밖의 경기가 한 판도 들어가지 않는다 (records.ts 가 겪은 어긋남).
 */
import { prisma } from '@sacloud/db'
import { buildClanRoster, type ClanRoster, type ClanRosterInput } from '@sacloud/contract'
import type { PositionCode } from '@sacloud/contract'
import { withLadderMatch } from './ladderScope'
import { seasonWindowWhere } from './season0Scope'
import { resolvePositionsOf } from './playerPositionQuery'

/**
 * 한 클랜에서 몇 명까지 읽을까.
 *
 * 클랜원은 보통 수십 명이고 실측 최다도 세 자리에 못 미친다. 300 이면 충분히 덮으면서,
 * 데이터가 이상해도(같은 클랜에 수천 명이 붙는 경우) 화면이 통째로 늘어지지 않는다.
 *
 * > `[미확인]` 사양에 상한이 없다. 우리가 고른 값이다.
 */
const ROSTER_LIMIT = 300

/**
 * 클랜원 정리.
 *
 * 클랜원이 하나도 없으면 `null` 이다 — 빈 카드를 그리지 않는다 (D-106).
 */
export async function leagueClanRoster(
  leagueId: string,
  leagueClanId: string,
): Promise<ClanRoster | null> {
  const members = await prisma.leaguePlayer.findMany({
    where: { leagueId, leagueClanId },
    /* 래더 높은 순. 동점 정렬은 계약(`buildClanRoster`)이 다시 못 박으므로
       여기서는 상한(`take`)이 잘라 낼 쪽만 정하면 된다 */
    orderBy: [{ rating: 'desc' }, { id: 'asc' }],
    take: ROSTER_LIMIT,
    select: {
      id: true,
      rating: true,
      placement: true,
      player: { select: { id: true, name: true } },
    },
  })
  if (members.length === 0) return null

  const playerIds = members.map((row) => row.player.id)

  const [positions, gameCounts] = await Promise.all([
    resolvePositionsOf(leagueId, playerIds),
    /* 시즌 창 안에서 래더에 반영된 판수. 1군 후보 최소 판수의 근거다 —
       한 판 뛰고 래더가 높은 선수가 1군에 올라오는 것을 막는다 */
    prisma.matchPlayerStat.groupBy({
      by: ['playerId'],
      where: {
        playerId: { in: playerIds },
        match: withLadderMatch({ leagueId, ...seasonWindowWhere() }),
      },
      _count: { _all: true },
    }),
  ])

  const gamesOf = new Map(gameCounts.map((row) => [row.playerId, row._count._all]))

  const rows: ClanRosterInput[] = members.map((row) => {
    const position = positions.get(row.player.id)
    return {
      leaguePlayerId: row.id,
      playerId: row.player.id,
      playerName: row.player.name,
      rating: row.rating,
      placement: row.placement,
      games: gamesOf.get(row.player.id) ?? 0,
      /* 사람이 우리 코드가 아닌 말로 적었으면 `code` 는 `null` 이고 글자만 남는다.
         그 선수는 네 묶음 어디에도 못 들어가 `포지션 미정` 으로 간다 (계약 주석 참조) */
      position: (position?.code ?? null) as PositionCode | null,
      positionLabel: position?.label ?? null,
      positionSource: position?.source ?? null,
    }
  })

  return buildClanRoster(rows)
}
