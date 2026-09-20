import { describe, expect, it } from 'vitest'
import { makeIntroPhrase, INTRO_TTL_MS } from './introVerification'

/**
 * ★자기소개 인증★ (2026-09-20 사장님)
 *
 * DB 를 타는 부분은 여기서 시험하지 않는다 — 여기서 못 박는 것은
 * ★문구가 안전하게 만들어지는가★ 와 ★시간이 사장님이 말한 3분인가★ 다.
 */
describe('자기소개 인증 문구', () => {
  it('★3분이다★ — 사장님이 「3분안에」 라고 하셨다', () => {
    expect(INTRO_TTL_MS).toBe(3 * 60 * 1000)
  })

  it('SACLOUD- 로 시작하고 네 글자가 붙는다', () => {
    expect(makeIntroPhrase()).toMatch(/^SACLOUD-[A-Z2-9]{4}$/)
  })

  it('★헷갈리는 글자를 쓰지 않는다★ — 손으로 옮겨 적는 값이다', () => {
    /*
     * 0/O · 1/I/l 이 섞이면 한 글자 틀려도 왜 안 되는지 알 길이 없다.
     * ⚠ ★접두사 `SACLOUD-` 에는 O 와 L 이 들어 있다★ — 뒤 네 글자만 본다.
     *   (처음엔 이어붙인 문자열을 통째로 봐서 시험이 헛돌았다)
     */
    const tails = Array.from({ length: 400 }, () => makeIntroPhrase().slice('SACLOUD-'.length))
    expect(tails.every((t) => t.length === 4)).toBe(true)
    for (const bad of ['0', 'O', '1', 'I', 'L']) {
      expect(tails.join('').includes(bad)).toBe(false)
    }
  })

  it('★매번 다르다★ — 남이 미리 써 둘 수 없어야 한다', () => {
    const seen = new Set(Array.from({ length: 200 }, () => makeIntroPhrase()))
    /* 31^4 = 923,521 가지라 200개가 거의 다 달라야 정상이다 */
    expect(seen.size).toBeGreaterThan(180)
  })
})
