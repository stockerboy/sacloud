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

export async function getHealth(now: Date = new Date()): Promise<HealthReport> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  /* --- DB --- */
  let db: HealthCheck = { status: 'ok', detail: '쿼리 정상' }
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    db = { status: 'down', detail: 'DB에 질의할 수 없다' }
    return {
      status: 'down',
      checkedAt: now.toISOString(),
      checks: {
        db,
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

  /* --- 수집기 --- */
  const lastSuccess = await prisma.importJob.findFirst({
    where: { status: 'done' },
    orderBy: { updatedAt: 'desc' },
    select: { updatedAt: true },
  })
  const recentJobs = await prisma.importJob.findMany({
    where: { updatedAt: { gte: since }, jobKey: { startsWith: 'nexon:matchdetail:' } },
    select: { status: true, lastError: true },
  })
  const failed = recentJobs.filter((job) => job.status === 'failed').length
  const detailFailureRate24h = recentJobs.length === 0 ? 0 : failed / recentJobs.length
  const rateLimited = await prisma.importJob.count({
    where: { updatedAt: { gte: since }, lastError: { contains: '429' } },
  })

  const stagedLast24h = await prisma.nexonMatch.count({ where: { createdAt: { gte: since } } })
  const pendingDetail = await prisma.nexonMatch.count({ where: { detailFetchedAt: null } })
  const pendingProjection = await prisma.nexonMatch.count({
    where: { projectionStatus: { in: ['pending', 'skipped'] } },
  })
  const unresolvedIdentities = await prisma.nexonIdentity.count({
    where: { status: 'unresolved' },
  })

  const ageHours = lastSuccess
    ? Math.round(((now.getTime() - lastSuccess.updatedAt.getTime()) / 3_600_000) * 10) / 10
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
  const publicOrigin = { origin: { not: 'mock' } } as const
  const [publicLeagues, publicClans, publicPlayers, publicMatches] = await Promise.all([
    prisma.league.count({ where: publicOrigin }),
    prisma.clan.count({ where: { ...publicOrigin, active: true } }),
    prisma.player.count({ where: publicOrigin }),
    prisma.match.count({ where: publicOrigin }),
  ])

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
      collectorLastSuccessAt: lastSuccess?.updatedAt.toISOString() ?? null,
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
