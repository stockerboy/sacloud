/**
 * **Mock 전용** API base URL.
 *
 * MSW 가 가로채는 가짜 주소다. 실제로 존재하지 않는 도메인이라
 * **live 모드에서 이 값이 쓰이면 화면이 통째로 죽는다.**
 * `packages/mock` 과 그 테스트만 이 값을 직접 쓴다.
 */
export const DEFAULT_API_BASE_URL = 'https://api.sacloud.local'

/**
 * live 모드 기본값 — **같은 오리진**.
 *
 * API 라우트가 웹앱과 같은 도메인에 있으므로 상대 경로면 충분하고,
 * `next.config.ts` 의 CSP `connect-src 'self'` 와도 맞는다.
 */
export const SAME_ORIGIN_API_BASE_URL = '/api'

export type ApiMode = 'mock' | 'live'

/**
 * API base URL 을 정한다.
 *
 * **환경변수가 없을 때 Mock 주소로 떨어지면 안 된다.** 예전에는 그랬고,
 * 그래서 운영 배포에서 브라우저가 `https://api.sacloud.local` 로 요청을 보내
 * 서버 API 는 멀쩡한데 화면만 "불러오지 못했습니다" 로 죽었다 (2026-08-27 · D-151).
 * `NEXT_PUBLIC_*` 은 빌드 시점에 인라인되므로 되돌리려면 재빌드가 필요하다.
 *
 * D-116 에서 `resolveApiMode` 에 적용한 것과 같은 원칙이다 —
 * **안전한 쪽으로 실패한다.** Mock 주소는 mock 모드에서만 쓴다.
 *
 * 빈 문자열도 미설정으로 본다. 환경변수를 만들어 두고 값을 비우는 실수가 잦다.
 */
export function resolveApiBaseUrl(env?: Record<string, string | undefined>): string {
  const explicit = env?.['NEXT_PUBLIC_API_BASE_URL']
  if (explicit) return explicit
  return resolveApiMode(env) === 'mock' ? DEFAULT_API_BASE_URL : SAME_ORIGIN_API_BASE_URL
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
