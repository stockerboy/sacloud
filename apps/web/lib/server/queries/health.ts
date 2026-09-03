/**
 * 운영 상태 점검 (D-137).
 *
 * ── 왜 필요한가
 *   원본 서플라이는 넥슨 패치 뒤 며칠씩 전적 갱신이 밀리곤 했다.
 *   수집이 멈춘 것을 **사람이 눈치채기 전에** 알 수 있어야 한다.
 *
 * ── 무엇을 보는가
 *   db                 실제 쿼리가 도는가
 *   collector          마지막 성공 시각 · 최근 24시간 신규 경기 · 실패율 · 429
 *   pendingBackfill    아직 못 채운 것이 얼마나 있는가
 *   data               공개 화면이 비어 보이지 않을 최소 조건
 *
 * ── 공개해도 되는 것만 담는다
 *   API 키·DSN·ouid·이메일 같은 건 **하나도 내보내지 않는다.**
 *   숫자와 시각, 그리고 판정 결과만 담는다. 그래서 인증 없이 열어도 된다.
 */
import { COLLECTED_LEAGUE_SLUGS, freshnessMaxAgeHours } from '@sacloud/contract'
import { prisma } from '@sacloud/db'

export type HealthStatus = 'ok' | 'degraded' | 'down'

export interface HealthCheck {
  status: HealthStatus
  /** 사람이 읽는 한 줄. 값 자체는 담지 않는다 */
  detail: string
}

export interface HealthReport {
  status: HealthStatus
  checkedAt: string
  checks: {
    db: HealthCheck
    collector: HealthCheck
    data: HealthCheck
  }
  metrics: {
    /**
     * ★수집이 도는 리그마다 「가장 최근 경기」가 얼마나 낡았나★
     * `checks.collector` 는 **이것**으로 판정한다 (2026-09-03).
     */
    leagueFreshness: LeagueFreshness[]
    /**
     * 마지막으로 **넥슨** 수집 잡이 성공한 시각.
     *
     * ⚠ ★이 값으로 판정하지 않는다.★ 넥슨은 할당량 때문에 세워 둔 상태라
     *   계속 낡아 있다. **세워 둔 것을 고장이라 부르면 알람이 무뎌진다.**
     *   숫자는 보이게 남긴다 — 넥슨을 다시 켤 때 여기를 본다.
     */
    collectorLastSuccessAt: string | null
    collectorLastSuccessAgeHours: number | null
    /** 최근 24시간 안에 새로 들어온 스테이징 경기 */
    stagedLast24h: number
    /** 최근 24시간 상세 조회 실패율 (0~1) */
    detailFailureRate24h: number
    /** 최근 24시간 안에 429를 본 적이 있는가 */
    rateLimitedLast24h: boolean
    /** 상세를 아직 못 받은 스테이징 경기 */
    pendingDetail: number
    /** 아직 운영 경기로 투영되지 않은 스테이징 경기 */
    pendingProjection: number
    /** 사람이 정해 주지 않은 신원 */
    unresolvedIdentities: number
    /** 공개 리그 · 클랜 · 선수 · 경기 */
    publicLeagues: number
    publicClans: number
    publicPlayers: number
    publicMatches: number
  }
}

/** 셋 중 가장 나쁜 상태가 전체 상태다 */
function worst(statuses: readonly HealthStatus[]): HealthStatus {
  if (statuses.includes('down')) return 'down'
  if (statuses.includes('degraded')) return 'degraded'
  return 'ok'
}

/*
 * ⚠ ★여기 `COLLECTOR_STALE_HOURS = 48` 이 있었다. 지웠다★ (2026-09-03).
 *   그 값은 **넥슨** 마지막 성공 시각에 대는 자였는데, 넥슨은 할당량 때문에
 *   ★일부러 세워 둔 것★ 이라 언제나 48시간을 넘는다. 그래서 이 칸이 240시간째
 *   노랑에 고정이었고, ★이미 노랑이라 진짜 문제가 나도 안 바뀌었다.★
 *   지금은 리그별 임계값(`@sacloud/contract` 의 `collectFreshness`)으로 판정한다 —
 *   하나로 묶으면 오경보가 난다는 것을 D-224 에서 이미 겪었다.
 */

