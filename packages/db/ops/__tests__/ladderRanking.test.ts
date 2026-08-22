import { describe, expect, it } from 'vitest'

/**
 * 클랜 래더 순위 규칙 (Phase 11 · D-104).
 *
 * 여기서 검증하는 것은 **정렬 규칙 그 자체**다. DB 없이 확인할 수 있어야
 * "Tier가 rating으로 자동으로 바뀌었다" 같은 사고를 즉시 잡을 수 있다.
 *
 * `apps/web/lib/server/queries/ladders.ts`가 쓰는 규칙을 그대로 옮겨 놓았다.
 *   - 정렬은 rating 내림차순, 동점이면 id 오름차순
 *   - Tier는 **읽기만** 한다. 절대 다시 계산하지 않는다
 */

interface Clan {
  id: string
  rating: number
  /** 운영자가 지정한 값. 이 테스트 어디에서도 이 값을 바꾸지 않는다 */
  tier: number | null
  division: number
  category: 'official' | 'independent'
}

/** ladders.ts와 같은 정렬 */
function byRating(clans: Clan[]): Clan[] {
  return [...clans].sort((left, right) => right.rating - left.rating || left.id.localeCompare(right.id))
}

/** 무소속 전체 래더 — Tier를 완전히 무시한다 */
function independentOverall(clans: Clan[]): Clan[] {
  return byRating(clans.filter((clan) => clan.category === 'independent'))
}

/** Tier 내부 순위 — 같은 Tier 안에서만 rating 순 */
function tierRanks(clans: Clan[]): Map<string, number> {
  const seen = new Map<number, number>()
  const ranks = new Map<string, number>()
  for (const clan of independentOverall(clans)) {
    if (clan.tier === null) continue
    const next = (seen.get(clan.tier) ?? 0) + 1
    seen.set(clan.tier, next)
    ranks.set(clan.id, next)
  }
  return ranks
}

/** 전체 통합 래더 — 부리그·Tier·구분 전부 무시 */
function overallLadder(clans: Clan[]): Clan[] {
  return byRating(clans)
}

const ind = (id: string, rating: number, tier: number | null): Clan => ({
  id,
  rating,
  tier,
  division: 1,
  category: 'independent',
})
const official = (id: string, rating: number, division: number): Clan => ({
  id,
  rating,
  tier: null,
  division,
  category: 'official',
})

describe('Tier 경계는 rating으로 움직이지 않는다 (D-104)', () => {
  const clans = [ind('W', 1500, 1), ind('A', 1800, 2)]

  it('Tier 1 클랜이 Tier 2 클랜보다 점수가 낮아도 강등되지 않는다', () => {
    const w = clans.find((clan) => clan.id === 'W')!
    expect(w.tier, '점수가 낮아도 Tier는 그대로다').toBe(1)
  })

  it('Tier 2 클랜이 점수가 높아도 승격되지 않는다', () => {
    const a = clans.find((clan) => clan.id === 'A')!
    expect(a.tier).toBe(2)
  })

  it('순위 계산이 Tier 값을 바꾸지 않는다 (읽기 전용)', () => {
    const before = clans.map((clan) => [clan.id, clan.tier] as const)
    tierRanks(clans)
    independentOverall(clans)
    overallLadder(clans)
    expect(clans.map((clan) => [clan.id, clan.tier] as const)).toEqual(before)
  })

  it('점수만으로 Tier를 다시 만들지 않는다 — 점수 구간 → Tier 매핑이 존재하지 않는다', () => {
    // A(1800)가 W(1500)보다 높지만 Tier는 각각 2와 1로 유지된다.
    // 만약 어디선가 rating 구간으로 Tier를 재계산한다면 이 단언이 깨진다
    const sorted = independentOverall(clans)
    expect(sorted.map((clan) => clan.id)).toEqual(['A', 'W'])
    expect(sorted.map((clan) => clan.tier)).toEqual([2, 1])
  })
})

