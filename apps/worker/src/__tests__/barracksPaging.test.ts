/**
 * **병영수첩 목록 페이징 — 커서 규칙을 못박는다** (D-270).
 *
 * 나는 2026-09-04 에 ★「병영수첩은 최근 20건만 준다」고 잘못 보고했다.★
 * 사장님이 «8월은 거짓말이야» 라고 하셔서 다시 팠고, ★`seq_no` 라는 커서가 있었다.★
 *
 * ★이 검사가 있는 이유★ — 다음 세션이 ★또 「페이징이 없다」로 되돌아가지 않게★ 하려고다.
 * 규칙은 화면의 자바스크립트에서 그대로 옮겼다 —
 * ```js
 * t.lastSeq == e.message || "" === e.message ? t.endPage = !0
 *                                            : (t.lastSeq = e.message, t.endPage = !1)
 * ```
 */
import { describe, expect, it } from 'vitest'
import { nextListCursor } from '../jobs/barracksCollect.js'

const page = (message: string): string => JSON.stringify({ rtnCode: 20, message, result: [] })

describe('병영수첩 목록 커서', () => {
  it('★`message` 가 다음 커서다★', () => {
    expect(nextListCursor(page('260902220301124002'))).toBe('260902220301124002')
  })

  it('★빈 문자열이면 끝이다★ — 화면 코드의 `"" === e.message` 그대로', () => {
    expect(nextListCursor(page(''))).toBeNull()
  })

  it('★지금 커서와 같으면 끝이다★ — 같은 쪽이 다시 온 것이다', () => {
    const cur = '260902220301124002'
    expect(nextListCursor(page(cur), cur)).toBeNull()
  })

  it('★첫 쪽에서는 지금 커서가 없다★ — 그래도 다음 커서는 나온다', () => {
    expect(nextListCursor(page('260902220301124002'), undefined)).toBe('260902220301124002')
  })

  it('JSON 이 아니면 끝으로 본다 — ★모르면 더 두드리지 않는다★', () => {
    expect(nextListCursor('<html>차단</html>')).toBeNull()
  })

  it('`message` 가 문자열이 아니면 끝으로 본다', () => {
    expect(nextListCursor(JSON.stringify({ message: 12345 }))).toBeNull()
    expect(nextListCursor(JSON.stringify({}))).toBeNull()
  })

  /*
   * ⚠ ★이것이 내가 틀렸던 지점이다★ — 기록으로 남긴다.
   *   `match_key` · `last_match_key` · `page` 를 보냈더니 ★셋 다 조용히 무시★ 당했고
   *   ★1쪽이 그대로 다시 왔다.★ 나는 그것을 「페이징이 없다」로 읽었다.
   *   ★모르는 파라미터를 무시하는 API 에서는 「같은 답」이 「없다」의 근거가 못 된다.★
   */
  it('★같은 쪽이 다시 오는 것은 「기능이 없다」가 아니라 「이름이 틀렸다」일 수 있다★', () => {
    const first = '260902220301124002'
    /* 이름이 틀린 파라미터를 보내면 1쪽이 다시 온다 = 커서가 안 움직인다 */
    expect(nextListCursor(page(first), first)).toBeNull()
    /* 이름이 맞으면 커서가 움직인다 */
    expect(nextListCursor(page('260901201612119001'), first)).toBe('260901201612119001')
  })
})
