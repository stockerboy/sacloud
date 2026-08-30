/**
 * 클랜페이지 **배틀로그 지표** — 블루방어율 · 어택성공률 · 조직력 · 폭발력 · 게임템포 ·
 * 클린시트 · 소수싸움 (`docs/SITE_SPEC_V2.md` 5-5절).
 *
 * **세는 규칙은 여기 없다.** 분자·분모는 잡(`apps/worker/src/jobs/clanRoundBuild.ts`)이
 * 배틀로그에서 세어 `ClanRoundProfile` 에 쌓아 두었고, 비율·백분위 판정은
 * `@sacloud/contract` 의 `buildClanRoundMetrics()` 가 한다. Mock(`packages/mock`)도
 * **같은 함수**를 부른다 — 두 곳에서 따로 판정하면 mock↔live 대조가 조용히 어긋난다.
 * 이 파일이 하는 일은 DB 에서 재료를 꺼내 계약이 원하는 모양으로 맞춰 주는 것뿐이다.
 *
 * ── 모집단은 잡이 이미 걸었다
 *   래더 반영 경기(D-164 · D-178) + 시즌0 창(D-175)을 **집계 시점에** 건다.
 *   여기서 다시 거를 수 없다 — 저장된 것은 이미 합쳐진 숫자다. 그래서 잡과 이 화면이
 *   같은 모집단을 보는지는 `builderVersion` 이 지켜 준다. 규칙이 바뀌면 버전을 올리고,
 *   옛 줄은 남되 읽히지 않는다.
 *
 * ── 왜 리그 전체를 한 번에 세고 캐시하는가
 *   템포는 **그 클랜 하나만 봐서는 낼 수 없다.** 같은 리그 클랜들의 중앙값이 다 있어야
 *   "몇 %" 가 나온다. 클랜페이지를 열 때마다 리그 전체를 읽으면 그만큼 화면이 늦는다.
 *   그래서 리그 단위로 한 번 읽어 `DISTRIBUTION_TTL_MS` 동안 재사용한다.
 *   같은 순간에 여러 요청이 들어와도 **한 번만** 읽는다(진행 중인 약속을 나눠 쓴다).
 *   `playerTraits.ts` 의 리그 분포 캐시와 같은 방식이다.
 *
 *   ⚠ 그래서 이 백분위는 최대 `DISTRIBUTION_TTL_MS` 만큼 낡을 수 있다.
 *   그 클랜 자신의 값도 **같은 캐시**에서 읽는다 — 값과 분포가 다른 시점에서 오면
 *   "중앙값 72초인데 상위 10%" 같은 어긋남이 생긴다.
 *
 * ── 어느 잣대로 템포를 재나 — `gap`
 *   잡은 두 벌을 저장한다. `span` 은 그 라운드의 첫·마지막 이벤트 간격이라 실제 길이의
 *   **하한**이고, 이벤트가 하나뿐인 라운드는 `0` 이 된다. `gap` 은 다음 라운드 첫 이벤트
 *   까지의 간격이라 **상한**이고(라운드 사이 대기시간이 섞인다) 0 이 되지 않는다.
 *
 *   화면은 `gap` 을 쓴다. 백분위는 **순서**만 보는데, `span` 은 킬이 적게 난 라운드를
 *   전부 0 쪽으로 몰아 "조용한 라운드가 많은 클랜" 을 가장 빠른 클랜으로 만든다.
 *   대기시간은 모든 클랜에 같이 얹히므로 순서를 크게 흔들지 않는다.
 *   `span` 도 DB 에 그대로 남아 있어, 판단이 바뀌면 여기 한 줄만 고치면 된다.
 */
import { prisma } from '@sacloud/db'
import {
  CLAN_OUTNUMBERED_MIN_ROUNDS,
  CLAN_ROUND_MIN_ROUNDS,
  CLAN_TEMPO_MIN_ROUNDS,
  buildClanHexagon,
  buildClanRoundMetrics,
  type ClanAxisInput,
  type ClanHexagon,
  type ClanRoundMetrics,
  type ClanRoundTallyInput,
  type ClanTraitAxisKey,
} from '@sacloud/contract'
/* 집계 버전은 잡이 정하고 화면이 따라 읽는다. 두 곳에 적어 두면 언젠가 갈라진다 */
import { CLAN_ROUND_BUILDER_VERSION } from '../../../../worker/src/lib/clanRoundBuilderVersion'

