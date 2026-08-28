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
    /** 마지막으로 수집 잡이 성공한 시각 */
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

/** 수집이 멈춘 것으로 보는 기준 (시간). 넘으면 degraded */
const COLLECTOR_STALE_HOURS = 48

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
  try {
    counts = await readCounts(since)
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

  let collector: HealthCheck
  if (ageHours === null) {
    collector = { status: 'degraded', detail: '성공한 수집 기록이 없다' }
  } else if (ageHours > COLLECTOR_STALE_HOURS) {
    collector = {
      status: 'degraded',
      detail: `마지막 수집 성공이 ${ageHours}시간 전이다 (기준 ${COLLECTOR_STALE_HOURS}시간)`,
    }
  } else if (rateLimited > 0) {
    collector = { status: 'degraded', detail: '최근 24시간 안에 넥슨 호출 한도에 걸렸다' }
  } else if (detailFailureRate24h > 0.5) {
    collector = {
      status: 'degraded',
      detail: `최근 24시간 상세 실패율이 ${Math.round(detailFailureRate24h * 100)}%다`,
    }
  } else {
    collector = { status: 'ok', detail: `마지막 수집 성공 ${ageHours}시간 전` }
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
