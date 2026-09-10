import { describe, expect, it } from 'vitest'
import { season0First } from '../lib/server/queries/search'

/**
 * ★지금 시즌에 뛴 사람을 앞으로 민다★ (2026-09-10 · `ORDERS.md` 「검색에 시즌0 창」).
 *
 * 검색 대상 25,727명 중 지금 시즌에 뛴 사람은 2,374명뿐이다. 그렇다고 나머지를
 * ★감추지 않는다★ — 화면도 열리고 값도 남아 있는 사람들이다. ★앞뒤만 바꾼다.★
 * DB 를 안 쓰는 순수 함수라 여기서 그대로 시험한다.
 */
const row = (id: string, played: number) => ({ id, _count: { leaguePlayers: played } })

describe('season0First', () => {
  it('지금 시즌에 뛴 사람이 앞으로 온다', () => {
    const out = season0First([row('a', 0), row('b', 1), row('c', 0), row('d', 2)])
    expect(out.map((r) => r.id)).toEqual(['b', 'd', 'a', 'c'])
  })

  it('★한 명도 안 없앤다★ — 개수가 그대로다', () => {
    const input = [row('a', 0), row('b', 1), row('c', 0)]
    expect(season0First(input)).toHaveLength(input.length)
  })

  it('같은 무리 안에서는 받은 순서를 지킨다 (안정 정렬)', () => {
    const out = season0First([row('x', 1), row('y', 1), row('z', 1)])
    expect(out.map((r) => r.id)).toEqual(['x', 'y', 'z'])
  })

  it('아무도 안 뛰었으면 순서가 그대로다', () => {
    const out = season0First([row('a', 0), row('b', 0)])
    expect(out.map((r) => r.id)).toEqual(['a', 'b'])
  })
})
