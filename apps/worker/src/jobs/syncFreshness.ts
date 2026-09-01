/**
 * **증분 동기화가 실제로 무엇을 넣고 있나** — 신선도 검사 (2026-09-01 · D-225).
 *
 * ```
 * nexon sync-freshness [--leagues supply,daerule,sanply] [--max-age <slug>=<시간> ...]
 * ```
 *
 * ── 무엇을 보는가
 *   「최신 경기가 밀렸다」는 두 가지 중 하나이고 **처방이 정반대다.**
 *
 *     ① 원본에 새 경기가 없다   → `ingestedAt` 은 최근인데 `startAt` 이 낡았다
 *     ② 우리가 못 받고 있다     → `ingestedAt` 자체가 낡았다
 *
 *   그래서 두 시각을 **따로** 찍는다. 사람이 로그만 보고 갈라낼 수 있어야 한다.
 *
 * ── 임계값은 **실측으로 정했다.** 추측하지 않는다
 *   운영 최근 8일 경기 간격 (2026-09-01 실측):
 *
 *     리그      구간수  중앙   p90     최대     12h초과
 *     supply     450   0.1h  0.5h    18.0h      3
 *     sanply     964   0.1h  0.3h     7.1h      0
 *     daerule     11   0.3h 21.6h   116.3h      2
 *
 *   `sanply` 는 8일 동안 7.1시간을 넘겨 쉰 적이 **한 번도 없다** — 가장 예민한 감지기다.
 *   `supply` 는 18시간 공백이 정상 범위에 있다. `daerule` 은 8일에 경기가 12건뿐이고
 *   최대 공백이 **4.8일**이라, 신선도로 판정할 수 있는 리그가 아니다.
 *
 *   그래서 임계값이 리그마다 다르다. **하나로 묶으면 오경보가 난다** —
 *   그러면 알람이 무뎌지고, 그건 D-224 에서 이미 한 번 겪은 실패다.
 *
 * ── 이 검사는 「원본이 조용한 것」을 잡지 못한다
 *   잡을 수 있는 것은 **우리 쪽이 며칠씩 멈춘 것**이다. 예약 드롭 자체는
 *   워크플로의 「예약 간격」 스텝이 GitHub `actions/runs` 로 따로 본다 (D-225).
 *
 * ── **읽기만 한다.** 한 줄도 쓰지 않는다.
 */
import { prisma } from '@sacloud/db'

/** 리그별 기본 임계값(시간). 위 실측 표에서 최대 공백에 여유를 얹은 값이다 */
export const SYNC_FRESHNESS_DEFAULT_MAX_AGE_HOURS: Record<string, number> = {
  /* 최대 공백 7.1h → 12h 면 오경보 0, 실패는 확실히 잡는다 */
  sanply: 12,
  /* 최대 공백 18.0h → 24h. 더 조이면 새벽마다 운다 */
  supply: 24,
  /* 8일에 12경기 · 최대 공백 4.8일. 신선도로 판정하지 않는다 (사실상 끔) */
  daerule: 168,
}
/** 표에 없는 리그의 기본값. 모르는 리그를 조용히 통과시키지 않되 무는 값은 아니다 */
export const SYNC_FRESHNESS_FALLBACK_MAX_AGE_HOURS = 48

/**
 * 리그마다 **어느 경로로 들어오는가** — `Match.origin` 이 그것을 말해 준다.
 *
 * 예전에는 `origin: '3rd.supply'` 가 코드에 박혀 있었다. 그 전제는 「모든 리그가
 * 3rd.supply 미러로 들어온다」였는데 **IPL 은 아니다** — 병영수첩에서 오고
 * `origin='nexon_barracks'` 다 (`jobs/iplProject.ts`). 박아 둔 값 때문에
 * IPL 을 목록에 넣어도 경기가 **0건으로** 보였다.
 */
export const SYNC_FRESHNESS_ORIGINS: Record<string, readonly string[]> = {
  supply: ['3rd.supply'],
  sanply: ['3rd.supply'],
  daerule: ['3rd.supply'],
  nolink: ['nexon_barracks'],
}
/** 표에 없는 리그. 지금까지의 전제를 그대로 둔다 */
export const SYNC_FRESHNESS_FALLBACK_ORIGINS: readonly string[] = ['3rd.supply']

/**
 * **판정하지 않고 보여 주기만** 하는 리그.
 *
 * ── 왜 IPL 을 여기에 두나 (2026-09-01)
 *
 * 이 검사가 잡으려는 것은 **「우리 쪽 자동 수집이 멈춘 것」**이다. 그런데 IPL 에는
 * 자동 수집이 **없다.** 병영수첩은 Node 에서 부르면 403 이라 사람이 로그인한
 * 브라우저로만 받을 수 있고, 수집 워크플로의 `LEAGUES`(`supply,daerule,sanply`)에도
 * `nolink` 이 없다. 즉 IPL 은 **평소에도 며칠씩 낡아 있는 것이 정상**이다.
 *
 * 경기 간격은 쟀다 (2026-09-01 · 로컬 · 2026-06-30~08-30 · 구간 24,661개):
 * ```
 * 중앙 0.02h · p90 0.11h · 최대 9.93h · 6h 초과 37건 · 12h 초과 0건
 * 최근 8일만 보면  중앙 0.02h · p90 0.11h · p99 0.33h · 최대 7.13h
 * ```
 * 숫자만 보면 `sanply` 와 같은 **12h** 가 나온다. **그런데 그 값을 걸면 안 된다** —
 * 원본이 조용해서가 아니라 **사람이 아직 안 받아서** 빨개지고, 그러면 알람이 무뎌진다.
 * 그것은 D-224 에서 이미 한 번 겪은 실패다.
 *
 * 그래서 **아무 판정도 하지 않고 마지막 경기·마지막 적재 시각만 보여 준다.**
 * IPL 에 자동 경로가 생기는 날 이 집합에서 빼고 위 실측값으로 임계값을 걸면 된다.
 */
