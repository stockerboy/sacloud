/**
 * 클랜 **육각형 V2** — DB(`MatchClanHexV2`) → 계약(`ClanHexV2`) 배선 (D-217 · **D-235**).
 *
 * ```
 * 배틀로그 원문 ──clanHexV2Of──▶ MatchClanHexV2 (경기 × 클랜, tally 통째 JSON)
 *                                   │
 *                                   ├─▶ 경기 상세 : 두 행을 겹쳐 그린다  → normalizeAgainstFoe (Q7)
 *                                   └─▶ 클랜 페이지: 그 클랜 행을 SUM     → normalizeByPercentile (Q8)
 * ```
 *
 * **세는 규칙은 여기 없다.** 분자·분모는 잡(`apps/worker` 의 `clanHexV2Build`)이 배틀로그에서
 * 세어 `MatchClanHexV2.tally` 에 통째로 쌓아 두었고, 합산·비율·정규화는 전부
 * `@sacloud/contract` 의 `sumClanHexTallies` · `buildClanHexV2Raw` ·
 * `normalizeAgainstFoe` · `normalizeByPercentile` 이 한다. Mock(`packages/mock`)도
 * **같은 함수**를 부른다 — 두 곳에서 따로 조립하면 mock↔live 대조가 조용히 어긋난다.
 * 이 파일이 하는 일은 DB 에서 재료를 꺼내 계약이 원하는 모양으로 맞춰 주는 것뿐이다.
 *
 * ── **옛 판을 지우지 않는다** (`CLAUDE.md` 10-4 · D-235 Q9)
 *   같은 자리의 옛 육각형은 `clanRoundMetrics.ts` 의 `leagueClanHexagon()` 이고
 *   그 파일도 함수도 그대로 살아 있다. 응답도 `hexagon`(옛) · `hexagon_v2`(새) 를
 *   **둘 다** 내린다. 축 여섯이 통째로 다르고 `게임템포` 는 이름만 같고 다른 지표라
 *   **한 화면에 나란히 놓지 않는 것**은 화면 쪽 규칙이다.
 *
 * ── **`formulaVersion` 이 다른 행을 섞지 않는다** (`CLAUDE.md` 3-B 5번)
 *   해석이 바뀌면 잡이 새 버전으로 행을 다시 만들고 옛 줄은 남는다. 필터가 없으면
 *   같은 경기에 두 줄이 잡혀 **기준이 다른 집계가 한 칸에 섞인다** (D-106).
 *   읽는 값은 `CLAN_HEX_V2_CONFIG.formulaVersion` 하나뿐이다.
 *
 * ── **비율을 평균 내지 않는다** (D-235 Q8)
 *   5라운드 경기와 18라운드 경기의 비율을 평균 내면 둘의 무게가 같아진다.
 *   `sumClanHexTallies` 로 분자·분모를 쌓고 `buildClanHexV2Raw` 에서 **한 번만** 나눈다.
 */
import { prisma } from '@sacloud/db'
import {
  CLAN_HEX_V2_CONFIG,
  buildClanHexV2Raw,
  normalizeAgainstFoe,
  normalizeByPercentile,
  sumClanHexTallies,
  type ClanHexTallyLike,
  type ClanHexV2,
} from '@sacloud/contract'

/**
 * 리그 분포를 다시 읽기까지의 시간.
 *
 * > `[미확인]` 사양에 없는 값이다. 10분은 우리가 고른 값이고 **원본과 동일함이 검증되지
 * > 않았다**. 옛 판(`clanRoundMetrics.ts`)·선수 특성(`playerTraits.ts`)과 **같은 값**으로
 * > 맞춰 두었다 — 한 화면의 카드들이 서로 다른 신선도를 갖지 않게 한다.
 */
const DISTRIBUTION_TTL_MS = 10 * 60 * 1000

