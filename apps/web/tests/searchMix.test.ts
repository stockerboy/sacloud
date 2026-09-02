import { describe, expect, it } from 'vitest'
import { mixPrefixFirst } from '../lib/server/queries/search'

/**
 * 자동완성 자리 배분 (O-009 · 2026-09-02).
 *
 * ── 무엇을 지키는가
 *   접두어를 앞세우되 **부분일치 전용 자리를 남긴다.** 이게 없으면 접두어가 여덟 칸을
 *   다 먹고, 이름 뒤쪽으로 찾는 사람이 한 줄도 안 나온다.
 *
 *   강민재가 로컬 DB 선수 23,562명을 전수로 세었다 (2026-09-02).
 *   ```
 *   이름이 특수문자로 시작한다        748명  3.2%   ♡루나 · ★상스나이퍼★ · [h].GH
 *   앞은 치는데 부르는 이름이 뒤       981명  4.2%   SC1..안현수 · AFTV:돌아온비티
 *   ─────────────────────────────────────────
 *   합계                          1,729명  7.3%
 *   ```
 *   `SC1..안현수` 를 친구는 **「안현수」로 찾는다.** 그 이름은 접두어로 0건이다.
 *   그래서 자리를 떼어 두지 않으면 이 고침이 유저에게 아예 안 닿는다.
 *
 * ── DB 없이 돈다
 *   섞는 규칙만 순수 함수로 떼어 냈다. 인덱스가 있든 없든 이 규칙은 같아야 한다.
 */
const row = (id: string) => ({ id })

describe('자동완성 자리 배분 (O-009)', () => {
  it('접두어가 앞에 온다', () => {
    const out = mixPrefixFirst([row('p1'), row('p2')], [row('c1'), row('p1')], 8)
    expect(out.map((r) => r.id).slice(0, 2)).toEqual(['p1', 'p2'])
  })

  it('★접두어가 넘쳐도 부분일치 자리 3칸이 남는다★', () => {
    /* `ts` 실측 모양 — 접두어 10건 · 부분일치 50건 */
    const prefix = Array.from({ length: 10 }, (_, i) => row(`p${i}`))
    const contains = [...prefix, ...Array.from({ length: 40 }, (_, i) => row(`c${i}`))]

    /* 서버 상한 10 · 화면 8줄 — 실제와 같은 조건으로 본다 */
    const out = mixPrefixFirst(prefix, contains, 10).slice(0, 8)
    expect(out).toHaveLength(8)
    const onlyContains = out.filter((r) => r.id.startsWith('c'))
    expect(onlyContains, '부분일치가 한 줄도 안 나오면 이 고침은 유저에게 안 닿는다').toHaveLength(3)
    expect(out.filter((r) => r.id.startsWith('p'))).toHaveLength(5)
  })

  it('★자리는 화면이 그리는 8줄 안에서 뗀다 — 서버 상한 10 안에서 떼면 안 보인다★', () => {
    const prefix = Array.from({ length: 10 }, (_, i) => row(`p${i}`))
    const contains = Array.from({ length: 10 }, (_, i) => row(`c${i}`))
    /* limit 10 으로 떼면 부분일치가 8~10번째에 놓여 화면에 한 줄도 안 나온다.
       실제로 그렇게 만들었다가 로컬 실측에서 1칸밖에 안 나와 찾았다 */
    const visible = mixPrefixFirst(prefix, contains, 10).slice(0, 8)
    expect(visible.filter((r) => r.id.startsWith('c'))).toHaveLength(3)
  })

  it('부분일치 전용이 없으면 자리를 떼지 않는다 — 빈 줄을 남기지 않는다', () => {
    const prefix = Array.from({ length: 10 }, (_, i) => row(`p${i}`))
    const out = mixPrefixFirst(prefix, prefix, 8)
    expect(out).toHaveLength(8)
    expect(out.every((r) => r.id.startsWith('p'))).toBe(true)
  })

  it('부분일치가 자리를 다 못 채우면 남은 접두어로 메운다', () => {
    const prefix = Array.from({ length: 10 }, (_, i) => row(`p${i}`))
    const out = mixPrefixFirst(prefix, [...prefix, row('c0')], 8)
    expect(out).toHaveLength(8)
    expect(out.filter((r) => r.id === 'c0')).toHaveLength(1)
    expect(out.filter((r) => r.id.startsWith('p'))).toHaveLength(7)
  })

  it('접두어가 0건이면 부분일치가 전부 채운다 — 「안현수」로 찾는 경우다', () => {
    const contains = Array.from({ length: 5 }, (_, i) => row(`c${i}`))
    const out = mixPrefixFirst([], contains, 8)
    expect(out.map((r) => r.id)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4'])
  })

  it('같은 사람이 두 번 나오지 않는다', () => {
    const out = mixPrefixFirst([row('a'), row('b')], [row('a'), row('b'), row('c')], 8)
    expect(new Set(out.map((r) => r.id)).size).toBe(out.length)
  })

  it('상한을 넘지 않는다', () => {
    const many = Array.from({ length: 30 }, (_, i) => row(`x${i}`))
    expect(mixPrefixFirst(many, many, 8)).toHaveLength(8)
  })
})
