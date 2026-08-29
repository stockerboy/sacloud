/**
 * 전투력 육각형의 **백분위 재료**를 DB 에서 꺼낸다 (`docs/PLAYER_TRAITS_SPEC.md` 4절 · D-185).
 *
 * 판정·라벨·"못 재는 이유" 는 전부 `@sacloud/contract` 의 `buildPlayerTraits()` 가 한다.
 * 여기는 `playerTotals.ts` · `todayPerformance.ts` 와 같은 역할 — **재료만** 센다.
 *
 * ── 모집단이 상세정보와 같다
 *   `withLadderMatch` + `seasonWindowWhere()` (D-164 · D-178). 다른 모집단을 세면
 *   같은 카드 안에서 `판당 8.3킬` 인 선수가 `캐리력 상위 3%` 같은 어긋난 숫자를 갖는다.
 *
 * ── 왜 리그 전체를 한 번에 세고 캐시하는가
 *   백분위는 **그 선수 하나만 봐서는 낼 수 없다.** 같은 무기 선수 전원의 값이 있어야
 *   "몇 %" 가 나온다. 실측(2026-08-29 · 로컬): `sanply` 리그 라플 모집단 한 번 세는 데
 *   **약 0.5초**(참가기록 25만 행). 프로필을 열 때마다 이걸 돌리면 화면이 그만큼 늦는다.
 *
 *   그래서 리그 단위로 한 번 세서 `DISTRIBUTION_TTL_MS` 동안 재사용한다.
 *   같은 순간에 여러 요청이 들어와도 **한 번만** 센다(진행 중인 약속을 나눠 쓴다).
 *
 *   ⚠ 그래서 이 백분위는 최대 `DISTRIBUTION_TTL_MS` 만큼 낡을 수 있다.
 *   순위표처럼 정확히 실시간이어야 하는 값이 아니라 **분포 안의 위치**라 감수한다.
 *   그 선수 자신의 값도 **같은 캐시**에서 읽는다 — 값과 분포가 다른 시점에서 오면
 *   "판당 8.3킬인데 상위 3%" 같은 어긋남이 생긴다.
 *
 * ── 어느 축이 재지나 (2026-08-30)
 *   3 캐리력(판당 평균 킬) · 라플수의 2 샷싸움(판당 평균 딜량)은 경기 기록만으로 된다.
 *   1 세이브 · 6 소수싸움 · 4 매치의 사나이는 **라운드 복원**(D-194)이 채운다 —
 *   `PlayerRoundProfile` 이 그 재료이고, 배틀로그를 받은 선수에게만 있다.
 *   남은 것은 스나의 2·5(킬로그의 상대 무기)와 라플의 5(포지션 자동 판정)다.
 *
 *   라운드 축은 리그로 거르지 않고 읽는다 — 병영수첩 배틀로그는 리그를 모른다.
 *   대신 **견주는 무리**는 다른 축과 똑같이 "그 리그의 같은 주무기 선수" 다.
 */
import { prisma } from '@sacloud/db'
import {
  TRAIT_MIN_GAMES,
  TRAIT_MIN_ROUNDS,
  buildPlayerPlaystyle,
  buildPlayerTraits,
  mainWeaponOf,
  percentileOf,
  type PlaystyleBars,
  type TraitHexagon,
} from '@sacloud/contract'
import { withLadderMatch } from './ladderScope'
import { seasonWindowWhere } from './season0Scope'

/**
 * 리그 분포를 다시 세기까지의 시간.
 *
 * > `[미확인]` 사양에 없는 값이다. 10분은 우리가 고른 값이고 **원본과 동일함이
 * > 검증되지 않았다**. 짧게 하면 프로필 조회가 자주 0.5초를 물고, 길게 하면
 * > 새로 들어온 경기가 백분위에 늦게 반영된다.
 */
const DISTRIBUTION_TTL_MS = 10 * 60 * 1000

/**
 * 라운드 복원에서 나오는 한 선수의 비율 (D-194).
 *
 * 표본이 `TRAIT_MIN_ROUNDS` 에 못 미치면 **아예 만들지 않는다** — 두 번 겪고 한 번 이긴
 * 사람의 50% 가 분포 안에 섞이면 백분위 자체가 흔들린다.
 */
interface RoundValue {
  saveRate: number | null
  outnumberedRate: number | null
  matchManRate: number | null
}

/** 한 선수의 값 — 판당 평균 킬 · 판당 평균 딜량 */
interface PlayerValue {
  /** 주무기로 뛴 판 중 **K/D 를 아는 판수** — 두 평균의 분모다 (D-148) */
  knownGames: number
  killPerGame: number
  /** 딜량이 결측인 선수는 `null` 이다. **0으로 채우지 않는다** (D-034 · D-106) */
  damagePerGame: number | null
}

