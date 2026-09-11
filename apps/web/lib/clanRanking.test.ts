import { describe, expect, it } from 'vitest'
import { rankClans } from './clanRanking'

/* 2026-09-11 QA 교차검토 — 클랜 띠 «13위/13팀» 과 목록 «14위» 가 어긋났다.
   배치 중(placement) 클랜은 번호 없이 티어 맨 아래로 내려간다 */
describe('rankClans', () => {
  const clans = [
    { id: 'a', division: 3, rating: 2800, placement: true },
    { id: 'b', division: 3, rating: 3000, placement: false },
    { id: 'c', division: 3, rating: 2900, placement: false },
    { id: 'd', division: 2, rating: 2500, placement: false },
  ]

  it('티어 안에서 래더 순 · 배치 클랜은 번호 없이 맨 아래', () => {
    const out = rankClans(clans, { byTier: true })
    expect(out.map((r) => [r.id, r.rank])).toEqual([
      ['d', 1],
      ['b', 1],
      ['c', 2],
      ['a', null],
    ])
  })

  it('placement 를 안 주면 옛 규칙 그대로 — 전부 번호가 붙는다', () => {
    const out = rankClans(clans.map(({ placement: _p, ...rest }) => rest), { byTier: false })
    expect(out.map((r) => r.rank)).toEqual([1, 2, 3, 4])
    expect(out[0]?.id).toBe('b')
  })
})
