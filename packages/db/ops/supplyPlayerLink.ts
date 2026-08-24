/**
 * 넥슨 참가자 ↔ 3rd.supply 선수 id 연결 (D-132).
 *
 * ── 왜 필요한가
 *   두 출처가 사람을 다른 키로 부른다.
 *     넥슨 `/match-detail`  → **닉네임만** 준다 (계정 id 없음)
 *     3rd.supply 라인업     → `player.id` (안정적인 선수 id) + 닉네임
 *   그래서 경기 참가자로 만들어진 `Player`(origin=nexon)와 로스터에서 만들어진
 *   `Player`(origin=3rd.supply)가 **같은 사람인데 다른 행**이 된다.
 *   실측: 경기 참가 229명 중 로스터가 붙은 사람이 17명뿐이었다.
 *
 * ── 무엇을 근거로 잇는가 — **경기 단위 닉네임 일치**
 *   전역 닉네임 매칭이 아니다. 두 출처가 **같은 경기 하나**를 각각 기술한 것을 맞춘다.
 *
 *     같은 match_id 의 3rd.supply 라인업에 (선수 id P, 닉네임 N) 이 있고
 *     같은 경기의 넥슨 참가자에 닉네임 N 이 있으면  →  그 사람은 P 다
 *
 *   두 독립 출처가 같은 경기·같은 이름을 말하는 것이라 근거가 두껍다.
 *   유사 매칭·부분 일치·대소문자 무시를 하지 않는다. **정확히 같은 문자열만** 잇는다.
 *
 * ── 하지 않는 것
 *   - 한 경기 안에서 닉네임이 중복되면 그 경기는 통째로 건너뛴다 (누가 누군지 모른다)
 *   - 이미 다른 선수 id 가 붙어 있으면 덮어쓰지 않는다. 충돌로 세어 사람이 보게 한다
 *   - 근거가 없으면 비워 둔다. 추측해서 채우지 않는다
 */
import { prisma } from '../src/index'

type LineupRow = [number | null, string | null, number | null, number | null]

interface MatchesSnapshotLike {
  matches: { id: string; red: LineupRow[]; blue: LineupRow[] }[]
}

export interface SupplyPlayerLinkResult {
  matchesScanned: number
  matchesSkippedDuplicateNickname: number
  statsScanned: number
  linked: number
  alreadyLinked: number
  /** 로스터 단계가 먼저 만든 **빈 행**을 비켜 준 수 (경기 기록이 있는 행이 진짜다) */
  placeholdersReleased: number
  conflicts: { playerName: string; existing: string; incoming: string }[]
  noEvidence: number
}

/** 스냅샷 → `match_id` → (닉네임 → 선수 id). 닉네임이 겹치는 경기는 뺀다 */
export function buildLineupIndex(
  snapshot: MatchesSnapshotLike,
): { index: Map<string, Map<string, string>>; skipped: number } {
  const index = new Map<string, Map<string, string>>()
  let skipped = 0

  for (const match of snapshot.matches) {
    const byNickname = new Map<string, string>()
    let duplicate = false
    for (const [playerId, nickname] of [...match.red, ...match.blue]) {
      if (playerId == null || !nickname) continue
      if (byNickname.has(nickname)) {
        duplicate = true
        break
      }
      byNickname.set(nickname, String(playerId))
    }
    if (duplicate) {
      skipped += 1
      continue
    }
    if (byNickname.size > 0) index.set(match.id, byNickname)
  }

  return { index, skipped }
}