export const SYNC_FRESHNESS_REPORT_ONLY: ReadonlySet<string> = new Set(['nolink'])

export interface SyncFreshnessRow {
  league: string
  found: boolean
  newestStartAt: Date | null
  newestIngestedAt: Date | null
  ageHours: number | null
  maxAgeHours: number
  pass: boolean
  /** 판정하지 않고 보여 주기만 하는 리그인가 (`SYNC_FRESHNESS_REPORT_ONLY`) */
  reportOnly: boolean
  /** 이 리그를 어느 origin 으로 봤는가 — 0건일 때 원인을 가릴 수 있게 남긴다 */
  origins: readonly string[]
}

export async function checkSyncFreshness(input: {
  leagues: readonly string[]
  now?: Date
  maxAgeHours?: Record<string, number>
}): Promise<SyncFreshnessRow[]> {
  const now = input.now ?? new Date()
  const rows: SyncFreshnessRow[] = []

  for (const slug of input.leagues) {
    const maxAgeHours =
      input.maxAgeHours?.[slug] ??
      SYNC_FRESHNESS_DEFAULT_MAX_AGE_HOURS[slug] ??
      SYNC_FRESHNESS_FALLBACK_MAX_AGE_HOURS
    const origins = SYNC_FRESHNESS_ORIGINS[slug] ?? SYNC_FRESHNESS_FALLBACK_ORIGINS
    const reportOnly = SYNC_FRESHNESS_REPORT_ONLY.has(slug)

    const league = await prisma.league.findUnique({ where: { slug }, select: { id: true } })
    if (league === null) {
      /* 리그가 없으면 **통과시키지 않는다.** 오타 하나로 알람이 조용해지면 안 된다.
         보여 주기만 하는 리그라도 마찬가지다 — 이름이 틀린 것은 표시의 문제가 아니다 */
      rows.push({
        league: slug,
        found: false,
        newestStartAt: null,
        newestIngestedAt: null,
        ageHours: null,
        maxAgeHours,
        pass: false,
        reportOnly,
        origins,
      })
      continue
    }

    const where = { leagueId: league.id, origin: { in: [...origins] } }
    const [byStart, byIngest] = await Promise.all([
      prisma.match.findFirst({ where, orderBy: { startAt: 'desc' }, select: { startAt: true } }),
      prisma.match.findFirst({
        where,
        orderBy: { ingestedAt: 'desc' },
        select: { ingestedAt: true },
      }),
    ])
    const newestStartAt = byStart?.startAt ?? null
    const ageHours =
      newestStartAt === null ? null : (now.getTime() - newestStartAt.getTime()) / 3_600_000

    rows.push({
      league: slug,
      found: true,
      newestStartAt,
      newestIngestedAt: byIngest?.ingestedAt ?? null,
      ageHours,
      maxAgeHours,
      /* 경기가 한 건도 없으면 판정하지 않는다 — 아직 안 받은 리그가 있다.
         `reportOnly` 리그는 값이 있어도 판정하지 않는다 — 자동 수집이 없어서 낡아 있는 것이
         정상이다. **무뎌진 알람보다 판정 없는 표시가 낫다** (D-224 의 교훈) */
      pass: reportOnly || ageHours === null ? true : ageHours <= maxAgeHours,
      reportOnly,
      origins,
    })
  }

  return rows
}

const KST = (at: Date | null): string =>
  at === null
    ? '—'
    : new Date(at.getTime() + 9 * 3_600_000).toISOString().replace('T', ' ').slice(0, 19) + ' KST'

export function formatSyncFreshness(rows: readonly SyncFreshnessRow[]): string {
  const lines = ['리그       최신 경기(startAt)          마지막 적재(ingestedAt)      경과      임계    판정']
  for (const row of rows) {
    if (!row.found) {
      lines.push(`${row.league.padEnd(10)} 리그를 찾지 못했다`)
      continue
    }
    const age = row.ageHours === null ? '—' : `${row.ageHours.toFixed(1)}h`
    /* 판정하지 않는 리그는 임계값 자리도 비운다 — 안 쓰는 숫자를 보여 주면 쓰는 줄 안다 */
    const limit = row.reportOnly ? '—' : String(row.maxAgeHours) + 'h'
    lines.push(
      `${row.league.padEnd(10)} ${KST(row.newestStartAt).padEnd(27)} ${KST(row.newestIngestedAt).padEnd(27)} ` +
        `${age.padStart(7)}  ${limit}`.padEnd(8) +
        `  ${row.reportOnly ? '표시만' : row.pass ? 'ok' : '밀렸다'}`,
    )
  }
  return lines.join('\n')
}
