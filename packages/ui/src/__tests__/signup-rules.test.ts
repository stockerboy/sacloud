import { describe, expect, it } from 'vitest'
import {
  canSubmitSignup,
  isAllowedSignupEmail,
  validateSignupNickname,
  validateSignupPassword,
} from '../auth/signupRules'

describe('isAllowedSignupEmail — 네이버 메일만 (원본 관측)', () => {
  it('네이버 메일만 통과', () => {
    expect(isAllowedSignupEmail('tester@naver.com')).toBe(true)
    expect(isAllowedSignupEmail('TESTER@NAVER.COM')).toBe(true)
    expect(isAllowedSignupEmail('tester@gmail.com')).toBe(false)
    expect(isAllowedSignupEmail('tester@daum.net')).toBe(false)
  })

  it('형식이 아니면 통과하지 않는다', () => {
    expect(isAllowedSignupEmail('tester')).toBe(false)
    expect(isAllowedSignupEmail('')).toBe(false)
    expect(isAllowedSignupEmail('@naver.com')).toBe(true)
  })
})

describe('비밀번호 · 닉네임 경계값', () => {
  it('비밀번호는 8자 이상', () => {
    expect(validateSignupPassword('1234567')).not.toBeNull()
    expect(validateSignupPassword('12345678')).toBeNull()
  })

  it('닉네임은 2~16자', () => {
    expect(validateSignupNickname('가')).not.toBeNull()
    expect(validateSignupNickname('가나')).toBeNull()
    expect(validateSignupNickname('a'.repeat(16))).toBeNull()
    expect(validateSignupNickname('a'.repeat(17))).not.toBeNull()
    expect(validateSignupNickname('  가나  ')).toBeNull()
  })
})

describe('canSubmitSignup', () => {
  const base = {
    email: 'tester@naver.com',
    password: 'password1234',
    nickname: '테스터',
    agreed: true,
  }

  it('모두 채우면 제출 가능', () => {
    expect(canSubmitSignup(base)).toBe(true)
  })

  it('동의하지 않으면 제출 불가 (원본: 동의 필수)', () => {
    expect(canSubmitSignup({ ...base, agreed: false })).toBe(false)
  })

  it('네이버 메일이 아니면 제출 불가', () => {
    expect(canSubmitSignup({ ...base, email: 'tester@gmail.com' })).toBe(false)
  })
})
