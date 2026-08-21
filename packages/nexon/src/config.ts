/**
 * 넥슨 Open API 수집 설정.
 *
 * **API 키는 이 파일 밖으로 나가지 않는다.**
 * 로그·오류 메시지·저장되는 요청 파라미터 어디에도 키를 넣지 않는다
 * (`docs/NEXON_INGEST_SPEC.md` 9장).
 */

/** 우리 쪽 출처 표기. `Match.origin` / `RawImport.source` 에 그대로 쓴다. */
export const NEXON_SOURCE = 'nexon'

/** 수집 파이프라인 버전. 원본을 다시 변환해야 할 때 세대를 구분한다. */
export const DEFAULT_MIGRATION_VERSION = 'nexon-v1'

/** 넥슨 스펙에 명시된 조회 가능 시작일 (2025-01-24). 그 이전 데이터는 존재하지 않는다. */
export const NEXON_DATA_AVAILABLE_FROM = '2025-01-24T00:00:00Z'

export interface NexonConfig {
  baseUrl: string
  /** 없으면 실제 호출을 할 수 없다. `--dry-run`은 키 없이 돌아간다. */
  apiKey: string | null
  /**
   * 초당 요청 수. **넥슨이 공개한 한도 수치가 없어 추측하지 않는다.**
   * 보수적인 값에서 시작하고 429를 받으면 스스로 감속한다.
   */
  requestsPerSecond: number
  /** 일시 오류(5xx·네트워크·타임아웃)에 한한 최대 재시도 횟수 */
  maxRetries: number
  requestTimeoutMs: number
  /**
   * 신선도 정책(일). 넥슨 이용 조건의 "최소 30일마다 갱신"이 기본값이다.
   * 적용 범위가 완전히 검증되지 않았으므로 **코드에 고정하지 않고 설정으로 둔다**
   * (`docs/NEXON_INGEST_SPEC.md` 6장).
   */
  refreshIntervalDays: number
  migrationVersion: string
  /** 우리가 누구인지 밝힌다. 브라우저인 척하지 않는다. */
  userAgent: string
}

export const DEFAULT_CONFIG: Omit<NexonConfig, 'apiKey'> = {
  baseUrl: 'https://open.api.nexon.com',
  requestsPerSecond: 2,
  maxRetries: 3,
  requestTimeoutMs: 20_000,
  refreshIntervalDays: 30,
  migrationVersion: DEFAULT_MIGRATION_VERSION,
  userAgent: 'SACLOUD-ingest/1.0 (+https://github.com/sacloud; contact: sacloud@local.invalid)',
}

function positiveNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function nonNegativeInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  return Number.isInteger(value) && value >= 0 ? value : fallback
}

/**
 * 환경변수에서 설정을 읽는다.
 *
 * 읽은 키는 반환값의 `apiKey`에만 담기며, **어떤 로그에도 찍지 않는다.**
 */
export function readNexonConfig(env: Record<string, string | undefined> = process.env): NexonConfig {
  const apiKey = env.NEXON_API_KEY?.trim()
  return {
    baseUrl: env.NEXON_API_BASE_URL?.trim() || DEFAULT_CONFIG.baseUrl,
    apiKey: apiKey ? apiKey : null,
    requestsPerSecond: positiveNumber(
      env.NEXON_RATE_LIMIT_PER_SEC,
      DEFAULT_CONFIG.requestsPerSecond,
    ),
    maxRetries: nonNegativeInt(env.NEXON_MAX_RETRIES, DEFAULT_CONFIG.maxRetries),
    requestTimeoutMs: positiveNumber(
      env.NEXON_REQUEST_TIMEOUT_MS,
      DEFAULT_CONFIG.requestTimeoutMs,
    ),
    refreshIntervalDays: positiveNumber(
      env.NEXON_REFRESH_INTERVAL_DAYS,
      DEFAULT_CONFIG.refreshIntervalDays,
    ),
    migrationVersion: env.NEXON_MIGRATION_VERSION?.trim() || DEFAULT_CONFIG.migrationVersion,
    userAgent: env.NEXON_USER_AGENT?.trim() || DEFAULT_CONFIG.userAgent,
  }
}

/**
 * 문자열에서 비밀값을 지운다.
 *
 * 키가 실수로 URL·오류 메시지에 섞여도 밖으로 나가지 않게 하는 마지막 방어선이다.
 * 짧은 값(8자 미만)은 오탐이 커서 건너뛴다.
 */
export function redactSecrets(text: string, secrets: readonly (string | null | undefined)[]): string {
  let output = text
  for (const secret of secrets) {
    if (!secret || secret.length < 8) continue
    output = output.split(secret).join('[REDACTED]')
  }
  return output
}

/** 키가 없으면 실제 호출을 시도조차 하지 않는다. */
export function hasApiKey(config: NexonConfig): boolean {
  return config.apiKey !== null && config.apiKey.length > 0
}
