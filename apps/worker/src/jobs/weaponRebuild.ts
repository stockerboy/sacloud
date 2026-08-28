/**
 * 무기별 전적 재집계 (D-149).
 *
 * ── 입력 (source of truth)
 *   `MatchPlayerStat` 한 줄이 전부다.
 *     weapon      ← 3rd.supply 라인업 (넥슨은 무기를 주지 않는다 · D-034)
 *     kill/death/assist/headshot ← 넥슨 상세 (모르면 null · D-148)
 *     ratingUpdate ← D-145 공식이 계산해 둔 값. **여기서 다시 계산하지 않는다**
 *
 * ── 부분 집계 (partial aggregation)
 *   무기는 아는데 KDA 를 모르는 참가자가 있다. 그 경기를 0킬로 세면 평균이 거짓이 된다.
 *   그래서 둘을 나눈다 —
 *     `games`          그 무기로 뛴 경기 전부
 *     `knownStatGames` 그중 K/D/A 를 아는 경기 (킬·데스·어시의 분모)
 *   KDA 를 모르는 경기 하나 때문에 **나머지 경기까지 집계를 버리지 않는다.**
 *
 * ── 래더와의 관계
 *   `ratingDelta` 는 그 무기로 뛴 경기의 `ratingUpdate` 합이다.
 *   **무기별 공식 같은 것은 없다** (`CLAUDE.md` 3-B 1번). 통합 래더가 계산한 값을
 *   무기에 따라 **기록만** 나눈다. 이 잡은 `LeaguePlayer.rating` 을 건드리지 않는다.
 *
 * ── 결정성
 *   같은 입력이면 같은 결과다. 처음부터 지우고 다시 만든다.
 *   두 번 돌려도 값이 두 배가 되지 않는다.
 */
import { prisma } from '@sacloud/db'
import { log, warn } from '../lib/log.js'

/** 0 = 라이플, 1 = 스나이퍼 (`CLAUDE.md` 6장 · 3rd.supply 스냅샷 실측값도 이 둘뿐이다) */
export const WEAPON_RIFLE = 0
export const WEAPON_SNIPER = 1

export interface WeaponRebuildResult {
  /** 살펴본 참가 기록 */
  scanned: number
  /** 무기를 아는 참가 기록 */
  withWeapon: number
  /** 무기를 모르는 참가 기록 — 어느 버킷에도 넣지 않는다 */
  withoutWeapon: number
  /** 무기도 알고 KDA 도 아는 참가 기록 */
  withWeaponAndStats: number
  players: number
  buckets: number
  rifleGames: number
  sniperGames: number
  rifleKnownGames: number
  sniperKnownGames: number
}

interface Bucket {
  games: number
  knownStatGames: number
  win: number
  lose: number
  kill: number
  death: number
  assist: number
  headshot: number
  ratingDelta: number
}

function emptyBucket(): Bucket {
  return {
    games: 0,
    knownStatGames: 0,
    win: 0,
    lose: 0,
    kill: 0,
    death: 0,
    assist: 0,
    headshot: 0,
    ratingDelta: 0,
  }
}

/**
 * 순수 집계 — DB 를 모른다. 테스트가 이 함수를 직접 부른다.
 *
 * `null` 인 kill/death/assist 는 **더하지 않는다.** 0으로 취급하면
 * "0킬을 했다"는 거짓이 되고 평균이 내려간다.
 */
export function accumulateWeaponBuckets(
  rows: {
    playerId: string
    weapon: number | null
    kill: number | null
    death: number | null
    assist: number | null
    headshot: number | null
    ratingUpdate: number | null
    won: boolean
  }[],
): Map<string, Map<number, Bucket>> {
  const acc = new Map<string, Map<number, Bucket>>()
  for (const row of rows) {
    if (row.weapon === null) continue
    const byWeapon = acc.get(row.playerId) ?? new Map<number, Bucket>()
    const bucket = byWeapon.get(row.weapon) ?? emptyBucket()

    /* 승패와 래더 증감은 KDA 를 몰라도 안다 — 라인업이 승패를 주고,
       래더는 이미 계산돼 있다. 그래서 `games` 에는 항상 들어간다 */
    bucket.games += 1
    bucket.win += row.won ? 1 : 0
    bucket.lose += row.won ? 0 : 1
    bucket.ratingDelta += Math.round(row.ratingUpdate ?? 0)

    /* K/D/A 는 아는 경기만 */
    if (row.kill !== null || row.death !== null || row.assist !== null) {
      bucket.knownStatGames += 1
      bucket.kill += row.kill ?? 0
      bucket.death += row.death ?? 0
      bucket.assist += row.assist ?? 0
      bucket.headshot += row.headshot ?? 0
    }

    byWeapon.set(row.weapon, bucket)
    acc.set(row.playerId, byWeapon)
  }
  return acc
}

