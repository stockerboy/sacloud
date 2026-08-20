/**
 * 개발용 세션 전환.
 *
 * 원본에는 없는 **개발 편의 장치**다 (Phase 6 계획 5항).
 * Mock 단계에서는 실제 로그인이 없으므로, 화면을 역할별로 확인하려면
 * "지금 누구로 보고 있는지"를 바꿀 수단이 필요하다.
 *
 * 실제 인증(Auth.js)은 Phase 7 이후에 붙이며, 그 시점에 이 모듈은 사라진다.
 * MSW 핸들러는 페이지 컨텍스트에서 돌기 때문에 `localStorage`를 그대로 쓸 수 있다.
 */

export type MockRole =
  /** 비로그인 */
  | 'guest'
  /** 일반 회원 (서든어택 계정 연동됨) */
  | 'user'
  /** 리그 관리자 */
  | 'leagueAdmin'

export const MOCK_ROLES: readonly MockRole[] = ['guest', 'user', 'leagueAdmin']

export const MOCK_ROLE_LABEL: Record<MockRole, string> = {
  guest: '비로그인',
  user: '일반 회원',
  leagueAdmin: '리그 관리자',
}

const STORAGE_KEY = 'sacloud.mock.role'

let current: MockRole = 'guest'

/** 브라우저면 localStorage 값을 우선한다 (새로고침해도 유지) */
function readStored(): MockRole | null {
  if (typeof localStorage === 'undefined') return null
  const value = localStorage.getItem(STORAGE_KEY)
  return value && (MOCK_ROLES as readonly string[]).includes(value) ? (value as MockRole) : null
}

export function getMockRole(): MockRole {
  return readStored() ?? current
}

export function setMockRole(role: MockRole): void {
  current = role
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, role)
}

export function isLoggedIn(): boolean {
  return getMockRole() !== 'guest'
}
