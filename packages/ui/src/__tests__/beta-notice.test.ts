/**
 * 베타 안내 문구 회귀 테스트 (Phase 11).
 *
 * 고정하는 것은 두 가지다.
 *  1. 베타일 때만 안내가 붙는다 (정식 시즌에 상시 배너를 띄우지 않는다)
 *  2. 문구가 정책 문장 그대로다 — "검증 중인 공개 시즌" + "정식 시즌에 승계되지 않음"
 */
import { describe, expect, it } from 'vitest'
import {
  BETA_NOTICE,
  BETA_NOTICE_CARRYOVER,
  BETA_NOTICE_HEADLINE,
  BETA_NOTICE_PURPOSE,
  betaNoticeFor,
} from '../league/betaNoticeText'

describe('베타 안내 노출 조건', () => {
  it('베타 시즌에는 안내를 붙인다', () => {
    const notice = betaNoticeFor('beta')
    expect(notice).not.toBeNull()
    expect(notice?.lines).toHaveLength(2)
  })

  it('정식·레거시 시즌에는 아무것도 붙이지 않는다', () => {
    expect(betaNoticeFor('official')).toBeNull()
    expect(betaNoticeFor('legacy')).toBeNull()
  })

  it('시즌 종류를 모르면 붙이지 않는다 (모를 때 경고를 띄우지 않는다)', () => {
    expect(betaNoticeFor(null)).toBeNull()
    expect(betaNoticeFor(undefined)).toBeNull()
  })
})

describe('베타 안내 문구', () => {
  it('제목은 시즌0 이다 (D-178 — 예전 `Beta Season`)', () => {
    /* 예전에는 내부 번호 0 을 감추려고 `Beta Season` 이라고 썼다 (D-098).
       사용자가 `시즌0` 이라고 부르기로 정해서 **번호를 그대로 드러낸다** (D-178) */
    expect(BETA_NOTICE_HEADLINE).toBe('시즌0')
    expect(betaNoticeFor('beta')?.headline).toBe('시즌0')
  })

  it('무엇을 검증하는 시즌인지 알려 준다', () => {
    expect(BETA_NOTICE_PURPOSE).toBe('현재 SACLOUD 래더 시스템을 검증하는 공개 테스트 시즌입니다.')
  })

  it('다음 정식 시즌에 승계되지 않는다는 사실을 명시한다', () => {
    /* 시즌1 의 **번호가 `[미확인]`** 이라 문구에 숫자를 넣지 않는다 (D-175 · D-178).
       예전 문구는 `정식 Season 8` 이라고 못 박고 있었다 */
    expect(BETA_NOTICE_CARRYOVER).toBe(
      '시즌0의 랭킹과 점수는 다음 정식 시즌에 승계되지 않습니다.',
    )
    expect(BETA_NOTICE_CARRYOVER).not.toContain('Season')
    expect(betaNoticeFor('beta')?.lines).toContain(BETA_NOTICE_CARRYOVER)
  })

  it('배지 tooltip과 안내가 같은 문장을 쓴다 (문구를 두 벌 두지 않는다)', () => {
    expect(BETA_NOTICE).toBe(BETA_NOTICE_CARRYOVER)
  })

  it('과도한 경고 문구를 쓰지 않는다', () => {
    const joined = [BETA_NOTICE_PURPOSE, BETA_NOTICE_CARRYOVER].join(' ')
    for (const word of ['경고', '주의', '위험', '삭제됩니다', '초기화됩니다']) {
      expect(joined).not.toContain(word)
    }
  })
})
