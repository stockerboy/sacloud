/**
 * 병영수첩 계정 ↔ ouid 연결 판정 테스트.
 *
 * 이 판정이 틀리면 **엉뚱한 사람의 닉·클랜을 우리 선수에 붙인다.** 그래서 촘촘히 본다.
 * DB·API 를 쓰지 않는다 (D-187 의 5초 타임아웃과 무관하다).
 */
import { describe, expect, it } from 'vitest'
import {
  estimateCalls,
  judgeLink,
  looksLikeDisguise,
  orderByRecency,
} from '../lib/barracksLink.js'

describe('looksLikeDisguise — 3글자 영문은 위장닉으로 본다 (D-221)', () => {
  it('사용자가 든 예시들을 잡는다', () => {
    expect(looksLikeDisguise('pom')).toBe(true)
    expect(looksLikeDisguise('vom')).toBe(true)
    expect(looksLikeDisguise('cut')).toBe(true)
  })

  it('대문자가 섞여도 3글자 영문이면 잡는다', () => {
    expect(looksLikeDisguise('EMP')).toBe(true)
    expect(looksLikeDisguise('Ann')).toBe(true)
  })

  it('한글은 아니다', () => {
    expect(looksLikeDisguise('준녕')).toBe(false)
    expect(looksLikeDisguise('그남자')).toBe(false)
  })

  it('길이가 다르면 아니다', () => {
    expect(looksLikeDisguise('ab')).toBe(false)
    expect(looksLikeDisguise('okada')).toBe(false)
  })

  it('숫자·기호가 섞이면 아니다', () => {
    expect(looksLikeDisguise('po1')).toBe(false)
    expect(looksLikeDisguise('p_m')).toBe(false)
  })

  it('앞뒤 공백은 무시한다', () => {
    expect(looksLikeDisguise('  pom  ')).toBe(true)
  })
})

describe('judgeLink — 되돌려 확인해야 잇는다', () => {
  it('위장닉이면 호출도 안 하고 거른다', () => {
    expect(judgeLink({ battlelogNick: 'pom', ouid: null })).toEqual({
      ok: false,
      reason: 'disguise',
    })
  })

  it('`/id` 가 모르면 못 잇는다', () => {
    expect(judgeLink({ battlelogNick: '총알무떠엉', ouid: null })).toEqual({
      ok: false,
      reason: 'not_found',
    })
  })

  it('되돌려 확인이 맞으면 잇는다', () => {
    expect(
      judgeLink({ battlelogNick: '무좀고릴라', ouid: 'abc123', apiUserName: '무좀고릴라' }),
    ).toEqual({ ok: true, reason: 'verified' })
  })

  it('되돌려 확인이 어긋나면 잇지 않는다 — 다른 사람이다', () => {
    expect(
      judgeLink({ battlelogNick: '초보11', ouid: 'abc123', apiUserName: '전혀다른닉' }),
    ).toEqual({ ok: false, reason: 'mismatch', apiUserName: '전혀다른닉' })
  })

  it('user/basic 을 아직 안 불렀으면 잇지 않는다 — 조회만으로는 근거가 아니다', () => {
    expect(judgeLink({ battlelogNick: '무좀고릴라', ouid: 'abc123' })).toEqual({
      ok: false,
      reason: 'mismatch',
      apiUserName: null,
    })
  })

  it('앞뒤 공백 차이는 같은 닉으로 본다', () => {
    expect(
      judgeLink({ battlelogNick: ' 준녕 ', ouid: 'abc', apiUserName: '준녕' }),
    ).toEqual({ ok: true, reason: 'verified' })
  })

  it('대소문자가 다르면 **다른 닉이다** — 동형문자 함정 때문에 느슨하게 보지 않는다', () => {
    const v = judgeLink({ battlelogNick: 'twintail', ouid: 'abc', apiUserName: 'twintaiI' })
    expect(v.ok).toBe(false)
    expect(v.reason).toBe('mismatch')
  })
})

describe('orderByRecency — 최근에 본 닉부터 조회한다', () => {
  it('matchKey 문자열 비교가 곧 시간순이다', () => {
    const rows = [
      { id: 'a', lastSeenKey: '260401000000000001' },
      { id: 'b', lastSeenKey: '260829180000000001' },
      { id: 'c', lastSeenKey: '260615120000000001' },
    ]
    expect(orderByRecency(rows).map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('원본 배열을 건드리지 않는다', () => {
    const rows = [
      { id: 'a', lastSeenKey: '260401000000000001' },
      { id: 'b', lastSeenKey: '260829180000000001' },
    ]
    orderByRecency(rows)
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('빈 배열도 받는다', () => {
    expect(orderByRecency([])).toEqual([])
  })
})

describe('estimateCalls — 호출 예산', () => {
  it('대상 하나에 최대 2회다', () => {
    expect(estimateCalls(100)).toBe(200)
  })
})
