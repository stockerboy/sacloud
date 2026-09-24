/**
 * ★클랜랭킹 순위 매기기★ (2026-09-10 사장님 지시 — «클랜랭킹까지 매기고»).
 *
 * `apps/web/lib/clanRanking.ts` 는 ★DB 도 API 도 모르는 순수 함수★ 다.
 * 여기서 못 박는 것 넷:
 *   ① 래더 내림차순으로 선다
 *   ② 티어 리그는 티어를 넘나들지 않고 ★티어마다 1 부터★ (지시 #24 ⑤)
 *   ③ 같은 점수는 `id` 로 갈린다 — 순서가 흔들리지 않는다
 *   ④ ★원본 배열을 건드리지 않는다★
 */
import { describe, expect, it } from 'vitest'
import { rankClans } from '../lib/clanRanking'

/** 시험용 한 줄. 실제 `LeagueClan` 중 순위에 쓰이는 값만 있으면 된다 */
function clan(id: string, division: number, rating: number) {
  return { id, division, rating }
}

describe('클랜랭킹 — 래더 내림차순 (2026-09-10)', () => {
  it('티어를 안 쓰는 리그는 통째로 1..N 이다', () => {
    const rows = rankClans(
      [clan('b', 1, 3000), clan('a', 2, 3200), clan('c', 1, 2800)],
      { byTier: false },
    )

    expect(rows.map((row) => [row.id, row.rank])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ])
  })

  it('티어 값이 달라도 티어를 안 쓰면 점수만 본다', () => {
    const rows = rankClans([clan('low', 1, 100), clan('high', 6, 9000)], { byTier: false })
    expect(rows[0]?.id).toBe('high')
  })

  it('같은 점수는 `id` 오름차순으로 갈린다 — 서버 정렬과 같다', () => {
    const rows = rankClans([clan('z', 1, 3000), clan('a', 1, 3000)], { byTier: false })
    expect(rows.map((row) => row.id)).toEqual(['a', 'z'])
  })

  it('원본 배열을 건드리지 않는다', () => {
    const input = [clan('b', 1, 100), clan('a', 1, 900)]
    rankClans(input, { byTier: false })
    expect(input.map((row) => row.id)).toEqual(['b', 'a'])
  })
})

describe('클랜랭킹 — 티어 리그 (지시 #24 ⑤ · 티어표를 넘나들 수 없다)', () => {
  it('티어 오름차순 → 그 안에서 래더 내림차순', () => {
    const rows = rankClans(
      [clan('t2-high', 2, 5000), clan('t1-low', 1, 100), clan('t1-high', 1, 900)],
      { byTier: true },
    )

    expect(rows.map((row) => row.id)).toEqual(['t1-high', 't1-low', 't2-high'])
  })

  it('★순위가 티어마다 1 부터 다시 시작한다★', () => {
    const rows = rankClans(
      [
        clan('a1', 1, 900),
        clan('a2', 1, 800),
        clan('c1', 2, 700),
        clan('c2', 2, 600),
        clan('d1', 3, 500),
      ],
      { byTier: true },
    )

    expect(rows.map((row) => [row.id, row.rank])).toEqual([
      ['a1', 1],
      ['a2', 2],
      ['c1', 1],
      ['c2', 2],
      ['d1', 1],
    ])
  })

  it('점수가 아무리 높아도 아래 티어가 위 티어를 넘지 못한다', () => {
    const rows = rankClans([clan('t3', 3, 99999), clan('t1', 1, 1)], { byTier: true })
    expect(rows[0]?.id).toBe('t1')
  })

  it('빈 목록은 빈 목록이다 — 없는 순위를 지어내지 않는다', () => {
    expect(rankClans([], { byTier: true })).toEqual([])
  })
})

/* 2026-09-24 사장님 — 표본이 적은 클랜(50경기 미만)은 래더가 높아도 뒤로 (공식은 안 건드린다 · 정렬만) */
describe('rankClans minGames', () => {
  it('경기 수가 minGames 미만이면 충분히 뛴 클랜 뒤에 선다 · 그 안에서는 래더순', () => {
    const rows = rankClans(
      [
        { id: 'fresh-high', division: 1, rating: 3300, win: 7, lose: 8 },
        { id: 'vet-low', division: 1, rating: 3100, win: 250, lose: 180 },
        { id: 'vet-high', division: 1, rating: 3200, win: 200, lose: 200 },
        { id: 'fresh-low', division: 1, rating: 3250, win: 4, lose: 27 },
      ],
      { byTier: false, minGames: 50 },
    )
    expect(rows.map((r) => [r.id, r.rank])).toEqual([
      ['vet-high', 1],
      ['vet-low', 2],
      ['fresh-high', 3],
      ['fresh-low', 4],
    ])
  })
  it('minGames 를 안 주면 옛 판 그대로(래더순)', () => {
    const rows = rankClans(
      [
        { id: 'fresh', division: 1, rating: 3300, win: 1, lose: 0 },
        { id: 'vet', division: 1, rating: 3200, win: 300, lose: 100 },
      ],
      { byTier: false },
    )
    expect(rows.map((r) => r.id)).toEqual(['fresh', 'vet'])
  })
})
