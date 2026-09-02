/**
 * **서버가 준 이유가 화면까지 가는가** (O-023 · O-029 · 2026-09-03).
 *
 * ══ 왜 이 파일이 생겼나 ══
 *
 * 서버는 갈래마다 사람 말을 정확히 주고 있었다.
 * ```
 * 401  아이디 또는 비밀번호가 올바르지 않습니다
 * 429  로그인 시도가 너무 많습니다.            + Retry-After: 896
 * 400  입력값을 확인해주세요
 * ```
 * 그런데 화면은 **셋 다 「로그인하지 못했습니다」로 뭉갰다.** 가입도 같았다
 * (「가입하지 못했습니다」). 사장님도 우리도 원인을 볼 수 없었다 —
 * 특히 429 는 **두드릴수록 길어지는데** 화면이 그 말을 안 해서
 * 막힌 사람이 계속 두드리게 만들었다.
 *
 * 여기서 못 박는 것은 하나다 — **`ApiError` 가 이유를 잃지 않는다.**
 */
import { describe, expect, it } from 'vitest'
import { ApiError } from '../lib/api'

describe('ApiError.humanMessage — 서버 말이 이긴다', () => {
  it('★서버가 준 문장을 그대로 쓴다 — 기본 문구가 아니다★', () => {
    const error = new ApiError(401, 'POST /auth/login → 401', '아이디 또는 비밀번호가 올바르지 않습니다')
    expect(error.humanMessage('로그인하지 못했습니다.')).toBe(
      '아이디 또는 비밀번호가 올바르지 않습니다',
    )
  })

  it('서버 말이 없을 때만 기본 문구를 쓴다', () => {
    expect(new ApiError(500, 'x').humanMessage('로그인하지 못했습니다.')).toBe(
      '로그인하지 못했습니다.',
    )
  })

  it('★기계어(`POST /… → 401`)는 절대 화면에 안 나간다★', () => {
    const shown = new ApiError(401, 'POST /auth/login → 401').humanMessage('로그인하지 못했습니다.')
    expect(shown).not.toContain('→')
    expect(shown).not.toContain('POST')
  })

  it('서버 말이 공백뿐이면 기본 문구로 넘어간다', () => {
    expect(new ApiError(400, 'x', '   ').humanMessage('기본')).toBe('기본')
  })

  describe('429 — 「잠시」가 아니라 **얼마나**를 말한다', () => {
    it('★1분 미만은 초로★', () => {
      const error = new ApiError(429, 'x', '로그인 시도가 너무 많습니다.', undefined, 45)
      expect(error.humanMessage('기본')).toBe(
        '로그인 시도가 너무 많습니다. 약 45초 뒤에 다시 시도할 수 있습니다.',
      )
    })

    it('★1분 이상은 분으로 — 올림한다★', () => {
      /* 로컬에서 실제로 받은 값이다 (`Retry-After: 896`).
         내림하면 14분이라 말해 놓고 15분째에 되는 일이 생긴다 — 올린다 */
      const error = new ApiError(429, 'x', '로그인 시도가 너무 많습니다.', undefined, 896)
      expect(error.humanMessage('기본')).toBe(
        '로그인 시도가 너무 많습니다. 약 15분 뒤에 다시 시도할 수 있습니다.',
      )
    })

    it('남은 시간을 모르면 붙이지 않는다 — 지어내지 않는다', () => {
      expect(new ApiError(429, 'x', '로그인 시도가 너무 많습니다.').humanMessage('기본')).toBe(
        '로그인 시도가 너무 많습니다.',
      )
    })

    it('429 가 아니면 시간을 안 붙인다', () => {
      const error = new ApiError(401, 'x', '아이디 또는 비밀번호가 올바르지 않습니다', undefined, 30)
      expect(error.humanMessage('기본')).not.toContain('뒤에')
    })
  })
})
