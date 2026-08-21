/**
 * 파생값 계산 규칙은 `@sacloud/contract`로 옮겼다 (Phase 7).
 *
 * 이유: Mock 서버와 실제 서버가 **같은 규칙**을 써야 응답이 일치한다.
 * 계약 패키지가 두 구현의 공통 상위이므로 규칙도 거기 둔다.
 * 기존 import 경로(`@sacloud/mock`)를 깨지 않으려고 여기서 다시 내보낸다.
 */
export { winRate, kdRate, killPerMatch, percentOf } from '@sacloud/contract'
