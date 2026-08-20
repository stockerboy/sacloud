/**
 * API base URL.
 * 실제 배포 도메인은 아직 정해지지 않았다 [미확인].
 * Phase 0~6에서는 MSW가 이 주소를 가로채므로 값 자체는 의미가 없고,
 * Phase 7에서 실제 서버 주소로 교체한다.
 */
export const DEFAULT_API_BASE_URL = 'https://api.sacloud.local'

export type ApiMode = 'mock' | 'live'

export function resolveApiBaseUrl(env?: Record<string, string | undefined>): string {
  return env?.['NEXT_PUBLIC_API_BASE_URL'] ?? DEFAULT_API_BASE_URL
}

export function resolveApiMode(env?: Record<string, string | undefined>): ApiMode {
  return env?.['NEXT_PUBLIC_API_MODE'] === 'live' ? 'live' : 'mock'
}