/** DB가 응답하지 않을 때의 보고서. 숫자는 전부 0이고 판정은 down이다 */
function downReport(now: Date): HealthReport {
  return {
    status: 'down',
    checkedAt: now.toISOString(),
    checks: {
      db: { status: 'down', detail: 'DB에 질의할 수 없다' },
      collector: { status: 'down', detail: 'DB가 없어 확인할 수 없다' },
      data: { status: 'down', detail: 'DB가 없어 확인할 수 없다' },
    },
    metrics: {
      /* DB 를 못 읽었으니 신선도도 모른다. 빈 배열이지 「최신」이 아니다 */
      leagueFreshness: [],
      collectorLastSuccessAt: null,
      collectorLastSuccessAgeHours: null,
      stagedLast24h: 0,
      detailFailureRate24h: 0,
      rateLimitedLast24h: false,
      pendingDetail: 0,
      pendingProjection: 0,
      unresolvedIdentities: 0,
      publicLeagues: 0,
      publicClans: 0,
      publicPlayers: 0,
      publicMatches: 0,
    },
  }
}

/**
 * 상태 점검이 보는 수치 전부. **한 번의 왕복으로 읽는다.**
 *
 * 예전에는 `count()` 를 12번 따로 던졌다. 로컬에서는 각 1~3ms 라 티가 안 났지만
 * 서버리스 + 풀러(pgbouncer, `connection_limit=1`) 환경에서는 커넥션 하나에 12번이
 * **직렬로** 줄을 서고 매 건마다 왕복 지연이 붙는다. 운영에서 이 엔드포인트가
 * 유난히 느렸던 이유다.
 *
 * 각 스칼라 서브쿼리는 원래 Prisma 조건과 1:1로 대응한다 —
 * `origin != 'mock'`(D-116 공개 범위) · `status='done'` 최신 시각 · 24시간 창.
 * `::int` 로 캐스팅하는 것은 Postgres `count(*)` 가 bigint 라서다(JS에서 BigInt가 된다).
 */
/** 리그 하나의 신선도 — `checks.collector` 가 이것으로 판정한다 */
export interface LeagueFreshness {
  league: string
  newestStartAt: string | null
  ageHours: number | null
  maxAgeHours: number
}

interface HealthCounts {
  last_success: Date | null
  detail_total: number
  detail_failed: number
  rate_limited: number
  staged_24h: number
  pending_detail: number
  pending_projection: number
  unresolved_identities: number
  public_leagues: number
  public_clans: number
  public_players: number
  public_matches: number
}

/**
 * ★수집이 도는 리그마다 「가장 최근 경기」가 얼마나 낡았나★ (2026-09-03).
 *
 * ══ 왜 이걸 새로 읽나 ══
 *
 * 이 파일의 「수집기」 판정은 `ImportJob`(넥슨 파이프라인)만 보고 있었다.
 * 그런데 **지금 새 경기를 넣는 것은 3rd.supply 미러**다 (`supply-mirror`·`supply-import`).
 * 넥슨 쪽은 할당량 때문에 2026-08-24 부터 **일부러 세워 뒀다.**
 *
 * ```
 * 그래서 무슨 일이 났나
 *   health 가 240시간째 ★노랑에 고정★ 이었다
 *   이미 노랑이라 ★나빠져도 안 바뀌었다★
 *   그 뒤에서 `sanply` 적재가 ★열흘 동안 빨간 줄★ 이었는데 아무도 몰랐다
 * ```
 * ★자를 잘못 댄 알람이 없는 알람보다 나빴다.★
 *
 * 임계값은 `@sacloud/contract` 에 있다 — **워커의 `sync-freshness` 와 같은 자**다.
 * 한쪽만 고치면 또 갈라진다.
 */