interface WeaponCohort {
  /** playerId → 그 선수의 값 */
  values: Map<string, PlayerValue>
  /** 오름차순 — `percentileOf()` 가 이진탐색으로 읽는다 */
  killSorted: number[]
  damageSorted: number[]
  /** 라운드 축은 **무기와 무관**하지만 견주는 무리는 같다 (사양 4절: 같은 무기끼리) */
  saveSorted: number[]
  outnumberedSorted: number[]
  matchManSorted: number[]
}

interface LeagueDistribution {
  /** `0 = 라이플` · `1 = 스나이퍼` */
  rifle: WeaponCohort
  sniper: WeaponCohort
  /** playerId → 라운드 복원 비율. **자료가 있는 선수만** 들어 있다 */
  rounds: Map<string, RoundValue>
}

const cache = new Map<string, { at: number; value: Promise<LeagueDistribution> }>()

/** 테스트가 캐시를 비울 수 있게 열어 둔다. 화면 코드는 부르지 않는다 */
export function clearTraitDistributionCache(): void {
  cache.clear()
}

function emptyCohort(): WeaponCohort {
  return {
    values: new Map(),
    killSorted: [],
    damageSorted: [],
    saveSorted: [],
    outnumberedSorted: [],
    matchManSorted: [],
  }
}

/**
 * 라운드 복원 집계를 읽는다 (D-194).
 *
 * 리그로 거르지 않는다 — 병영수첩 배틀로그는 리그를 모른다. 리그 모집단은 아래에서
 * "그 리그에서 주무기가 확인된 선수" 로 좁혀지므로, 여기서는 있는 것을 다 읽어 온다.
 *
 * 표본이 모자란 비율은 `null` 이다. **0% 로 두지 않는다** — 0%는 "다 졌다" 는 뜻이다.
 */
async function roundValues(): Promise<Map<string, RoundValue>> {
  const rows = await prisma.playerRoundProfile.findMany({
    where: { playerId: { not: null } },
    select: {
      playerId: true,
      alone: true,
      aloneWon: true,
      outnumbered: true,
      outnumberedWon: true,
      matchMan: true,
      longMatches: true,
    },
  })

  const out = new Map<string, RoundValue>()
  for (const row of rows) {
    if (!row.playerId) continue
    out.set(row.playerId, {
      saveRate: row.alone >= TRAIT_MIN_ROUNDS ? row.aloneWon / row.alone : null,
      outnumberedRate:
        row.outnumbered >= TRAIT_MIN_ROUNDS ? row.outnumberedWon / row.outnumbered : null,
      /* 매치의 사나이는 **경기** 단위다 — 20분 초과 경기 중 몇 번 뽑혔나 */
      matchManRate:
        row.longMatches >= TRAIT_MIN_ROUNDS ? row.matchMan / row.longMatches : null,
    })
  }
  return out
}

/**
 * 그 리그의 **같은 무기 선수 전원**의 판당 킬·판당 딜량 분포를 만든다.
 *
 * 무기를 `groupBy` 축으로 두고 한 번에 읽는다. 라플 모집단·스나 모집단을 따로 두 번
 * 읽으면 같은 스캔을 두 번 하게 되고, 주무기 판정에 필요한 "그 선수의 전체 판수" 도
 * 어차피 양쪽이 다 있어야 나온다.
 */