/**
 * 리그 분포를 다시 읽기까지의 시간.
 *
 * > `[미확인]` 사양에 없는 값이다. 10분은 우리가 고른 값이고 **원본과 동일함이
 * > 검증되지 않았다**. `playerTraits.ts` 와 같은 값으로 맞춰 두었다 — 두 카드가
 * > 같은 화면에서 서로 다른 신선도를 갖지 않게 한다.
 */
const DISTRIBUTION_TTL_MS = 10 * 60 * 1000

const PROFILE_SELECT = {
  leagueClanId: true,
  matches: true,
  sidedMatches: true,
  roundsTotal: true,
  roundsKnown: true,
  defenseRounds: true,
  defenseConceded: true,
  attackRounds: true,
  attackWon: true,
  attackSideRounds: true,
  plantRounds: true,
  organizedRounds: true,
  organizedHeld: true,
  burstRounds: true,
  bursts: true,
  tempoGapRounds: true,
  tempoGapMedian: true,
  cleanSheetMatches: true,
  cleanSheets: true,
  outnumberedRounds: true,
  outnumberedWon: true,
} as const

interface LeagueDistribution {
  /** leagueClanId → 그 클랜의 분자·분모 */
  tallies: Map<string, ClanRoundTallyInput>
  /**
   * 같은 리그 클랜들의 템포 중앙값.
   *
   * 표본이 `CLAN_TEMPO_MIN_ROUNDS` 에 못 미치는 클랜은 **분포에도 넣지 않는다** —
   * 세 라운드짜리 중앙값이 섞이면 백분위 자체가 흔들린다 (D-106 과 같은 이유).
   */
  tempoCohort: number[]
}

const cache = new Map<string, { at: number; value: Promise<LeagueDistribution> }>()

/** 테스트가 캐시를 비울 수 있게 열어 둔다. 화면 코드는 부르지 않는다 */
export function clearClanRoundDistributionCache(): void {
  cache.clear()
}

