/**
 * 공식 라벨 · 래더 반영 문구 회귀 테스트 (D-145 기준).
 *
 * 여기서 고정하는 것은 하나다 —
 * **래더 반영 여부는 `official` 이 아니라 "정상 5v5 인가" 로만 정해진다.**
 * 이 둘이 다시 엮이면 폐기된 규칙("비공식이라 래더 미반영")이 화면에 되살아난다.
 */
import { describe, expect, it } from 'vitest'
import {
  COMPOSITION_NOTICE,
  NOT_RATED_BADGE,
  NOT_RATED_BADGE_TITLE,
  UNOFFICIAL_BADGE,
  UNOFFICIAL_BADGE_TITLE,
  isRated,
  ladderNotice,
} from '../record/officialCopy'

describe('래더 반영 판정', () => {
  it('5v5 면 반영된다', () => {
    expect(isRated('5v5')).toBe(true)
  })

  it('5v5 가 아니면 반영되지 않는다', () => {
    for (const value of ['5v4', '4v5', '5v3', '3v1', '1v1', null]) {
      expect(isRated(value)).toBe(false)
    }
  })
})

describe('래더 안내 문구', () => {
  it('5v5 는 반영된다고 말한다', () => {
    const notice = ladderNotice('5v5')
    expect(notice).toContain('반영')
    expect(notice).not.toContain('반영되지 않습니다')
  })

  it('5v5 가 아니면 반영되지 않는다고 말한다', () => {
    expect(ladderNotice('5v4')).toContain('반영되지 않습니다')
    expect(ladderNotice(null)).toContain('반영되지 않습니다')
  })

  it('기록은 남는다는 것을 함께 말한다 — 경기를 버리지 않는다', () => {
    expect(ladderNotice('5v4')).toContain('기록은 남습니다')
  })
})

describe('폐기된 규칙이 문구에 남아 있지 않다', () => {
  it('비공식 배지가 래더 미반영을 뜻하지 않는다', () => {
    expect(UNOFFICIAL_BADGE).not.toContain('미반영')
    expect(UNOFFICIAL_BADGE_TITLE).toContain('래더에는 정상적으로 반영')
  })

  it('래더 미반영 배지는 참가자 수를 이유로 든다 — 공식 여부가 아니다', () => {
    expect(NOT_RATED_BADGE).toBe('래더 미반영')
    expect(NOT_RATED_BADGE_TITLE).toContain('10명')
    expect(NOT_RATED_BADGE_TITLE).not.toContain('비공식')
  })

  it('반영률(100/70/40/0%) 개념을 더 이상 말하지 않는다', () => {
    expect(COMPOSITION_NOTICE).not.toContain('반영률')
    expect(COMPOSITION_NOTICE).toContain('깎지 않습니다')
    expect(COMPOSITION_NOTICE).toContain('+50')
  })
})