async function buildDistribution(leagueId: string): Promise<LeagueDistribution> {
  const rounds = await roundValues()
  const rows = await prisma.matchPlayerStat.groupBy({
    by: ['playerId', 'weapon'],
    where: {
      /* 무기를 모르는 참가 기록은 어느 무리에도 넣지 않는다 (D-034 · D-115) */
      weapon: { in: [0, 1] },
      match: withLadderMatch({ leagueId, ...seasonWindowWhere() }),
    },
    _sum: { kill: true, damage: true },
    /* `_count.kill` 은 **`null` 이 아닌 행**만 센다 — 킬의 분모다 (D-148).
       딜량은 결측 양상이 달라서 분모를 따로 센다 */
    _count: { _all: true, kill: true, damage: true },
  })

  /** playerId → 무기별 집계 */
  const byPlayer = new Map<
    string,
    { games: [number, number]; kill: [number, number]; killGames: [number, number]; damage: [number, number]; damageGames: [number, number] }
  >()

  for (const row of rows) {
    const weapon = row.weapon === 1 ? 1 : 0
    let entry = byPlayer.get(row.playerId)
    if (!entry) {
      entry = { games: [0, 0], kill: [0, 0], killGames: [0, 0], damage: [0, 0], damageGames: [0, 0] }
      byPlayer.set(row.playerId, entry)
    }
    entry.games[weapon] = row._count._all
    entry.kill[weapon] = row._sum.kill ?? 0
    entry.killGames[weapon] = row._count.kill
    entry.damage[weapon] = row._sum.damage ?? 0
    entry.damageGames[weapon] = row._count.damage
  }

  const rifle = emptyCohort()
  const sniper = emptyCohort()

  for (const [playerId, entry] of byPlayer) {
    /* 주무기 하나만 고른다. 반반인 선수는 어느 무리에도 넣지 않는다 —
       그 사람을 라플로 세면 절반의 스나 판이 라플 무리 안에서 견줘진다 */
    const weapon = mainWeaponOf(entry.games[0], entry.games[1])
    if (weapon === null) continue

    const killGames = entry.killGames[weapon]
    /* 표본이 모자란 선수는 **모집단에도 넣지 않는다.** 두세 판짜리 값이 분포 안에 섞이면
       백분위 자체가 흔들린다 — 그 선수의 축을 `측정중` 으로 두는 것과 같은 이유다 */
    if (killGames < TRAIT_MIN_GAMES) continue

    const damageGames = entry.damageGames[weapon]
    const value: PlayerValue = {
      knownGames: killGames,
      killPerGame: entry.kill[weapon] / killGames,
      damagePerGame: damageGames === 0 ? null : entry.damage[weapon] / damageGames,
    }

    const cohort = weapon === 1 ? sniper : rifle
    cohort.values.set(playerId, value)
    cohort.killSorted.push(value.killPerGame)
    if (value.damagePerGame !== null) cohort.damageSorted.push(value.damagePerGame)

    /* 라운드 축의 모집단도 **같은 무리** 안에서 만든다 (사양 4절: 같은 무기끼리 줄 세운다) */
    const round = rounds.get(playerId)
    if (round) {
      if (round.saveRate !== null) cohort.saveSorted.push(round.saveRate)
      if (round.outnumberedRate !== null) cohort.outnumberedSorted.push(round.outnumberedRate)
      if (round.matchManRate !== null) cohort.matchManSorted.push(round.matchManRate)
    }
  }

  for (const cohort of [rifle, sniper]) {
    cohort.killSorted.sort((a, b) => a - b)
    cohort.damageSorted.sort((a, b) => a - b)
    cohort.saveSorted.sort((a, b) => a - b)
    cohort.outnumberedSorted.sort((a, b) => a - b)
    cohort.matchManSorted.sort((a, b) => a - b)
  }

  return { rifle, sniper, rounds }
}

function distributionOf(leagueId: string, now: number): Promise<LeagueDistribution> {
  const hit = cache.get(leagueId)
  if (hit && now - hit.at < DISTRIBUTION_TTL_MS) return hit.value

  /* 실패한 약속을 캐시에 남기면 TTL 동안 같은 오류를 되돌려 준다. 지운다 */
  const value = buildDistribution(leagueId).catch((error: unknown) => {
    cache.delete(leagueId)
    throw error
  })
  cache.set(leagueId, { at: now, value })
  return value
}

/**
 * 그 선수의 육각형 + 플레이스타일 바.
 *
 * 그 선수가 분포에 없으면(판수 부족 · 반반 · 무기 미상) 축은 전부 `null` 이고
 * `pending` 이 그 이유를 말한다. **0으로 채우지 않는다** (D-106).
 */
export async function playerTraits(
  leagueId: string,
  playerId: string,
  now: Date = new Date(),
): Promise<{ traits: TraitHexagon; playstyle: PlaystyleBars }> {
  const distribution = await distributionOf(leagueId, now.getTime())

  const rifleValue = distribution.rifle.values.get(playerId)
  const sniperValue = distribution.sniper.values.get(playerId)
  const weapon: 0 | 1 | null = rifleValue ? 0 : sniperValue ? 1 : null
  const cohort = weapon === 1 ? distribution.sniper : distribution.rifle
  const value = weapon === 1 ? sniperValue : rifleValue
  const round = distribution.rounds.get(playerId)

  return {
    traits: buildPlayerTraits({
      weapon,
      /* 분포에 든 선수는 이미 `TRAIT_MIN_GAMES` 를 넘겼다. 못 든 선수는 `0` 으로 넘겨
         `buildPlayerTraits` 가 `경기 부족` 으로 판정하게 둔다 — 그 경계를 두 곳에
         적어 두지 않는다 */
      knownGames: value?.knownGames ?? 0,
      cohort: weapon === null ? null : cohort.killSorted.length,
      carryPercentile: value ? percentileOf(cohort.killSorted, value.killPerGame) : null,
      damagePercentile:
        value && value.damagePerGame !== null
          ? percentileOf(cohort.damageSorted, value.damagePerGame)
          : null,
      /* 라운드 축 (D-194). 자료가 없으면 `null` 이고 화면은 `라운드 복원 필요` 를 적는다 */
      savePercentile:
        round?.saveRate != null ? percentileOf(cohort.saveSorted, round.saveRate) : null,
      outnumberedPercentile:
        round?.outnumberedRate != null
          ? percentileOf(cohort.outnumberedSorted, round.outnumberedRate)
          : null,
      matchManPercentile:
        round?.matchManRate != null
          ? percentileOf(cohort.matchManSorted, round.matchManRate)
          : null,
      hasRoundData: round !== undefined,
    }),
    /* 두 줄 다 아직 못 잰다 (8절 · D-184). 화면 자리와 `측정중` 만 먼저 만든다 */
    playstyle: buildPlayerPlaystyle(),
  }
}
