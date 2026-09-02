import { describe, expect, it } from 'vitest'
import { LoginInput, normalizeUsername } from '../entities/user'

/**
 * **로그인 화면이 보내는 몸통이 계약을 만족하는가** (O-029 · 2026-09-03).
 *
 * ══ 왜 이 파일이 생겼나 — 사장님이 가입은 됐는데 로그인이 안 되셨다 ══
 *
 * 2026-09-01(D-252)에 로그인 키를 **이메일 → 아이디**로 바꿨다. 계약과 서버는
 * 바뀌었는데 **화면이 안 따라왔다.** 가입(O-027)과 **글자 그대로 같은 사고**다.
 * ```
 * 계약이 받음   username 또는 email 중 하나 + password
 * 화면이 보냄   email 하나                       ← 아이디로 가입한 사람은 못 들어온다
 * ```
 * D-252 한 번이 **가입 화면과 로그인 화면을 둘 다** 안 데려갔다.
 * 그래서 이번엔 **양쪽 다** 테스트로 못 박는다.
 *
 * ⚠ 계약을 화면에 맞추지 않는다. **화면을 계약에 맞춘다.** 서버가 맞다.
 */

/** 화면(`apps/web/app/auth/login/page.tsx`)이 실제로 보내는 몸통 */
const bodyFromScreen = (over: Record<string, unknown> = {}) => ({
  username: 'o029tester',
  password: 'o029local!pw',
  ...over,
})

describe('로그인 계약 — 화면이 보내는 몸통 (O-029)', () => {
  it('★아이디 + 비밀번호면 통과한다★', () => {
    const parsed = LoginInput.safeParse(bodyFromScreen())
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true)
  })

  it('★이메일을 아이디 칸에 적어도 통과한다 — 옛 계정이 이 길로 들어온다★', () => {
    /* 서버(`findUserForLogin`)가 아이디로 먼저 찾고, `@` 가 있으면 이메일로 또 찾는다.
       그러니 화면은 갈래를 나눌 필요가 없다 — 칸 하나로 보낸다 */
    expect(LoginInput.safeParse(bodyFromScreen({ username: 'old@naver.com' })).success).toBe(true)
  })

  it('email 칸으로 보내도 통과한다 (옛 화면을 깨뜨리지 않는다)', () => {
    const { username: _drop, ...rest } = bodyFromScreen()
    expect(LoginInput.safeParse({ ...rest, email: 'old@naver.com' }).success).toBe(true)
  })

  it('★아이디도 이메일도 없으면 깨진다 — 오늘 화면이 이 상태였다★', () => {
    const { username: _drop, ...rest } = bodyFromScreen()
    const parsed = LoginInput.safeParse(rest)
    expect(parsed.success).toBe(false)
    expect(parsed.success ? [] : parsed.error.issues.map((i) => String(i.path[0]))).toContain(
      'username',
    )
  })

  it('비밀번호가 비면 깨진다', () => {
    expect(LoginInput.safeParse(bodyFromScreen({ password: '' })).success).toBe(false)
  })

  it('가입 규칙보다 느슨하다 — 로그인은 **형식을 안 본다**', () => {
    /* 가입은 「영문 시작 4~16자」를 강제하지만 로그인은 아니다.
       규칙을 바꾸기 전에 가입한 계정이 그 규칙 때문에 못 들어오면 안 된다 */
    expect(LoginInput.safeParse(bodyFromScreen({ username: 'ab' })).success).toBe(true)
  })

  it('시도 제한 키는 대소문자를 안 가린다 — 두 이름으로 한도를 두 배 쓰지 못한다', () => {
    expect(normalizeUsername('O029Tester')).toBe(normalizeUsername('o029tester'))
  })
})
