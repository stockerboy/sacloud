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
 * ── 지금 잴 수 있는 축은 둘뿐이다
 *   3 캐리력(판당 평균 킬) · 라플수의 2 샷싸움(판당 평균 딜량).
 *   나머지 넷은 배틀로그·라운드 복원·포지션 판정이 있어야 한다 (D-184).
 */
import { prisma } from '@sacloud/db'
import {
  TRAIT_MIN_GAMES,
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
}

interface LeagueDistribution {
  /** `0 = 라이플` · `1 = 스나이퍼` */
  rifle: WeaponCohort
  sniper: WeaponCohort
}

const cache = new Map<string, { at: number; value: Promise<LeagueDistribution> }>()

/** 테스트가 캐시를 비울 수 있게 열어 둔다. 화면 코드는 부르지 않는다 */
export function clearTraitDistributionCache(): void {
  cache.clear()
}

function emptyCohort(): WeaponCohort {
  return { values: new Map(), killSorted: [], damageSorted: [] }
}

/**
 * 그 리그의 **같은 무기 선수 전원**의 판당 킬·판당 딜량 분포를 만든다.
 *
 * 무기를 `groupBy` 축으로 두고 한 번에 읽는다. 라플 모집단·스나 모집단을 따로 두 번
 * 읽으면 같은 스캔을 두 번 하게 되고, 주무기 판정에 필요한 "그 선수의 전체 판수" 도
 * 어차피 양쪽이 다 있어야 나온다.
 */
async function buildDistribution(leagueId: string): Promise<LeagueDistribution> {
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
  }

  for (const cohort of [rifle, sniper]) {
    cohort.killSorted.sort((a, b) => a - b)
    cohort.damageSorted.sort((a, b) => a - b)
  }

  return { rifle, sniper }
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
    }),
    /* 두 줄 다 아직 못 잰다 (8절 · D-184). 화면 자리와 `측정중` 만 먼저 만든다 */
    playstyle: buildPlayerPlaystyle(),
  }
}