/**
 * 한 번에 읽는 행 수.
 *
 * ⚠ **리그 전체 행을 한 번에 메모리에 올리지 않는다** (D-225 에서 두 번 터졌다).
 * 실측(2026-09-01 로컬):
 *
 * ```
 * 전체 행            9,388
 * 가장 큰 리그        6,230 행 / 클랜 103곳
 * tally 한 줄 평균     1,142 바이트 (최대 1,183)
 * ```
 *
 * 리그 하나를 통째로 읽으면 JSON 텍스트만 ~7MB 이고, 파싱된 객체는 그 몇 배가 된다.
 * 지금 크기라면 죽지는 않지만 **행 수는 배틀로그 수집이 늘수록 계속 는다** (D-218).
 * 그래서 커서로 1,000행씩 끊어 읽고, 읽는 즉시 클랜별 tally 에 **접어 넣는다** —
 * 최대로 들고 있는 것은 「한 배치 + 클랜 수(103)만큼의 합계 tally」 이고 행 수와 무관하다.
 *
 * ── 끊어 읽어도 **느려지지 않는다** (실측)
 *   ```
 *   1,000행 한 배치         67ms      × 7배치 ≈ 470ms
 *   6,230행 한 번에         493ms
 *   가장 큰 클랜 · 빈 캐시   585ms  ← 접는 시간까지 포함
 *   가장 큰 클랜 · 찬 캐시   0.37ms
 *   ```
 *
 * ── **인덱스로 줄일 수 있는 시간이 아니다**
 *   `EXPLAIN (ANALYZE)` 상 서버 실행은 **2.2ms** 다 (기본키 인덱스 스캔 + `LeagueClan`
 *   memoize 조인). 나머지는 전부 ~7MB 짜리 JSON 을 옮기고 파싱하는 값이다.
 *   그래서 **마이그레이션을 새로 만들지 않았다** — 걸어도 이 숫자가 안 움직인다.
 *   더 줄이려면 합산을 SQL(jsonb)로 내리거나 클랜 프로필 표를 따로 두어야 하는데,
 *   앞은 「세는 규칙은 계약 한 곳」을 깨고 뒤는 **D-235 가 명시적으로 금지**했다
 *   (표를 둘로 나누면 둘이 어긋날 자리가 생긴다).
 */
const BATCH_SIZE = 1000

/** 한 리그의 클랜별 **원값 육각형**(정규화 전). 백분위 모집단이자 그 클랜 자신의 값이다 */
interface LeagueHexV2Distribution {
  /** leagueClanId → 그 클랜 경기 행을 전부 합해 **한 번만 나눈** 육각형 */
  hexagons: Map<string, ClanHexV2>
}

const cache = new Map<string, { at: number; value: Promise<LeagueHexV2Distribution> }>()

/** 테스트가 캐시를 비울 수 있게 열어 둔다. 화면 코드는 부르지 않는다 */
export function clearClanHexV2DistributionCache(): void {
  cache.clear()
}

/** DB 의 `Json` 칸을 계약 타입으로 읽는다. 잡이 `ClanHexTally` 를 통째로 넣은 자리다 */
function tallyOf(value: unknown): ClanHexTallyLike | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  return value as ClanHexTallyLike
}

/**
 * 리그 한 곳의 클랜별 합계를 만든다.
 *
 * 배치로 읽으면서 **바로 접는다.** `sumClanHexTallies` 는 여러 개를 한 번에 받지만
 * 둘씩 접어도 결과가 같다 — 하는 일이 분자·분모 덧셈이라 결합법칙이 성립한다.
 * (`foeTeamNo` 만 예외적으로 «전부 같을 때만 남긴다» 인데, 둘씩 접어도 서로 다른 값이
 *  하나라도 섞이면 `null` 이 되어 같은 결과가 된다. 클랜 페이지에서는 어차피 안 쓴다.)
 */
async function buildDistribution(leagueId: string): Promise<LeagueHexV2Distribution> {
  const sums = new Map<string, { tally: ClanHexTallyLike | null; matches: number }>()

  let cursor: string | null = null
  for (;;) {
    const rows: { id: string; leagueClanId: string; tally: unknown }[] =
      await prisma.matchClanHexV2.findMany({
        where: {
          /* **버전을 반드시 건다** — 옛 줄이 남아 있으면 기준이 다른 값이 섞인다 */
          formulaVersion: CLAN_HEX_V2_CONFIG.formulaVersion,
          leagueClan: { leagueId },
        },
        select: { id: true, leagueClanId: true, tally: true },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
        ...(cursor === null ? {} : { cursor: { id: cursor }, skip: 1 }),
      })
    if (rows.length === 0) break

    for (const row of rows) {
      const tally = tallyOf(row.tally)
      if (tally === null) continue
      const before = sums.get(row.leagueClanId)
      if (before === undefined) {
        sums.set(row.leagueClanId, { tally, matches: 1 })
        continue
      }
      before.tally =
        before.tally === null ? tally : sumClanHexTallies([before.tally, tally])
      before.matches += 1
    }

    if (rows.length < BATCH_SIZE) break
    cursor = rows[rows.length - 1]?.id ?? null
    if (cursor === null) break
  }

  const hexagons = new Map<string, ClanHexV2>()
  for (const [leagueClanId, entry] of sums) {
    hexagons.set(leagueClanId, buildClanHexV2Raw({ tally: entry.tally, matches: entry.matches }))
  }
  return { hexagons }
}

