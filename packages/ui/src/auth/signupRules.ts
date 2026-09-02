import { SIGNUP_ALLOWED_EMAIL_DOMAINS, Username } from '@sacloud/contract'

/**
 * 회원가입 폼 제약.
 *
 * 원본 관측 (2026-08-21)
 * - 가입은 **네이버 메일로만** 가능하다 (placeholder `you@naver.com`, 안내 문구)
 * - 약관·개인정보 동의가 필수다
 * 비밀번호 8자 이상·닉네임 2~16자는 계약(`SignupInput`)에서 확정한 값이며
 * 원본의 실제 제약은 `[미확인]`이다.
 */

/**
 * 가입 가능한 메일인가.
 *
 * ── ⚠ 2026-09-02 정정 — **빈 목록의 뜻이 서버와 반대였다**
 *   네이버 전용 정책을 풀면서 `SIGNUP_ALLOWED_EMAIL_DOMAINS` 를 `[]` 로 비웠는데
 *   (뜻: **제한 없음**), 이 함수는 그대로 `includes` 를 불러서 **모든 메일을 거부**했다.
 *   `signup/page.tsx` 의 `canSubmit` 이 이 값을 쓰므로 **가입 버튼이 영영 안 켜졌다.**
 *   운영에 나가기 전에 잡았다.
 *
 *   서버(`apps/web/lib/server/queries/auth.ts:52`)는 이미 옳게 적혀 있었다 —
 *   `if (allowed.length === 0) return true`. **화면이 서버와 같은 뜻이어야 한다.**
 *   두 곳이 갈리면 「버튼은 눌리는데 서버가 거부」하거나 그 반대가 된다.
 *
 * 목록에 값이 있으면 그 도메인만 통과한다 — 옛 네이버 전용 정책으로 돌아가려면
 * 계약의 배열에 `'naver.com'` 을 다시 넣으면 된다 (`CLAUDE.md` 10-4).
 */
export function isAllowedSignupEmail(email: string): boolean {
  const allowed = SIGNUP_ALLOWED_EMAIL_DOMAINS as readonly string[]
  if (allowed.length === 0) return true // 제한 없음 (기본)
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  return allowed.includes(domain)
}

/**
 * 아이디 검증 — **규칙을 여기에 새로 적지 않는다** (O-023 · 2026-09-02).
 *
 * 계약의 `Username` 을 그대로 돌려서 그 문구까지 받아 쓴다. 화면이 규칙을 따로
 * 적으면 서버와 갈리고, 그러면 「버튼은 눌리는데 서버가 거부」하거나 그 반대가 된다 —
 * 이메일 도메인에서 실제로 그 일이 났다(위 주석의 2026-09-02 정정).
 *
 * ⚠ 이 함수가 없어서 **가입이 통째로 막혀 있었다.** 2026-09-01(D-252)에 가입을
 *   「이메일」에서 「아이디」로 바꿨는데 화면이 안 따라왔다 — 아이디 칸도 없었고
 *   `username` 을 보내지도 않았다. 서버는 그 값을 필수로 받으므로 **누가 무엇을
 *   넣어도 400 이었다.** 운영에서 확인했다 (2026-09-02).
 */
export function validateSignupUsername(username: string): string | null {
  const result = Username.safeParse(username)
  return result.success ? null : (result.error.issues[0]?.message ?? '아이디를 확인해주세요')
}

export function validateSignupPassword(password: string): string | null {
  return password.length >= 8 ? null : '비밀번호는 8자 이상이어야 합니다.'
}

export function validateSignupNickname(nickname: string): string | null {
  const value = nickname.trim()
  return value.length >= 2 && value.length <= 16 ? null : '닉네임은 2~16자여야 합니다.'
}

export interface SignupDraft {
  /** 로그인 아이디 — **필수다** (D-252). 이메일이 아니라 이게 아이디다 */
  username: string
  password: string
  nickname: string
  /** ⚠ **선택 입력이다** (D-252). 비워도 가입된다 */
  email: string
  agreed: boolean
}

/** 폼 전체가 제출 가능한지 */
export function canSubmitSignup(draft: SignupDraft): boolean {
  return (
    validateSignupUsername(draft.username) === null &&
    validateSignupPassword(draft.password) === null &&
    validateSignupNickname(draft.nickname) === null &&
    /* 이메일은 **선택**이다 — 비었으면 검사하지 않는다. 넣었을 때만 도메인을 본다.
       그전에는 빈 이메일이 `isAllowedSignupEmail('')` 로 들어가 버튼을 막을 수 있었다 */
    (draft.email.trim() === '' || isAllowedSignupEmail(draft.email)) &&
    draft.agreed
  )
}
