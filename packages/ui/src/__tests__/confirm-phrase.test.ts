import { describe, expect, it } from 'vitest'
import { EXPEL_CONFIRM_PHRASE } from '@sacloud/contract'
import { isConfirmPhraseMatched } from '../league/confirmPhrase'

/**
 * 추방 확인 문구.
 *
 * 추방은 **되돌릴 수 없고 재가입도 불가**하다(관측). 그래서 원본은 `추방합니다` 를
 * 그대로 입력해야 버튼이 활성화된다. 실수로 눌러서 벌어지면 복구할 방법이 없으므로
 * 이 규칙은 브라우저 없이도 항상 검증되게 고정한다.
 *
 * 서버도 같은 문구를 다시 확인한다 — 화면 검증만 믿으면 API를 직접 호출해 우회된다.
 */
describe('추방 확인 문구', () => {
  it('정확히 일치할 때만 통과한다', () => {
    expect(isConfirmPhraseMatched('추방합니다', EXPEL_CONFIRM_PHRASE)).toBe(true)
  })

  it('빈 값 · 일부만 입력 · 다른 문구는 통과하지 않는다', () => {
    for (const value of ['', '추방', '추방합니', '추방 합니다', '탈퇴합니다', '추방합니다.']) {
      expect(isConfirmPhraseMatched(value, EXPEL_CONFIRM_PHRASE), value).toBe(false)
    }
  })

  it('앞뒤 공백을 다듬어 주지 않는다 (문구를 그대로 쳐야 한다)', () => {
    expect(isConfirmPhraseMatched(' 추방합니다', EXPEL_CONFIRM_PHRASE)).toBe(false)
    expect(isConfirmPhraseMatched('추방합니다 ', EXPEL_CONFIRM_PHRASE)).toBe(false)
  })

  it('계약의 문구 상수가 바뀌면 함께 깨진다', () => {
    expect(EXPEL_CONFIRM_PHRASE).toBe('추방합니다')
  })
})
