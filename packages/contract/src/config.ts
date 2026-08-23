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

/**
 * API 모드.
 *
 * **기본값은 `live`다.** 예전에는 기본이 `mock`이라, 배포에서 `NEXT_PUBLIC_API_MODE`를
 * 빠뜨리면 공개 사이트 전체가 MSW 픽스처로 동작했다(그리고 개발용 역할 전환 위젯까지
 * 같이 떴다). `NEXT_PUBLIC_*`은 빌드 시점에 인라인되므로 사고를 되돌리려면 재빌드가
 * 필요하다. 안전한 쪽으로 실패하도록 뒤집었다 — mock은 **명시적으로 켤 때만** 쓴다 (D-116).
 */
export function resolveApiMode(env?: Record<string, string | undefined>): ApiMode {
  return env?.['NEXT_PUBLIC_API_MODE'] === 'mock' ? 'mock' : 'live'
}
