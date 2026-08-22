import { describe, expect, it } from 'vitest'
import {
  ladderNotice,
  showsClanWeight,
  UNOFFICIAL_BADGE,
  UNOFFICIAL_BADGE_TITLE,
} from '../record/officialCopy'

/**
 * 공식/비공식 문구 회귀 (Phase 10 final cleanup).
 *
 * 실제로 났던 문제
 *   비공식 경기 상세에 "개인 래더는 용병 포함 전원 100% 반영된다"와
 *   "클랜 래더 반영률 70%"가 같이 떠서, 반영되지 않은 경기가 반영된 것처럼 보였다.
 */

describe('사용자에게 보이는 상태는 공식/비공식 둘뿐이다 (정책 1)', () => {
  it('"참고"라는 표현을 쓰지 않는다', () => {
    const strings = [UNOFFICIAL_BADGE, UNOFFICIAL_BADGE_TITLE, ladderNotice(true), ladderNotice(false)]
    for (const text of strings) {
      expect(text, `"참고"가 남아 있다: ${text}`).not.toContain('참고')
    }
  })

  it('비공식 배지는 래더 미반영을 같이 알린다 (정책 7)', () => {
    expect(UNOFFICIAL_BADGE).toBe('비공식 경기 · 래더 미반영')
    expect(UNOFFICIAL_BADGE_TITLE).toContain('3명 미만')
  })
})

describe('래더 안내 문구는 official 상태로 갈린다 (정책 4)', () => {
  it('공식 경기에서만 개인 래더 100% 반영을 알린다', () => {
    expect(ladderNotice(true)).toBe('실제 출전이 확인된 선수는 용병 포함 개인 래더 100% 반영')
  })

  it('비공식 경기에서는 미반영이라고만 말한다', () => {
    expect(ladderNotice(false)).toBe(
      '비공식 경기이므로 개인/클랜 래더 및 시즌 누적 통계에 반영되지 않습니다',
    )
  })

  it('비공식 문구에 "100%"나 "반영된다"가 들어가면 안 된다 — 그게 원래 버그였다', () => {
    expect(ladderNotice(false)).not.toContain('100%')
    expect(ladderNotice(false)).not.toContain('반영된다')
  })
})

describe('클랜 반영률은 공식 경기에서만 보여 준다 (정책 5 · 6)', () => {
  it('공식 경기면 보여 준다 — 100/70/40/0%는 그대로 유지한다', () => {
    expect(showsClanWeight(true)).toBe(true)
  })

  it('비공식 경기면 숨긴다 — 70%가 실제 적용된 것처럼 보이면 안 된다', () => {
    expect(showsClanWeight(false)).toBe(false)
  })
})
