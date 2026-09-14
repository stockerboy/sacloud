import { describe, expect, it } from 'vitest'
import { dedupeSamePerson } from '../lib/server/queries/search'

/**
 * ★같은 사람이 두 줄로 뜨던 것★ (2026-09-14 사장님: «같은 닉네임 두개씩 뜨고»).
 *
 * 운영 실측 — 선수 표에 출처가 셋이고 서로 안 이어져 있다.
 *   dda       3줄 (기록 20 · 6 · 0)
 *   watercow  3줄 (기록 8 · 0 · 0 · 클랜이 셋 다 다름)
 */
const row = (
  id: string,
  name: string,
  clan: string | null,
  played: number,
) => ({ id, name, clan: clan === null ? null : { slug: clan }, _count: { leaguePlayers: played } })

describe('dedupeSamePerson — 목록에서만 접는다 (지우지 않는다)', () => {
  it('이름도 클랜도 같으면 한 줄만 남긴다 — 뛴 리그가 많은 쪽', () => {
    const out = dedupeSamePerson([
      row('b', 'dda', 'stylecIan', 0),
      row('a', 'dda', 'stylecIan', 2),
    ])
    expect(out.map((r) => r.id)).toEqual(['a'])
  })

  it('판수가 같으면 id 가 앞선 쪽', () => {
    const out = dedupeSamePerson([row('b', 'x', 'c1', 1), row('a', 'x', 'c1', 1)])
    expect(out.map((r) => r.id)).toEqual(['a'])
  })

  it('★클랜이 다르면 그대로 둔다★ — 동명이인일 수 있다', () => {
    const out = dedupeSamePerson([row('a', 'watercow', 'grave', 1), row('b', 'watercow', 'aeonic', 1)])
    expect(out.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('기록 0 인 줄은, 같은 이름에 기록 있는 줄이 있으면 뺀다', () => {
    const out = dedupeSamePerson([
      row('a', 'watercow', 'grave', 1),
      row('b', 'watercow', null, 0),
      row('c', 'watercow', 'aeonic', 0),
    ])
    expect(out.map((r) => r.id)).toEqual(['a'])
  })

  it('★전부 기록 0 이면 아무도 안 지운다★ — 빈 화면을 만들지 않는다', () => {
    const out = dedupeSamePerson([row('a', 'ghost', 'c1', 0), row('b', 'ghost', 'c2', 0)])
    expect(out.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('대소문자만 다른 닉도 같은 사람으로 본다', () => {
    const out = dedupeSamePerson([row('a', 'Iove', 'c1', 3), row('b', 'iove', 'c1', 0)])
    expect(out.map((r) => r.id)).toEqual(['a'])
  })

  it('들어온 차례를 지킨다', () => {
    const out = dedupeSamePerson([row('z', 'a', 'c', 1), row('y', 'b', 'c', 1)])
    expect(out.map((r) => r.id)).toEqual(['z', 'y'])
  })
})
