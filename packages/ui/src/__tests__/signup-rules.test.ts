import { describe, expect, it } from 'vitest'
import {
  canSubmitSignup,
  isAllowedSignupEmail,
  validateSignupNickname,
  validateSignupPassword,
  validateSignupUsername,
} from '../auth/signupRules'

/*
 * ── ⚠ 2026-09-02 — 정책이 바뀌었다. 그리고 이 테스트가 진짜 버그를 잡았다
 *
 *   `SIGNUP_ALLOWED_EMAIL_DOMAINS` 가 `['naver.com']` 에서 `[]`(제한 없음)로 바뀌었는데
 *   화면 함수만 안 따라와서 **모든 메일이 거부되고 가입 버튼이 영영 안 켜지는** 상태였다.
 *   그때 이 테스트가 빨갛게 떠 있었고, 「남의 작업이라 스테일하다」고 넘길 뻔했다.
 *   **빨간 불이 옳았다.** 아래 기대값을 새 정책으로 옮기되, 그 사건을 여기 남긴다.
 *
 *   옛 정책(네이버 전용)으로 돌아가려면 계약의 배열에 `'naver.com'` 을 다시 넣는다.
 *   그때는 아래 `LEGACY` 블록의 기대값이 맞는 값이 된다 (`CLAUDE.md` 10-4).
 */
describe('isAllowedSignupEmail — 지금 정책: 도메인 제한 없음', () => {
  it('목록이 비어 있으면 어떤 도메인이든 통과한다', () => {
    expect(isAllowedSignupEmail('tester@naver.com')).toBe(true)
    expect(isAllowedSignupEmail('TESTER@NAVER.COM')).toBe(true)
    expect(isAllowedSignupEmail('tester@gmail.com')).toBe(true)
    expect(isAllowedSignupEmail('tester@daum.net')).toBe(true)
  })

  it('서버와 뜻이 같아야 한다 — 빈 목록 = 제한 없음', () => {
    /* apps/web/lib/server/queries/auth.ts 의 `if (allowed.length === 0) return true`
       와 같은 뜻이다. 두 곳이 갈리면 「버튼은 눌리는데 서버가 거부」하거나 그 반대가 된다.
       그 어긋남이 실제로 있었고 배포 전에 잡았다. */
    expect(isAllowedSignupEmail('anything@example.org')).toBe(true)
  })
})