function distributionOf(leagueId: string, now: number): Promise<LeagueHexV2Distribution> {
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
 * **클랜 페이지용** — 그 클랜 경기 행을 전부 합해 **한 번만** 나눈다 (D-235 Q8).
 *
 * 정규화는 **같은 리그 클랜들 안에서의 백분위**다. 모집단에 그 클랜 자신도 넣는다 —
 * 빼면 자기가 1등일 때 백분위가 100 이 되어 «모두를 이겼다» 가 «모집단 밖» 으로 읽힌다.
 * (계약의 `normalizeByPercentile` 은 넣고 빼는 것을 부르는 쪽에 맡긴다.)
 *
 * 행이 하나도 없으면 `null` 이다 — 배틀로그를 아직 못 받은 클랜이고, 화면은 카드를
 * **그리지 않는다**. 여섯 축이 전부 `측정중` 인 빈 카드를 그리지 않는다 (D-106).
 * 옛 판(`leagueClanHexagon`)과 같은 규칙이다.
 */
export async function leagueClanHexV2(args: {
  leagueClanId: string
  leagueId: string
  now?: Date
}): Promise<ClanHexV2 | null> {
  const now = args.now ?? new Date()
  const distribution = await distributionOf(args.leagueId, now.getTime())
  const target = distribution.hexagons.get(args.leagueClanId)
  if (target === undefined) return null
  return normalizeByPercentile(target, [...distribution.hexagons.values()])
}

/* -------------------------------------------------------------------------- */
/* 경기 상세 (D-235 Q7)                                                          */
/* -------------------------------------------------------------------------- */

export interface MatchClanHexV2Side {
  leagueClanId: string
  hexagon: ClanHexV2
}

export interface MatchClanHexV2Pair {
  red: MatchClanHexV2Side | null
  blue: MatchClanHexV2Side | null
}

/**
 * **경기 상세용** — 양 클랜을 겹쳐 그릴 수 있게 **둘 다** 준다 (D-235 Q7).
 *
 * 한 경기는 표본이 1이라 리그 백분위를 쓸 수 없고, 고정 상한을 우리가 정하면 그건
 * 지어낸 값이다. 그래서 **그 경기 두 클랜 중 큰 쪽을 1.0** 으로 둔다
 * (`normalizeAgainstFoe`). 게임템포만 작은 쪽이 1.0 이다.
 *
 * ── `red` / `blue` 는 **우리 슬롯 이름**이지 진영이 아니다 (D-184)
 *   `Match.redLeagueClanId` / `blueLeagueClanId` 를 그대로 따른다. 경기 상세 응답의
 *   `red_stats` / `blue_stats` 와 **같은 기준**이라 화면이 짝을 맞추기 쉽다.
 *   실제 선공 진영은 `first_side` 가 따로 말해 준다.
 *
 * ── 한쪽 행만 있으면 **그쪽도 값을 못 그린다**
 *   상대가 없으면 겹쳐 그릴 수 없다. 혼자만 꽉 찬 육각형은 «잘한다» 가 아니라
 *   «상대를 못 쟀다» 로 읽혀야 한다. 그래서 없는 쪽 자리에 빈 육각형을 세워
 *   `normalizeAgainstFoe` 를 그대로 태운다 — 값이 있던 축에 `pending='compare'` 가 붙는다.
 *   없는 쪽은 `null` 이다(그릴 것이 아무것도 없다).
 *
 * ── `sides`
 *   `getMatch()` 는 이미 `redLeagueClanId` · `blueLeagueClanId` 를 들고 있다.
 *   넘겨 주면 왕복 한 번을 아낀다. 없으면 여기서 두 칸만 읽는다.
 *
 * 두 행 다 없으면 `null` 이고 화면은 카드를 그리지 않는다 (D-106).
 */
export async function matchClanHexV2(
  matchId: string,
  sides?: { redLeagueClanId: string; blueLeagueClanId: string },
): Promise<MatchClanHexV2Pair | null> {
  const resolved =
    sides ??
    (await prisma.match.findUnique({
      where: { id: matchId },
      select: { redLeagueClanId: true, blueLeagueClanId: true },
    }))
  if (!resolved) return null

  const rows = await prisma.matchClanHexV2.findMany({
    where: { matchId, formulaVersion: CLAN_HEX_V2_CONFIG.formulaVersion },
    select: { leagueClanId: true, tally: true },
  })
  if (rows.length === 0) return null

  const rawOf = (leagueClanId: string): ClanHexV2 | null => {
    const row = rows.find((entry) => entry.leagueClanId === leagueClanId)
    if (row === undefined) return null
    return buildClanHexV2Raw({ tally: tallyOf(row.tally), matches: 1 })
  }

  const redRaw = rawOf(resolved.redLeagueClanId)
  const blueRaw = rawOf(resolved.blueLeagueClanId)
  if (redRaw === null && blueRaw === null) return null

  /* 빈 육각형 = 「재료가 아예 없다」. 상대 자리에 세우면 우리 축이 `compare` 로 내려간다 */
  const empty = (): ClanHexV2 => buildClanHexV2Raw({ tally: null, matches: 0 })
  const [red, blue] = normalizeAgainstFoe(redRaw ?? empty(), blueRaw ?? empty())

  return {
    red: redRaw === null ? null : { leagueClanId: resolved.redLeagueClanId, hexagon: red },
    blue: blueRaw === null ? null : { leagueClanId: resolved.blueLeagueClanId, hexagon: blue },
  }
}