async function buildDistribution(leagueId: string): Promise<LeagueDistribution> {
  const rows = await prisma.clanRoundProfile.findMany({
    /* **버전을 반드시 건다.** 규칙이 바뀌면 옛 줄이 남으므로(`clanRoundBuild.ts`),
       필터가 없으면 같은 클랜에 두 줄이 잡히고 **DB 반환 순서에 따라** 아무 쪽이나 이긴다 */
    where: { builderVersion: CLAN_ROUND_BUILDER_VERSION, leagueClan: { leagueId } },
    select: PROFILE_SELECT,
  })

  const tallies = new Map<string, ClanRoundTallyInput>()
  const tempoCohort: number[] = []
  for (const row of rows) {
    tallies.set(row.leagueClanId, {
      matches: row.matches,
      sidedMatches: row.sidedMatches,
      roundsTotal: row.roundsTotal,
      roundsKnown: row.roundsKnown,
      defenseRounds: row.defenseRounds,
      defenseConceded: row.defenseConceded,
      attackRounds: row.attackRounds,
      attackWon: row.attackWon,
      attackSideRounds: row.attackSideRounds,
      plantRounds: row.plantRounds,
      organizedRounds: row.organizedRounds,
      organizedHeld: row.organizedHeld,
      burstRounds: row.burstRounds,
      bursts: row.bursts,
      tempoRounds: row.tempoGapRounds,
      tempoMedian: row.tempoGapMedian,
      cleanSheetMatches: row.cleanSheetMatches,
      cleanSheets: row.cleanSheets,
      outnumberedRounds: row.outnumberedRounds,
      outnumberedWon: row.outnumberedWon,
    })
    if (row.tempoGapMedian !== null && row.tempoGapRounds >= CLAN_TEMPO_MIN_ROUNDS) {
      tempoCohort.push(row.tempoGapMedian)
    }
  }
  return { tallies, tempoCohort }
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
 * 한 클랜의 배틀로그 지표.
 *
 * 그 클랜의 집계가 없으면(배틀로그를 아직 못 받았다) `null` 이다. 집계가 있어도
 * 진영을 확인한 경기가 없고 **소수싸움도 못 잰** 클랜은 `null` 이다 — 전부 `측정중` 인
 * 빈 카드를 그리지 않는다 (D-106). 판정은 `buildClanRoundMetrics()` 안에 있다.
 */
export async function leagueClanRoundMetrics(
  leagueId: string,
  leagueClanId: string,
  now: Date = new Date(),
): Promise<ClanRoundMetrics | null> {
  const distribution = await distributionOf(leagueId, now.getTime())
  const tally = distribution.tallies.get(leagueClanId)
  if (!tally) return null
  return buildClanRoundMetrics({ tally, tempoCohort: distribution.tempoCohort })
}


/* -------------------------------------------------------------------------- */
/* 클랜 육각형 (SITE_SPEC_V2 5-5절)                                             */
/* -------------------------------------------------------------------------- */

/**
 * 한 축의 값 — 표본이 최소치에 못 미치면 `null` 이다. **0 을 돌려주지 않는다** (D-106).
 */
function rate(numerator: number, denominator: number, min: number): number | null {
  if (denominator < min) return null
  return (numerator / denominator) * 100
}

/** 그 클랜의 여섯 축 값. 못 재는 축은 `null` */
function axisValuesOf(tally: ClanRoundTallyInput): Record<ClanTraitAxisKey, number | null> {
  return {
    outnumbered: rate(tally.outnumberedWon, tally.outnumberedRounds, CLAN_OUTNUMBERED_MIN_ROUNDS),
    /* 내준 비율이 아니라 **지킨 비율**이다 — 육각형은 클수록 잘하는 것이어야 한다 */
    defense: rate(
      tally.defenseRounds - tally.defenseConceded,
      tally.defenseRounds,
      CLAN_ROUND_MIN_ROUNDS,
    ),
    attack: rate(tally.attackWon, tally.attackRounds, CLAN_ROUND_MIN_ROUNDS),
    organized: rate(tally.organizedHeld, tally.organizedRounds, CLAN_ROUND_MIN_ROUNDS),
    burst: rate(tally.bursts, tally.burstRounds, CLAN_ROUND_MIN_ROUNDS),
    tempo:
      tally.tempoRounds >= CLAN_TEMPO_MIN_ROUNDS && tally.tempoMedian !== null
        ? tally.tempoMedian
        : null,
  }
}

/** 그 축을 못 잰 이유 */
const AXIS_PENDING: Record<ClanTraitAxisKey, ClanAxisInput['pending']> = {
  outnumbered: 'matches',
  defense: 'side',
  attack: 'side',
  organized: 'side',
  burst: 'side',
  tempo: 'side',
}

/**
 * 클랜 육각형.
 *
 * **질의를 새로 하지 않는다** — 배틀로그 지표가 이미 읽어 둔 리그 분포(10분 캐시)를
 * 그대로 쓴다. 여섯 축의 재료가 전부 `ClanRoundProfile` 한 표에 있기 때문이다.
 *
 * 집계 자체가 없으면(배틀로그를 아직 못 받았다) `null` 이고 화면은 그림을 안 그린다.
 */
export async function leagueClanHexagon(
  leagueId: string,
  leagueClanId: string,
  now: Date = new Date(),
): Promise<ClanHexagon | null> {
  const distribution = await distributionOf(leagueId, now.getTime())
  const tally = distribution.tallies.get(leagueClanId)
  if (!tally) return null

  /* 같은 리그 클랜들의 축별 분포. 못 잰 클랜은 분포에도 넣지 않는다 —
     빈 값이 섞이면 백분위가 흔들린다 */
  const cohorts: Record<ClanTraitAxisKey, number[]> = {
    outnumbered: [],
    defense: [],
    attack: [],
    organized: [],
    burst: [],
    tempo: [],
  }
  for (const other of distribution.tallies.values()) {
    const values = axisValuesOf(other)
    for (const key of Object.keys(cohorts) as ClanTraitAxisKey[]) {
      const value = values[key]
      if (value !== null) cohorts[key].push(value)
    }
  }

  const mine = axisValuesOf(tally)
  const inputs = {} as Record<ClanTraitAxisKey, ClanAxisInput>
  for (const key of Object.keys(cohorts) as ClanTraitAxisKey[]) {
    inputs[key] = {
      value: mine[key],
      cohort: cohorts[key],
      pending: AXIS_PENDING[key],
      /* 템포만 **작을수록** 좋다 — 라운드가 빨리 끝날수록 높은 템포다 */
      lowerIsBetter: key === 'tempo',
    }
  }
  return buildClanHexagon(inputs)
}
