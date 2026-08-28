/**
 * 공식 라벨 · 래더 반영 문구 회귀 테스트 (D-145 기준).
 *
 * 여기서 고정하는 것은 하나다 —
 * **래더 반영 여부는 `official` 이 아니라 "정상 5v5 인가" 로만 정해진다.**
 * 이 둘이 다시 엮이면 폐기된 규칙("비공식이라 래더 미반영")이 화면에 되살아난다.
 */
import { describe, expect, it } from 'vitest'
import { NOT_RATED_BADGE, NOT_RATED_BADGE_TITLE, isRated } from '../record/officialCopy'

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

describe('설명·안내 문구는 화면에서 사라졌다 (2026-08-28 사용자 지시)', () => {
  it('래더 반영 안내 문구와 클랜 구성 안내 문구가 모듈에 없다', async () => {
    /* 상수가 남아 있으면 누군가 다시 화면에 붙인다. 실제로 그렇게 붙어 있었다 */
    const mod = (await import('../record/officialCopy')) as Record<string, unknown>
    expect(mod['ladderNotice']).toBeUndefined()
    expect(mod['COMPOSITION_NOTICE']).toBeUndefined()
  })

  it('`미반영` 인라인 표기가 없다 — 결측 표기는 `알수없음` 하나다', async () => {
    const mod = (await import('../record/officialCopy')) as Record<string, unknown>
    expect(mod['NOT_RATED_INLINE']).toBeUndefined()
  })
})

describe('폐기된 규칙이 문구에 남아 있지 않다', () => {
  it('공식/비공식 배지 자체가 없다 (D-149)', async () => {
    /* 배지를 지웠으므로 모듈에 그 상수가 존재하면 안 된다.
       남아 있으면 누군가 다시 화면에 붙일 수 있다 */
    const mod = (await import('../record/officialCopy')) as Record<string, unknown>
    expect(mod['UNOFFICIAL_BADGE']).toBeUndefined()
    expect(mod['UNOFFICIAL_BADGE_TITLE']).toBeUndefined()
  })

  it('래더 미반영 배지는 참가자 수를 이유로 든다 — 공식 여부가 아니다', () => {
    expect(NOT_RATED_BADGE).toBe('래더 미반영')
    expect(NOT_RATED_BADGE_TITLE).toContain('10명')
    expect(NOT_RATED_BADGE_TITLE).not.toContain('비공식')
  })

  it('반영률(100/70/40/0%) 개념을 어디에서도 말하지 않는다', async () => {
    const mod = (await import('../record/officialCopy')) as Record<string, unknown>
    for (const value of Object.values(mod)) {
      if (typeof value !== 'string') continue
      expect(value).not.toContain('반영률')
      expect(value).not.toContain('클랜원 수')
    }
  })
})
