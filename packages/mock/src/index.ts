/**
 * 이 진입점은 `./handlers`(msw)와 `./dataset`(픽스처 생성)을 함께 끌어온다.
 * **클라이언트 컴포넌트에서 이 진입점을 import 하지 말 것.**
 * 번들에 픽스처 생성 코드가 통째로 들어가 하이드레이션이 막힌다(실제로 겪음).
 * 세션 스위치만 필요하면 `@sacloud/mock/session` 을 쓴다.
 */
export * from './types'
export * from './rng'
export * from './derive'
export * from './dataset'
export * from './handlers'
export * as mockStore from './store'
export {
  getMockRole,
  setMockRole,
  isLoggedIn,
  MOCK_ROLES,
  MOCK_ROLE_LABEL,
  type MockRole,
} from './session'
