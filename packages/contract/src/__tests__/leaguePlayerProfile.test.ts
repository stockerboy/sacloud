/**
 * 기록실 상세의 **선수 프로필 값** 계약 회귀 (D-161).
 *
 * `포지션` 줄을 "원본에 없다" 고 잘못 판단해 지운 적이 있다.
 * 다시 지워지지 않게, 그리고 **`null` 을 표기로 메우지 않게** 계약을 여기서 고정한다.
 */
import { describe, expect, it } from 'vitest'
import { LeaguePlayerProfile } from '../entities/detail'

describe('LeaguePlayerProfile', () => {
  it('position · note 를 담는다', () => {
    const parsed = LeaguePlayerProfile.parse({
      id: '1896093983',
      name: 'Yolloanswag',
      position: 'A 숏',
      note: '주말만 합니다',
    })
    expect(parsed.position).toBe('A 숏')
    expect(parsed.note).toBe('주말만 합니다')
  })

  it('둘 다 nullable 이다 — 대부분의 선수가 그렇다', () => {
    const parsed = LeaguePlayerProfile.parse({
      id: '1141324715',
      name: '【OωO】',
      position: null,
      note: null,
    })
    expect(parsed.position).toBeNull()
    expect(parsed.note).toBeNull()
  })

  it('필드가 없던 응답도 읽힌다 — 없으면 null 이다', () => {
    const parsed = LeaguePlayerProfile.parse({ id: '1', name: '아무개' })
    expect(parsed.position).toBeNull()
    expect(parsed.note).toBeNull()
  })

  it('숫자 코드를 그대로 흘려보내지 않는다 — 화면에 `3` 이 뜨면 안 된다', () => {
    /* 원본 응답의 position 은 숫자 코드다. 표기로 바꾸는 것은 적재 쪽 책임이고,
       계약은 **표기 문자열만** 받는다 (D-161) */
    expect(() => LeaguePlayerProfile.parse({ id: '1', name: '아무개', position: 3 })).toThrow()
  })
})