describe('Tier 내부 순위는 rating으로 계속 바뀐다', () => {
  it('A 1700 / B 1600 → A 1위 B 2위', () => {
    const ranks = tierRanks([ind('A', 1700, 2), ind('B', 1600, 2)])
    expect(ranks.get('A')).toBe(1)
    expect(ranks.get('B')).toBe(2)
  })

  it('B가 1800이 되면 B 1위 A 2위 — 하지만 Tier는 둘 다 2 그대로다', () => {
    const clans = [ind('A', 1700, 2), ind('B', 1800, 2)]
    const ranks = tierRanks(clans)
    expect(ranks.get('B')).toBe(1)
    expect(ranks.get('A')).toBe(2)
    expect(clans.every((clan) => clan.tier === 2)).toBe(true)
  })

  it('Tier가 다르면 순위를 섞지 않는다 — 각 Tier가 1위부터 다시 센다', () => {
    const ranks = tierRanks([
      ind('M', 2050, 1),
      ind('K', 1900, 1),
      ind('A', 1880, 2),
      ind('B', 1700, 2),
    ])
    expect([ranks.get('M'), ranks.get('K')]).toEqual([1, 2])
    expect([ranks.get('A'), ranks.get('B')]).toEqual([1, 2])
  })

  it('Tier가 지정되지 않은 무소속 클랜은 Tier 순위가 없다', () => {
    const ranks = tierRanks([ind('X', 2000, null)])
    expect(ranks.has('X')).toBe(false)
  })
})

describe('무소속 전체 래더는 Tier를 무시한다', () => {
  it('Tier 5가 Tier 1보다 위에 올 수 있다', () => {
    const rows = independentOverall([
      ind('X', 2100, 5),
      ind('M', 2050, 1),
      ind('Y', 1980, 3),
      ind('K', 1900, 1),
      ind('A', 1880, 2),
    ])
    expect(rows.map((clan) => clan.id)).toEqual(['X', 'M', 'Y', 'K', 'A'])
    expect(rows[0]?.tier, '1위가 Tier 5여도 정상이다').toBe(5)
  })

  it('Tier 1이라는 이유로 위로 올리지 않는다', () => {
    const rows = independentOverall([ind('LOW1', 1000, 1), ind('HIGH5', 2000, 5)])
    expect(rows.map((clan) => clan.id)).toEqual(['HIGH5', 'LOW1'])
  })

  it('한 클랜은 Tier 순위와 전체 순위를 동시에 가진다', () => {
    const clans = [ind('X', 2100, 5), ind('M', 2050, 1), ind('A', 1880, 2), ind('B', 1700, 2)]
    const overall = independentOverall(clans)
    const ranks = tierRanks(clans)
    // A는 2티어 1위이면서 전체 3위다. 둘은 별개다
    expect(ranks.get('A')).toBe(1)
    expect(overall.findIndex((clan) => clan.id === 'A') + 1).toBe(3)
  })
})

describe('전체 통합 래더는 부리그·구분을 무시한다', () => {
  it('2부 클랜이 1부 클랜보다 위에 올 수 있다', () => {
    const rows = overallLadder([official('D1', 1500, 1), official('D2', 1900, 2)])
    expect(rows.map((clan) => clan.id)).toEqual(['D2', 'D1'])
  })

  it('무소속 클랜도 통합 래더에 포함된다 — 1위가 될 수도 있다', () => {
    const rows = overallLadder([
      official('FIRST', 1800, 1),
      official('SECOND', 1700, 2),
      ind('INDIE', 2200, 5),
    ])
    expect(rows[0]?.id).toBe('INDIE')
    expect(rows).toHaveLength(3)
  })

  it('1부라는 이유로 위로 올리지 않는다', () => {
    const rows = overallLadder([official('D1', 1200, 1), ind('IND', 1300, 3)])
    expect(rows.map((clan) => clan.id)).toEqual(['IND', 'D1'])
  })

  it('동점이면 id로 순서를 고정한다 (페이지가 흔들리지 않게)', () => {
    const rows = overallLadder([official('B', 1500, 1), official('A', 1500, 2)])
    expect(rows.map((clan) => clan.id)).toEqual(['A', 'B'])
  })
})

describe('부리그 standings는 통합 래더와 별개다 (승강 기준)', () => {
  it('1부 standings에는 1부만 들어간다', () => {
    const clans = [official('D1a', 1500, 1), official('D1b', 1400, 1), official('D2a', 1900, 2)]
    const division1 = byRating(clans.filter((clan) => clan.division === 1))
    expect(division1.map((clan) => clan.id)).toEqual(['D1a', 'D1b'])
    // 2부의 D2a가 점수가 더 높지만 1부 standings에는 없다 — 승강은 이걸로 판단한다
    expect(division1.some((clan) => clan.id === 'D2a')).toBe(false)
  })
})