export async function rebuildWeaponStats(input: {
  leagueSlug: string
  confirm?: boolean
}): Promise<WeaponRebuildResult> {
  const result: WeaponRebuildResult = {
    scanned: 0,
    withWeapon: 0,
    withoutWeapon: 0,
    withWeaponAndStats: 0,
    players: 0,
    buckets: 0,
    rifleGames: 0,
    sniperGames: 0,
    rifleKnownGames: 0,
    sniperKnownGames: 0,
  }

  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true },
  })
  if (!league) {
    warn(`리그를 찾을 수 없다: ${input.leagueSlug}`)
    return result
  }

  /* 모집단은 **래더에 반영된 경기**다 (D-148).
     `official` 라벨은 D-145 에서 래더와 무관해졌으므로 여기서 보지 않는다.
     라벨로 거르면 래더에 반영된 경기가 무기 집계에서 빠져 `집계 없음` 이 남는다.

     ⚠ `redRatingUpdate` 하나만 보면 **미러링한 경기가 통째로 빠진다** (D-164).
     그 칸은 우리 공식(D-145)이 채우는 것이라 3rd.supply 에서 들여온 경기에는 없다 —
     실측: supply 130,022 경기 중 98건뿐이다. 실제로 그래서 무기별 집계가 사실상 비어
     있었다 (`LeaguePlayerWeaponStat` 2,978행 중 `games > 0` 이 286행).
     미러 경기는 원본이 래더 경기만 주므로 전부 래더 경기다. */
  const stats = await prisma.matchPlayerStat.findMany({
    where: {
      match: {
        leagueId: league.id,
        OR: [{ redRatingUpdate: { not: null } }, { origin: '3rd.supply' }],
      },
    },
    select: {
      playerId: true,
      weapon: true,
      kill: true,
      death: true,
      assist: true,
      headshot: true,
      ratingUpdate: true,
      /* 미러 경기는 원본이 **선수별로** 증감을 준다 (D-153). 참가행 130만 건에 전부 있다 */
      sourceRatingDelta: true,
      side: true,
      match: { select: { winnerSide: true } },
    },
    orderBy: [{ matchId: 'asc' }, { playerId: 'asc' }],
  })

  result.scanned = stats.length
  for (const stat of stats) {
    if (stat.weapon === null) result.withoutWeapon += 1
    else {
      result.withWeapon += 1
      if (stat.kill !== null) result.withWeaponAndStats += 1
    }
  }

  const acc = accumulateWeaponBuckets(
    stats.map((stat) => ({
      playerId: stat.playerId,
      weapon: stat.weapon,
      kill: stat.kill,
      death: stat.death,
      assist: stat.assist,
      headshot: stat.headshot,
      /* 우리 계산값이 없으면 원본값을 쓴다. 무기별 공식은 없다 —
         통합 래더가 정한 증감을 무기에 따라 **기록만** 나눈다 (CLAUDE.md 3-B 1번) */
      ratingUpdate: stat.ratingUpdate ?? stat.sourceRatingDelta,
      won: stat.match.winnerSide === stat.side,
    })),
  )

  for (const byWeapon of acc.values()) {
    for (const [weapon, bucket] of byWeapon) {
      if (weapon === WEAPON_RIFLE) {
        result.rifleGames += bucket.games
        result.rifleKnownGames += bucket.knownStatGames
      } else {
        result.sniperGames += bucket.games
        result.sniperKnownGames += bucket.knownStatGames
      }
    }
  }

  if (!input.confirm) {
    result.players = acc.size
    for (const byWeapon of acc.values()) result.buckets += byWeapon.size
    return result
  }

  /* 처음부터 다시 만든다 — 누적이 두 배가 되는 사고를 막는다.
     같은 입력이면 같은 결과다 (deterministic) */
  await prisma.leaguePlayerWeaponStat.deleteMany({
    where: { leaguePlayer: { leagueId: league.id } },
  })

  const leaguePlayers = await prisma.leaguePlayer.findMany({
    where: { leagueId: league.id },
    select: { id: true, playerId: true },
  })
  const leaguePlayerOf = new Map(leaguePlayers.map((row) => [row.playerId, row.id]))

  for (const [playerId, byWeapon] of acc) {
    const leaguePlayerId = leaguePlayerOf.get(playerId)
    if (!leaguePlayerId) continue
    result.players += 1
    /* 주무기 판정 — 그 무기 판수가 절반 이상이면 주무기다 (D-173).
       무기 랭킹의 모집단이 이 값이라, 여기서 안 세우면 재작성 후 랭킹이 통째로 빈다 */
    const weaponTotal = [...byWeapon.values()].reduce((sum, b) => sum + b.games, 0)
    for (const [weapon, bucket] of byWeapon) {
      await prisma.leaguePlayerWeaponStat.create({
        data: {
          leaguePlayerId,
          weapon,
          ...bucket,
          isMain: weaponTotal > 0 && bucket.games * 2 >= weaponTotal,
        },
      })
      result.buckets += 1
    }
  }

  log(
    `무기별 전적 재작성 — 선수 ${result.players} · 버킷 ${result.buckets} ` +
      `(라플 ${result.rifleGames}전/기록 ${result.rifleKnownGames} · ` +
      `스나 ${result.sniperGames}전/기록 ${result.sniperKnownGames})`,
  )
  return result
}