async function readLeagueFreshness(now: Date): Promise<LeagueFreshness[]> {
  const rows = await prisma.$queryRaw<{ slug: string; newest: Date | null }[]>`
    SELECT l."slug" AS slug, max(m."startAt") AS newest
      FROM "League" l
      LEFT JOIN "Match" m ON m."leagueId" = l."id"
     WHERE l."slug" = ANY(${[...COLLECTED_LEAGUE_SLUGS]})
     GROUP BY l."slug"
  `
  return rows.map((row) => ({
    league: row.slug,
    newestStartAt: row.newest ? row.newest.toISOString() : null,
    /* 경기가 한 건도 없으면 **판정하지 않는다** — 아직 안 받은 리그일 수 있다 */
    ageHours: row.newest
      ? Math.round(((now.getTime() - row.newest.getTime()) / 3_600_000) * 10) / 10
      : null,
    maxAgeHours: freshnessMaxAgeHours(row.slug),
  }))
}

async function readCounts(since: Date): Promise<HealthCounts> {
  const rows = await prisma.$queryRaw<HealthCounts[]>`
    SELECT
      (SELECT max("updatedAt") FROM "ImportJob" WHERE "status" = 'done') AS last_success,
      (SELECT count(*)::int FROM "ImportJob"
        WHERE "updatedAt" >= ${since} AND "jobKey" LIKE 'nexon:matchdetail:%') AS detail_total,
      (SELECT count(*)::int FROM "ImportJob"
        WHERE "updatedAt" >= ${since} AND "jobKey" LIKE 'nexon:matchdetail:%'
          AND "status" = 'failed') AS detail_failed,
      (SELECT count(*)::int FROM "ImportJob"
        WHERE "updatedAt" >= ${since} AND "lastError" LIKE '%429%') AS rate_limited,
      (SELECT count(*)::int FROM "NexonMatch" WHERE "createdAt" >= ${since}) AS staged_24h,
      (SELECT count(*)::int FROM "NexonMatch" WHERE "detailFetchedAt" IS NULL) AS pending_detail,
      (SELECT count(*)::int FROM "NexonMatch"
        WHERE "projectionStatus" IN ('pending', 'skipped')) AS pending_projection,
      (SELECT count(*)::int FROM "NexonIdentity" WHERE "status" = 'unresolved') AS unresolved_identities,
      (SELECT count(*)::int FROM "League" WHERE "origin" <> 'mock') AS public_leagues,
      (SELECT count(*)::int FROM "Clan" WHERE "origin" <> 'mock' AND "active") AS public_clans,
      (SELECT count(*)::int FROM "Player" WHERE "origin" <> 'mock') AS public_players,
      (SELECT count(*)::int FROM "Match" WHERE "origin" <> 'mock') AS public_matches
  `
  // 스칼라 서브쿼리만 있는 SELECT 는 항상 1행이다. 비면 DB가 정상이 아니라는 뜻이다
  const row = rows[0]
  if (!row) throw new Error('상태 점검 집계가 비었다')
  return row
}