export async function linkSupplyPlayerIds(input: {
  snapshot: MatchesSnapshotLike
  leagueSlug: string
  confirm?: boolean
}): Promise<SupplyPlayerLinkResult> {
  const confirm = Boolean(input.confirm)
  const { index, skipped } = buildLineupIndex(input.snapshot)

  const result: SupplyPlayerLinkResult = {
    matchesScanned: 0,
    matchesSkippedDuplicateNickname: skipped,
    statsScanned: 0,
    linked: 0,
    alreadyLinked: 0,
    placeholdersReleased: 0,
    conflicts: [],
    noEvidence: 0,
  }

  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true },
  })
  if (!league) throw new Error(`리그를 찾을 수 없다: ${input.leagueSlug}`)

  const matches = await prisma.match.findMany({
    where: { leagueId: league.id, sourceMatchId: { not: null } },
    select: { id: true, sourceMatchId: true },
  })

  /* 미리보기에서도 같은 사람을 두 번 세지 않게 이번 실행에서 정한 것을 기억한다 */
  const decided = new Map<string, string>()

  for (const match of matches) {
    const lineup = index.get(match.sourceMatchId!)
    if (!lineup) continue
    result.matchesScanned += 1

    const stats = await prisma.matchPlayerStat.findMany({
      where: { matchId: match.id },
      select: { playerId: true, player: { select: { name: true, sourcePlayerId: true } } },
    })

    for (const stat of stats) {
      result.statsScanned += 1
      const incoming = lineup.get(stat.player.name)
      if (!incoming) {
        result.noEvidence += 1
        continue
      }

      const existing = stat.player.sourcePlayerId ?? decided.get(stat.playerId) ?? null
      if (existing === incoming) {
        result.alreadyLinked += 1
        continue
      }
      if (existing) {
        result.conflicts.push({ playerName: stat.player.name, existing, incoming })
        continue
      }

      /* `sourcePlayerId`는 unique 다. 로스터 단계에서 먼저 만들어진 **빈 행**이 그 id를
         쥐고 있으면 자리를 비켜 준다. 경기 기록을 가진 이 행이 진짜이기 때문이다.
         기록이 있는 행이 쥐고 있으면 건드리지 않고 충돌로 남긴다. */
      const holder = await prisma.player.findFirst({
        where: { sourcePlayerId: incoming, id: { not: stat.playerId } },
        select: {
          id: true,
          origin: true,
          _count: { select: { matchStats: true } },
          userLink: { select: { playerId: true } },
        },
      })
      if (holder) {
        const releasable =
          holder.origin === '3rd.supply' && holder._count.matchStats === 0 && !holder.userLink
        if (!releasable) {
          result.conflicts.push({
            playerName: stat.player.name,
            existing: `${incoming}(기록 있는 다른 행)`,
            incoming,
          })
          continue
        }
        result.placeholdersReleased += 1
        if (confirm) await prisma.player.delete({ where: { id: holder.id } })
      }

      decided.set(stat.playerId, incoming)
      result.linked += 1
      if (confirm) {
        await prisma.player.update({
          where: { id: stat.playerId },
          data: { sourcePlayerId: incoming },
        })
      }
    }
  }

  return result
}

export interface DuplicatePlayerCleanupResult {
  candidates: number
  removed: number
  keptBecauseReferenced: number
}

/**
 * 같은 `sourcePlayerId`를 가진 행이 둘이 되면 **로스터에서 만든 빈 행**을 지운다.
 *
 * 지우는 조건은 전부 만족해야 한다. 하나라도 어긋나면 남긴다.
 *   · `origin = "3rd.supply"` (이 파이프라인이 만든 행)
 *   · 경기 참가 기록이 **0건**
 *   · 사용자 계정 연결이 없다
 *   · 같은 `sourcePlayerId`를 가진 **다른 행이 존재한다** (그쪽이 진짜다)
 *
 * 실제 기록을 가진 행은 절대 지우지 않는다.
 */
export async function cleanupDuplicateSupplyPlayers(input: {
  confirm?: boolean
}): Promise<DuplicatePlayerCleanupResult> {
  const result: DuplicatePlayerCleanupResult = {
    candidates: 0,
    removed: 0,
    keptBecauseReferenced: 0,
  }

  const rows = await prisma.player.findMany({
    where: { origin: '3rd.supply', sourcePlayerId: { not: null } },
    select: {
      id: true,
      sourcePlayerId: true,
      _count: { select: { matchStats: true } },
      userLink: { select: { playerId: true } },
    },
  })

  for (const row of rows) {
    const twin = await prisma.player.findFirst({
      where: { sourcePlayerId: row.sourcePlayerId, id: { not: row.id }, origin: { not: '3rd.supply' } },
      select: { id: true },
    })
    if (!twin) continue
    result.candidates += 1

    if (row._count.matchStats > 0 || row.userLink) {
      result.keptBecauseReferenced += 1
      continue
    }

    result.removed += 1
    if (input.confirm) {
      // 이 행에 달린 소속·리그참가는 근거가 사라지므로 함께 정리된다 (FK cascade)
      await prisma.player.delete({ where: { id: row.id } })
    }
  }

  return result
}
