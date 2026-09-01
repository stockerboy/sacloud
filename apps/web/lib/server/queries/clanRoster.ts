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
import { countWeaponGames, resolvePositionsOf } from './playerPositionQuery'
import { toKstIso } from '../format'

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
  /** **Clan.id** 다. `LeaguePlayer` 는 현재 소속을 `clanId` 로 들고 있다 (LeagueClan 이 아니다) */
  clanId: string,
): Promise<ClanRoster | null> {
  const members = await prisma.leaguePlayer.findMany({
    where: { leagueId, clanId },
    /* 래더 높은 순. 동점 정렬은 계약(`buildClanRoster`)이 다시 못 박으므로
       여기서는 상한(`take`)이 잘라 낼 쪽만 정하면 된다 */
    orderBy: [{ rating: 'desc' }, { id: 'asc' }],
    take: ROSTER_LIMIT,
    select: {
      id: true,
      rating: true,
      placement: true,
      /* `position` 을 여기서 같이 읽는다 (2026-09-01 · D-239 후속).
         `resolvePositionsOf` 가 이 값을 얻으려고 `Player` 를 한 번 더 읽고 있었는데,
         **이미 그 행을 읽고 있었다.** 칸 하나를 더할 뿐이라 왕복이 늘지 않는다 */
      player: { select: { id: true, name: true, position: true } },
    },
  })
  if (members.length === 0) return null

  const playerIds = members.map((row) => row.player.id)

  /* ── **판수 집계와 주무기 집계를 한 질의로 합쳤다** (2026-09-01 · D-239 후속)
   *   예전에는 `groupBy(playerId)`(판수)와 `groupBy(playerId, weapon)`(주무기)을 따로
   *   던졌다. 뒤엣것이 실측에서 1.4초로 이 화면에서 가장 무거운 질의인데, 앞엣것과
   *   **모집단이 똑같다** — 다른 것은 「무기를 모르는 행을 빼는가」뿐이다.
   *   그래서 무기 조건 없이 한 번만 그룹으로 세고,
   *     · 판수    = 그 선수의 모든 버킷 합 (무기를 모르는 행 포함 — 예전과 같다)
   *     · 주무기  = `weapon` 이 0/1 인 버킷만 (`countWeaponGames` 가 그렇게 접는다)
   *   으로 나눠 쓴다. 값은 한 글자도 달라지지 않는다.
   *
   *   판수는 1군 후보 최소 판수의 근거다 — 한 판 뛰고 래더가 높은 선수가 1군에
   *   올라오는 것을 막는다. 시즌 창 안에서 래더에 반영된 판수다 */
  const weaponBuckets = await prisma.matchPlayerStat.groupBy({
    by: ['playerId', 'weapon'],
    where: {
      playerId: { in: playerIds },
      match: withLadderMatch({ leagueId, ...seasonWindowWhere() }),
    },
    _count: { _all: true },
  })

  const gamesOf = new Map<string, number>()
  for (const row of weaponBuckets) {
    gamesOf.set(row.playerId, (gamesOf.get(row.playerId) ?? 0) + row._count._all)
  }

  const positions = await resolvePositionsOf(leagueId, playerIds, {
    userSet: new Map(members.map((row) => [row.player.id, row.player.position])),
    weaponGames: countWeaponGames(weaponBuckets),
  })
  const online = await resolveOnlineOf(playerIds)

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
      /* 사슬이 끊겨 있으면 `undefined` → 계약이 `null`(알수없음)로 만든다.
         **`false` 로 접지 않는다** — 모르는 것과 미접속은 다르다 */
      online: online.byPlayer.get(row.player.id),
    }
  })

  return buildClanRoster(rows, online.observedAt)
}

/**
 * **접속 여부** — 병영수첩 클랜원 명단에서 읽는다 (2026-09-01 사용자 지시).
 *
 * ── 사슬
 *   ```
 *   Player.id
 *     → NexonIdentity.playerId          (사람이 판단해 이어 둔 것 · D-036)
 *     → NexonIdentity.barracksNexonSn   (`nexon barracks-link` 가 채운다 · D-221)
 *     → BarracksClanMember.userNexonSn
 *     → connFlag (1 이면 관측 시점에 접속중)
 *   ```
 *
 * ── 클랜으로 찾지 않는다
 *   병영 클랜 slug 와 우리 클랜 slug 가 같다는 보장이 없다. 계정으로 바로 간다 —
 *   고리가 하나 줄고, 클랜을 옮긴 선수도 그대로 잡힌다.
 *
 * ── **닉네임으로 잇지 않는다**
 *   닉은 식별자가 아니다 (D-220). 위장닉이 섞이고, 옛 닉은 남이 물려받는다.
 *   같은 클랜 안이라도 마찬가지다. 못 이으면 **모르는 채로 둔다.**
 *
 * ── 실시간이 아니다
 *   병영수첩은 우리 서버의 호출을 막는다 (403 · D-200). 명단은 사람이 한 번씩 긁어 온
 *   스냅샷이고, 이 값은 **그 관측 시점**의 접속 여부다. 언제 본 값인지 함께 돌려준다.
 *
 * 실패해도 명단 전체를 죽이지 않는다 — 비어 있으면 전원 `알수없음` 이다.
 */
async function resolveOnlineOf(playerIds: string[]): Promise<{
  byPlayer: Map<string, boolean>
  observedAt: string | null
}> {
  const empty = { byPlayer: new Map<string, boolean>(), observedAt: null }
  if (playerIds.length === 0) return empty

  try {
    const identities = await prisma.nexonIdentity.findMany({
      where: { playerId: { in: playerIds }, barracksNexonSn: { not: null } },
      select: { playerId: true, barracksNexonSn: true },
    })
    if (identities.length === 0) return empty

    /* 계정 → 선수. 한 선수에 계정이 여럿 붙을 수 있으므로 계정 쪽을 열쇠로 삼는다 */
    const playerOf = new Map<string, string>()
    for (const row of identities) {
      if (row.playerId && row.barracksNexonSn) playerOf.set(row.barracksNexonSn, row.playerId)
    }

    /* 최근 관측이 먼저 오게 읽고, 계정마다 **맨 앞 하나만** 쓴다.
       같은 계정이 여러 번 관측돼 있고 옛 값이 이기면 안 된다 */
    const observations = await prisma.barracksClanMember.findMany({
      where: { userNexonSn: { in: [...playerOf.keys()] } },
      orderBy: { observedAt: 'desc' },
      select: { userNexonSn: true, connFlag: true, observedAt: true },
    })

    const byPlayer = new Map<string, boolean>()
    const seen = new Set<string>()
    let newest: Date | null = null
    for (const row of observations) {
      if (seen.has(row.userNexonSn)) continue
      seen.add(row.userNexonSn)
      const playerId = playerOf.get(row.userNexonSn)
      if (!playerId || byPlayer.has(playerId)) continue
      byPlayer.set(playerId, row.connFlag === 1)
      if (!newest || row.observedAt > newest) newest = row.observedAt
    }

    return { byPlayer, observedAt: newest ? toKstIso(newest) : null }
  } catch {
    /* 표가 아직 없거나 질의가 실패해도 명단은 그려야 한다 */
    return empty
  }
}
