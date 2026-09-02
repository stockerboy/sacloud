import { describe, expect, it } from 'vitest'
import { SignupInput } from '../entities/user'

/**
 * **화면이 보내는 몸통이 계약을 만족하는가** (O-027 · 2026-09-02).
 *
 * ══ 왜 이 파일이 생겼나 — 오늘 운영에서 가입이 통째로 막혀 있었다 ══
 *
 * 2026-09-01(D-252)에 가입 키를 **이메일 → 아이디**로 바꿨다. 계약은 바뀌었는데
 * **화면이 안 따라왔다.** 아이디 입력 칸이 없었고 `username` 을 보내지도 않았다.
 * ```
 * 서버가 요구   username · password · nickname   (email 은 선택)
 * 화면이 보냄   email · password · nickname · captcha_token
 * 결과          safeParse 가 username 에서 깨진다 → 400
 *               ★누가 무엇을 넣어도 실패한다. 100% 다★
 * ```
 * 운영에서 직접 확인했다 — 화면이 보내는 그대로 던지면 400,
 * `username` 을 넣으면 200.
 *
 * ══ 왜 아무도 못 잡았나 ══
 *
 * `signup-rules.test.ts` 의 `base` 가 **D-252 이전 모양 그대로**였다 —
 * `username` 이 없는 채로 「모두 채우면 제출 가능」이 통과하고 있었다.
 * 테스트가 옛 세상을 지키고 있으면 새 결함을 못 잡는다.
 *
 * ══ 그래서 여기서 무엇을 고정하나 ══
 *
 * **계약이 실제로 무엇을 요구하는지**를 못 박는다. 화면이 보내는 몸통을 그대로
 * 써서 검사하므로, 다음에 누가 계약을 바꾸고 화면을 안 고치면 **여기서 먼저 깨진다.**
 *
 * ⚠ 계약을 화면에 맞추지 않는다. **화면을 계약에 맞춘다.** 서버가 맞다.
 */

/** 화면(`apps/web/app/auth/signup/page.tsx`)이 실제로 보내는 몸통 */
const bodyFromScreen = (over: Record<string, unknown> = {}) => ({
  username: 'tester01',
  password: 'password1234',
  nickname: '테스터',
  captcha_token: 'mock',
  ...over,
})

describe('가입 계약 — 화면이 보내는 몸통 (O-027)', () => {
  it('★아이디·비밀번호·닉네임만 있으면 통과한다 — 이메일 없이도★', () => {
    const parsed = SignupInput.safeParse(bodyFromScreen())
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true)
  })

  it('★아이디가 없으면 깨진다 — 오늘 운영에서 이게 났다★', () => {
    const { username: _drop, ...withoutUsername } = bodyFromScreen()
    const parsed = SignupInput.safeParse(withoutUsername)
    expect(parsed.success).toBe(false)
    expect(parsed.success ? [] : parsed.error.issues.map((i) => String(i.path[0]))).toContain(
      'username',
    )
  })

  it('이메일을 넣어도 통과한다 (선택 입력이다)', () => {
    expect(SignupInput.safeParse(bodyFromScreen({ email: 'tester@example.com' })).success).toBe(true)
  })

  it('★빈 문자열 이메일은 깨진다 — 그래서 화면은 비었으면 아예 안 보낸다★', () => {
    /* `Email` 은 형식을 본다. 비었다고 통과시키지 않는다.
       화면이 `email: ''` 을 보내면 「이메일 형식이 올바르지 않습니다」로 막힌다 —
       이메일을 **안 쓴 사람이** 그 말을 듣는다. 그래서 비면 키 자체를 뺀다 */
    expect(SignupInput.safeParse(bodyFromScreen({ email: '' })).success).toBe(false)
  })

  it('아이디 규칙 — 영문으로 시작하는 4~16자 영문·숫자·밑줄', () => {
    for (const bad of ['abc', 'a'.repeat(17), '1abcd', '_abcd', '한글아이디', 'has space', '']) {
      expect(SignupInput.safeParse(bodyFromScreen({ username: bad })).success, `«${bad}»`).toBe(
        false,
      )
    }
    for (const good of ['abcd', 'tester01', 'a_b_c1', 'a'.repeat(16)]) {
      expect(SignupInput.safeParse(bodyFromScreen({ username: good })).success, `«${good}»`).toBe(
        true,
      )
    }
  })

  it('비밀번호는 8자 이상 · 닉네임은 2~16자', () => {
    expect(SignupInput.safeParse(bodyFromScreen({ password: '1234567' })).success).toBe(false)
    expect(SignupInput.safeParse(bodyFromScreen({ password: '12345678' })).success).toBe(true)
    expect(SignupInput.safeParse(bodyFromScreen({ nickname: 'ㄱ' })).success).toBe(false)
    expect(SignupInput.safeParse(bodyFromScreen({ nickname: 'ㄱ'.repeat(17) })).success).toBe(false)
  })

  it('captcha_token 은 없어도 된다 (선택)', () => {
    const { captcha_token: _drop, ...withoutCaptcha } = bodyFromScreen()
    expect(SignupInput.safeParse(withoutCaptcha).success).toBe(true)
  })
})