export async function getHealth(now: Date = new Date()): Promise<HealthReport> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  /* --- DB ---
     따로 `SELECT 1` 을 던지지 않는다. 아래 집계 쿼리가 돌면 그것이 곧 DB 정상 확인이다 */
  const db: HealthCheck = { status: 'ok', detail: '쿼리 정상' }
  let counts: HealthCounts
  let leagueFreshness: LeagueFreshness[]
  try {
    /* 둘 다 읽기다. 하나라도 못 읽으면 DB 가 문제인 것이므로 통째로 down 이다 */
    ;[counts, leagueFreshness] = await Promise.all([readCounts(since), readLeagueFreshness(now)])
  } catch {
    return downReport(now)
  }

  /* --- 수집기 --- */
  const detailFailureRate24h =
    counts.detail_total === 0 ? 0 : counts.detail_failed / counts.detail_total
  const rateLimited = counts.rate_limited
  const stagedLast24h = counts.staged_24h
  const pendingDetail = counts.pending_detail
  const pendingProjection = counts.pending_projection
  const unresolvedIdentities = counts.unresolved_identities

  const lastSuccessAt = counts.last_success
  const ageHours = lastSuccessAt
    ? Math.round(((now.getTime() - lastSuccessAt.getTime()) / 3_600_000) * 10) / 10
    : null

  /*
   * ★「수집기」는 ★지금 도는 파이프라인★ 으로 판정한다★ (2026-09-03).
   *
   * 옛 판정은 `ImportJob`(넥슨) 하나만 봤다. 넥슨은 할당량 때문에 **일부러 세워 둔** 것이라
   * 240시간째 노랑이었고, ★이미 노랑이라 나빠져도 안 바뀌었다.★
   * 그 뒤에서 `sanply` 적재가 열흘 동안 실패하고 있었는데 이 칸은 아무 말도 안 했다.
   *
   * ```
   * 지금 판정하는 것   리그별 「가장 최근 경기」가 그 리그 임계값보다 낡았나
   *                   (supply 24h · sanply 12h · daerule 168h — 실측값)
   * 여전히 보는 것     넥슨 호출 한도 · 상세 실패율 — ★값은 그대로 metrics 에 남긴다★
   * 안 보는 것         넥슨 마지막 성공 시각. ★세워 둔 것을 고장이라 부르지 않는다★
   * ```
   * ⚠ `nolink`(IPL)는 사람 손으로 들어와서 판정에 안 넣는다 (`COLLECTED_LEAGUE_SLUGS`).
   */
  const stale = leagueFreshness.filter(
    (row) => row.ageHours !== null && row.ageHours > row.maxAgeHours,
  )

  let collector: HealthCheck
  if (leagueFreshness.every((row) => row.ageHours === null)) {
    collector = { status: 'degraded', detail: '수집 리그에 경기가 한 건도 없다' }
  } else if (stale.length > 0) {
    collector = {
      status: 'degraded',
      detail: stale
        .map((row) => `${row.league} 마지막 경기 ${row.ageHours}시간 전 (기준 ${row.maxAgeHours}시간)`)
        .join(' · '),
    }
  } else if (rateLimited > 0) {
    collector = { status: 'degraded', detail: '최근 24시간 안에 넥슨 호출 한도에 걸렸다' }
  } else if (detailFailureRate24h > 0.5) {
    collector = {
      status: 'degraded',
      detail: `최근 24시간 상세 실패율이 ${Math.round(detailFailureRate24h * 100)}%다`,
    }
  } else {
    /* 제일 낡은 리그를 적는다 — 「전부 최신」보다 ★숫자 하나★ 가 사람에게 쓸모 있다 */
    const worstRow = leagueFreshness
      .filter((row) => row.ageHours !== null)
      .sort((a, b) => b.ageHours! - a.ageHours!)[0]!
    collector = {
      status: 'ok',
      detail: `가장 낡은 리그 ${worstRow.league} ${worstRow.ageHours}시간 전 (기준 ${worstRow.maxAgeHours}시간)`,
    }
  }

  /* --- 공개 데이터가 비어 있지 않은가 --- */
  const publicLeagues = counts.public_leagues
  const publicClans = counts.public_clans
  const publicPlayers = counts.public_players
  const publicMatches = counts.public_matches

  const data: HealthCheck =
    publicLeagues === 0 || publicMatches === 0
      ? { status: 'down', detail: '공개할 리그 또는 경기가 없다' }
      : publicClans === 0 || publicPlayers === 0
        ? { status: 'degraded', detail: '공개 클랜 또는 선수가 비어 있다' }
        : { status: 'ok', detail: '공개 데이터 있음' }

  return {
    status: worst([db.status, collector.status, data.status]),
    checkedAt: now.toISOString(),
    checks: { db, collector, data },
    metrics: {
      /* ★리그별 신선도 — 「수집기」 칸이 이것으로 판정한다★ (2026-09-03) */
      leagueFreshness,
      collectorLastSuccessAt: lastSuccessAt?.toISOString() ?? null,
      collectorLastSuccessAgeHours: ageHours,
      stagedLast24h,
      detailFailureRate24h: Math.round(detailFailureRate24h * 1000) / 1000,
      rateLimitedLast24h: rateLimited > 0,
      pendingDetail,
      pendingProjection,
      unresolvedIdentities,
      publicLeagues,
      publicClans,
      publicPlayers,
      publicMatches,
    },
  }
}