describe.skip('LEGACY — 네이버 전용 정책이었을 때 (계약 배열에 naver.com 이 있을 때만 맞다)', () => {
  it('네이버 메일만 통과', () => {
    expect(isAllowedSignupEmail('tester@naver.com')).toBe(true)
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
    /* ★2026-09-02 (O-023) — `username` 을 넣었다★
       D-252 로 가입 키가 이메일에서 아이디로 바뀌었는데 이 `base` 가 안 따라왔다.
       그래서 **화면이 `username` 을 안 보내는 것을 테스트가 못 잡았고**,
       운영에서 가입이 통째로 막혀 있었다 (누가 무엇을 넣어도 400). */
    username: 'tester01',
    email: 'tester@naver.com',
    password: 'password1234',
    nickname: '테스터',
    agreed: true,
  }

  it('모두 채우면 제출 가능', () => {
    expect(canSubmitSignup(base)).toBe(true)
  })

  it('★아이디가 비면 제출 불가★ — 이게 없어서 가입이 통째로 막혔었다', () => {
    expect(canSubmitSignup({ ...base, username: '' })).toBe(false)
  })

  it('아이디가 규칙에 안 맞으면 제출 불가', () => {
    expect(canSubmitSignup({ ...base, username: 'ab' })).toBe(false) // 4자 미만
    expect(canSubmitSignup({ ...base, username: '1abc' })).toBe(false) // 영문으로 시작해야 한다
    expect(canSubmitSignup({ ...base, username: '한글아이디' })).toBe(false)
  })

  it('★이메일은 선택이다 — 비워도 제출 가능★ (D-252)', () => {
    expect(canSubmitSignup({ ...base, email: '' })).toBe(true)
    expect(canSubmitSignup({ ...base, email: '   ' })).toBe(true)
  })

  it('동의하지 않으면 제출 불가 (원본: 동의 필수)', () => {
    expect(canSubmitSignup({ ...base, agreed: false })).toBe(false)
  })

  it('도메인 제한이 없으므로 네이버가 아니어도 제출 가능 (2026-09-02 정책)', () => {
    /* 옛 정책(네이버 전용)에서는 이 값이 false 였다. 계약 배열에 'naver.com' 을
       되돌려 넣으면 다시 false 가 된다 — 위 LEGACY 블록 참조 */
    expect(canSubmitSignup({ ...base, email: 'tester@gmail.com' })).toBe(true)
  })

  /*
   * ⚠ [미확인] — 도메인 제한을 풀면서 **형식 검사도 같이 사라졌다.**
   *   목록이 비면 `isAllowedSignupEmail` 이 무조건 `true` 라, `'tester'` 처럼
   *   `@` 가 없는 값도 버튼을 켠다. 아래가 그 실제 동작이다 (바라는 동작이 아니라).
   *
   *   지금 실제 피해는 없다 — 입력칸이 `type="email"` 이라 브라우저가 막고,
   *   서버는 계약(`SignupInput`)의 Zod 가 거른다. 그래서 **잘못된 가입은 안 된다.**
   *   다만 「버튼은 켜지는데 눌러도 서버가 거절」하는 모양이라 안내가 불친절하다.
   *   형식 검사를 화면에도 둘지는 정해지지 않았다. 정해지면 이 기대값이 바뀐다.
   */
  it('[미확인] 형식이 아닌 값도 지금은 버튼을 켠다 — 서버·브라우저가 막는다', () => {
    expect(canSubmitSignup({ ...base, email: 'tester' })).toBe(true)
    expect(canSubmitSignup({ ...base, email: '' })).toBe(true)
  })
})

/**
 * 아이디 규칙 — **계약(`Username`)에서 그대로 온다** (O-023 · 2026-09-02).
 *
 * 화면이 규칙을 따로 적으면 서버와 갈린다. 이메일 도메인에서 실제로 그 일이 났다
 * (목록이 비었을 때의 뜻이 서버와 반대라 버튼이 영영 안 켜졌다).
 * 그래서 이 함수는 계약을 돌리기만 하고, 이 테스트는 **그 문구까지** 고정한다.
 */
describe('validateSignupUsername', () => {
  it('영문으로 시작하는 4~16자 영문·숫자·밑줄이면 통과', () => {
    expect(validateSignupUsername('tester01')).toBeNull()
    expect(validateSignupUsername('a_b_c1')).toBeNull()
    expect(validateSignupUsername('abcd')).toBeNull()
    expect(validateSignupUsername('a'.repeat(16))).toBeNull()
  })

  it('짧거나 길거나 영문으로 시작하지 않으면 막는다', () => {
    expect(validateSignupUsername('abc')).not.toBeNull()
    expect(validateSignupUsername('a'.repeat(17))).not.toBeNull()
    expect(validateSignupUsername('1abcd')).not.toBeNull()
    expect(validateSignupUsername('_abcd')).not.toBeNull()
    expect(validateSignupUsername('한글아이디')).not.toBeNull()
    expect(validateSignupUsername('has space')).not.toBeNull()
    expect(validateSignupUsername('')).not.toBeNull()
  })

  it('문구가 서버와 같다 — 화면이 규칙을 새로 적지 않는다', () => {
    expect(validateSignupUsername('ab')).toBe(
      '아이디는 영문으로 시작하는 4~16자의 영문·숫자·밑줄이어야 합니다',
    )
  })
})
