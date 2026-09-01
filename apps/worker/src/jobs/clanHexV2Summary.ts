/**
 * 클랜 육각형 V2 를 **클랜 하나에 한 행으로 접어** `ClanHexV2Summary` 에 쌓는다 (D-238 후속).
 *
 * ```
 * MatchClanHexV2 (경기 × 클랜, tally 통째)  ──접는다──▶  ClanHexV2Summary (클랜 × 1)
 *      ↑ 진실의 출처. 여기는 안 건드린다                      ↑ 사본. 화면이 읽는 것
 * ```
 *
 * ── 왜 필요했나 — **이 자리가 운영을 500 으로 만들었다** (D-238)
 *   클랜 페이지 육각형은 「같은 리그에서 몇 등인가」(백분위 · D-235 Q8)다. 등수를 매기려면
 *   리그의 모든 클랜 값이 필요한데, 질의가 그걸 **요청마다** `MatchClanHexV2` 를 리그
 *   통째로 읽어 그 자리에서 만들고 있었다.
 *
 *   ```
 *   열산 6,230행 · DPL 3,062행 · tally 가 행마다 약 1.1KB → 한 요청에 7MB
 *     → /api/leagues/supply/clans/lpcrew/show 가 10.6초 → 500
 *   ```
 *
 *   접어 두면 읽는 양이 「리그의 경기 행 수」에서 **「리그의 클랜 수」**로 바뀐다.
 *
 * ── **세는 규칙은 여기 없다.** 계약의 `sumClanHexTallies` 를 그대로 부른다
 *   질의(`apps/web/.../clanHexV2.ts`)가 리그 전체를 접을 때 쓰던 **바로 그 함수**다.
 *   분자·분모 덧셈이라 결합법칙이 성립하므로, 미리 접든 그 자리에서 접든 **값이 같다.**
 *   SQL(jsonb)로 접지 않은 이유가 이것이다 — 그러면 나누는 규칙이 두 곳에 생긴다.
 *
 * ── **전량을 메모리에 올리지 않는다** (D-225)
 *   클랜 하나씩, 그 클랜 행만 커서로 흘려 읽어 접는다. 한 번에 들고 있는 것은
 *   「한 배치 + 접히는 중인 tally 하나」이고 리그 크기와 무관하다.
 *
 * ── 멱등 · 재개 가능
 *   `--confirm` 없이는 한 줄도 쓰지 않는다. 클랜 하나에 한 행(`@@unique`)이라 몇 번을
 *   돌려도 행이 안 늘고 값이 덮인다. 이미 최신인 클랜은 **건너뛴다** — 판단 기준은
 *   `formulaVersion` 이 같고 · 요약이 원재료의 마지막 `builtAt` 보다 새롭고 · 경기 수가
 *   맞는 것. 중간에 죽어도 같은 명령을 다시 돌리면 남은 것부터 이어서 돈다.
 *
 * ```
 * pnpm --filter @sacloud/worker nexon clan-hex-v2-summary                  # 미리보기
 * pnpm --filter @sacloud/worker nexon clan-hex-v2-summary --confirm
 * pnpm --filter @sacloud/worker nexon clan-hex-v2-summary --league sanply --confirm
 * pnpm --filter @sacloud/worker nexon clan-hex-v2-summary --rebuild --confirm
 * pnpm --filter @sacloud/worker nexon clan-hex-v2-summary --prune --confirm
 * ```
 *
 * ── 못 재는 것
 *   1. **요약이 원재료와 어긋났는지 실시간으로는 모른다.** 아는 길은 두 가지뿐이다 —
 *      `formulaVersion` 이 다르면 화면이 안 읽고, `--rebuild` 로 다시 접어 대조한다.
 *      언제나 원재료 쪽이 옳다
 *   2. `--league` · `--limit` 로 좁혀 돌리면 **`--prune` 은 동작하지 않는다.**
 *      부분만 보고 «없다» 고 판정하면 멀쩡한 요약을 지운다
 */
import { prisma } from '@sacloud/db'
import { sumClanHexTallies, type ClanHexTallyLike } from '@sacloud/contract'
import { axesMeasuredOf } from '../lib/clanHexV2Axes.js'
import { CLAN_HEX_V2_FORMULA_VERSION } from '../lib/clanHexV2Version.js'

/**
 * 한 클랜의 경기 행을 몇 줄씩 읽을까 (D-225).
 *
 * 가장 큰 클랜도 수백 행이라 한 번에 다 오는 경우가 많지만, **행 수는 배틀로그 수집이
 * 늘수록 계속 는다** (D-218). 커서 관례를 그대로 지킨다.
 */
const ROW_BATCH = 500

/** 키 조회를 한 번에 몇 개씩 묶을까 */
const KEY_CHUNK = 500

