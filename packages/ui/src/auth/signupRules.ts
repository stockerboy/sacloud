import { SIGNUP_ALLOWED_EMAIL_DOMAINS } from '@sacloud/contract'

/**
 * 회원가입 폼 제약.
 *
 * 원본 관측 (2026-08-21)
 * - 가입은 **네이버 메일로만** 가능하다 (placeholder `you@naver.com`, 안내 문구)
 * - 약관·개인정보 동의가 필수다
 * 비밀번호 8자 이상·닉네임 2~16자는 계약(`SignupInput`)에서 확정한 값이며
 * 원본의 실제 제약은 `[미확인]`이다.
 */

export function isAllowedSignupEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  return (SIGNUP_ALLOWED_EMAIL_DOMAINS as readonly string[]).includes(domain)
}

export function validateSignupPassword(password: string): string | null {
  return password.length >= 8 ? null : '비밀번호는 8자 이상이어야 합니다.'
}

export function validateSignupNickname(nickname: string): string | null {
  const value = nickname.trim()
  return value.length >= 2 && value.length <= 16 ? null : '닉네임은 2~16자여야 합니다.'
}

export interface SignupDraft {
  email: string
  password: string
  nickname: string
  agreed: boolean
}

/** 폼 전체가 제출 가능한지 */
export function canSubmitSignup(draft: SignupDraft): boolean {
  return (
    isAllowedSignupEmail(draft.email) &&
    validateSignupPassword(draft.password) === null &&
    validateSignupNickname(draft.nickname) === null &&
    draft.agreed
  )
}