export interface ClanHexV2SummaryResult {
  /** 원재료에 행이 있는 클랜 수 (`--league` · `--limit` 로 좁힌 뒤) */
  clans: number
  /** 실제로 접은(접을) 클랜 수 */
  built: number
  /** 이미 최신이라 건너뛴 클랜 — 재개의 알맹이다 */
  fresh: number
  /** `LeagueClan` 을 못 찾아 건너뛴 클랜. 0 이 아니면 원재료가 이상한 것이다 */
  noLeagueClan: number
  /** 접느라 읽은 경기 행 수 */
  rowsRead: number
  /** 요약에 담긴 경기 수의 합 */
  matches: number
  /** `axesMeasured` 분포 — 첨자가 축 개수(0~6)다 */
  axesHistogram: number[]
  /** 만든 요약 tally 의 JSON 바이트 합 — **화면이 한 리그에서 읽게 될 양**이다 */
  bytes: number
  /** 원재료가 사라졌는데 남아 있는 요약 (`--prune` 으로 지운다) */
  stale: number
  /** 실제로 지운 요약 수 */
  pruned: number
  /** 지금 표에 있는 요약 행 수 — 쓰기 전 / 쓴 뒤 */
  targetBefore: number
  targetAfter: number
  written: boolean
}

export async function buildClanHexV2Summary(input: {
  confirm: boolean
  /** 리그 slug 로 좁힌다 (`supply` · `nolink` · `sanply`) */
  leagueSlug?: string | null
  /** 이만큼의 **클랜**만 접는다. 미리보기·소량 대조용 */
  limit?: number | null
  /** 최신이어도 다시 접는다. **원재료와 대조하는 유일한 길이다** */
  rebuild?: boolean
  /** 원재료가 사라진 요약을 지운다. 좁혀 돌릴 때는 **무시된다** */
  prune?: boolean
  /**
   * 이 클랜들만 접는다 — 집계잡(`clanHexV2Build`)이 방금 건드린 클랜을 넘겨 준다.
   * 화면·CLI 에서 쓰는 값이 아니다.
   */
  leagueClanIds?: readonly string[] | null
}): Promise<ClanHexV2SummaryResult> {
  const rebuild = input.rebuild === true
  const limit = input.limit ?? null
  const scoped =
    input.leagueSlug != null || limit !== null || (input.leagueClanIds?.length ?? 0) > 0

  const result: ClanHexV2SummaryResult = {
    clans: 0,
    built: 0,
    fresh: 0,
    noLeagueClan: 0,
    rowsRead: 0,
    matches: 0,
    axesHistogram: [0, 0, 0, 0, 0, 0, 0],
    bytes: 0,
    stale: 0,
    pruned: 0,
    targetBefore: 0,
    targetAfter: 0,
    written: false,
  }

  result.targetBefore = await prisma.clanHexV2Summary.count()

  /*
   * ── 대상 고르기.
   *
   * `groupBy` 는 **`tally` 를 한 바이트도 안 읽는다.** 클랜별 행 수와 마지막 `builtAt`
   * 만 가져온다 — 이게 «누가 낡았나» 를 판정하는 재료다. 여기서 tally 를 읽으면
   * D-238 을 그대로 반복하게 된다.
   */
  const groups = await prisma.matchClanHexV2.groupBy({
    by: ['leagueClanId'],
    where: {
      formulaVersion: CLAN_HEX_V2_FORMULA_VERSION,
      ...(input.leagueSlug ? { leagueClan: { league: { slug: input.leagueSlug } } } : {}),
      ...(input.leagueClanIds?.length
        ? { leagueClanId: { in: [...input.leagueClanIds] } }
        : {}),
    },
    _count: { _all: true },
    _max: { builtAt: true },
  })
  /* 결정적으로 돈다 — 중간에 죽고 다시 돌려도 같은 순서다 */
  groups.sort((a, b) => (a.leagueClanId < b.leagueClanId ? -1 : 1))
  const targets = limit === null ? groups : groups.slice(0, limit)
  result.clans = targets.length

  /* ── 이미 있는 요약 (판단용). `tally` 는 **안 읽는다** — 낡았는지 보는 데 필요 없다 */
  const existing = new Map<
    string,
    { formulaVersion: string; builtAt: Date; matches: number }
  >()
  const targetIds = targets.map((group) => group.leagueClanId)
  for (let i = 0; i < targetIds.length; i += KEY_CHUNK) {
    for (const row of await prisma.clanHexV2Summary.findMany({
      where: { leagueClanId: { in: targetIds.slice(i, i + KEY_CHUNK) } },
      select: { leagueClanId: true, formulaVersion: true, builtAt: true, matches: true },
    })) {
      existing.set(row.leagueClanId, {
        formulaVersion: row.formulaVersion,
        builtAt: row.builtAt,
        matches: row.matches,
      })
    }
  }

  /* ── leagueId 는 요약의 칸이다 (백분위 모집단을 조인 없이 고르기 위한 것) */
  const leagueOfClan = new Map<string, string>()
  for (let i = 0; i < targetIds.length; i += KEY_CHUNK) {
    for (const row of await prisma.leagueClan.findMany({
      where: { id: { in: targetIds.slice(i, i + KEY_CHUNK) } },
      select: { id: true, leagueId: true },
    })) {
      leagueOfClan.set(row.id, row.leagueId)
    }
  }

  for (const group of targets) {
    const leagueClanId = group.leagueClanId
    const rowCount = group._count._all
    const newest = group._max.builtAt

    const before = existing.get(leagueClanId)
    /*
     * 최신 판정 — 셋을 **다 넘어야** 건너뛴다.
     *   ① 같은 판으로 접혔다        판이 바뀌면 다시 접어야 한다 (3-B 5번)
     *   ② 원재료보다 나중에 접혔다   경기 행이 새로 들어왔으면 낡은 것이다
     *   ③ 경기 수가 맞다            행이 지워졌을 때 ②만으로는 못 잡는다
     */
    const isFresh =
      !rebuild &&
      before !== undefined &&
      before.formulaVersion === CLAN_HEX_V2_FORMULA_VERSION &&
      before.matches === rowCount &&
      newest !== null &&
      before.builtAt >= newest
    if (isFresh) {
      result.fresh += 1
      continue
    }

    const leagueId = leagueOfClan.get(leagueClanId)
    if (leagueId === undefined) {
      /* 원재료가 가리키는 등록이 없다. 억지로 붙이지 않는다 (3장 7번) */
      result.noLeagueClan += 1
      continue
    }

    /* ── 그 클랜 행만 흘려 읽어 접는다 */
    let folded: ClanHexTallyLike | null = null
    let matches = 0
    let cursor: string | null = null
    for (;;) {
      const rows: { id: string; tally: unknown }[] = await prisma.matchClanHexV2.findMany({
        where: { leagueClanId, formulaVersion: CLAN_HEX_V2_FORMULA_VERSION },
        select: { id: true, tally: true },
        orderBy: { id: 'asc' },
        take: ROW_BATCH,
        ...(cursor === null ? {} : { cursor: { id: cursor }, skip: 1 }),
      })
      if (rows.length === 0) break
      result.rowsRead += rows.length

      for (const row of rows) {
        const tally = tallyOf(row.tally)
        if (tally === null) continue
        /* 둘씩 접어도 결과가 같다 — 하는 일이 분자·분모 덧셈이라 결합법칙이 성립한다 */
        folded = folded === null ? tally : sumClanHexTallies([folded, tally])
        matches += 1
      }

      if (rows.length < ROW_BATCH) break
      cursor = rows[rows.length - 1]?.id ?? null
      if (cursor === null) break
    }

    if (folded === null) {
      /* 읽을 tally 가 하나도 없었다. 빈 요약을 만들지 않는다 — 화면은 «없으면 안 그린다» */
      continue
    }

    const axes = axesMeasuredOf(folded)
    const json = JSON.stringify(folded)
    result.built += 1
    result.matches += matches
    result.axesHistogram[axes] = (result.axesHistogram[axes] ?? 0) + 1
    result.bytes += json.length

    if (input.confirm) {
      const data = {
        leagueId,
        formulaVersion: CLAN_HEX_V2_FORMULA_VERSION,
        tally: folded as unknown as object,
        matches,
        axesMeasured: axes,
        builtAt: new Date(),
      }
      await prisma.clanHexV2Summary.upsert({
        where: { leagueClanId },
        update: data,
        create: { leagueClanId, ...data },
      })
    }
  }

  /*
   * ── 원재료가 사라진 요약.
   *
   * 경기가 지워졌거나 판이 바뀐 뒤 다시 안 접힌 것들이다. **좁혀 돌렸을 때는 세지도
   * 않는다** — 부분만 보고 «없다» 고 판정하면 멀쩡한 요약을 지운다.
   */
  if (!scoped) {
    const live = new Set(groups.map((group) => group.leagueClanId))
    const orphans: string[] = []
    let cursor: string | null = null
    for (;;) {
      const rows: { id: string; leagueClanId: string }[] =
        await prisma.clanHexV2Summary.findMany({
          select: { id: true, leagueClanId: true },
          orderBy: { id: 'asc' },
          take: KEY_CHUNK,
          ...(cursor === null ? {} : { cursor: { id: cursor }, skip: 1 }),
        })
      if (rows.length === 0) break
      for (const row of rows) if (!live.has(row.leagueClanId)) orphans.push(row.id)
      if (rows.length < KEY_CHUNK) break
      cursor = rows[rows.length - 1]?.id ?? null
      if (cursor === null) break
    }
    result.stale = orphans.length
    if (input.prune === true && input.confirm && orphans.length > 0) {
      const deleted = await prisma.clanHexV2Summary.deleteMany({ where: { id: { in: orphans } } })
      result.pruned = deleted.count
    }
  }

  result.targetAfter = await prisma.clanHexV2Summary.count()
  result.written = input.confirm
  return result
}

/** DB 의 `Json` 칸을 계약 타입으로 읽는다. 질의 쪽 `tallyOf` 와 **같은 규칙**이다 */
function tallyOf(value: unknown): ClanHexTallyLike | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  return value as ClanHexTallyLike
}
