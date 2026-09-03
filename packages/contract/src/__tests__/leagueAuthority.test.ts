import { describe, expect, it } from 'vitest'
import { authorityOf, rankScore, unifiedScore } from '../leagueAuthority'

/**
 * **통합 순위가 사장님 뜻대로 나오는가** (O-043 · 2026-09-03).
 *
 * ★사장님이 이 판을 요구하신 이유가 확인 칸이다★ — 「신뢰를 안할까봐」.
 * 그래서 숫자가 아니라 ★결과의 순서★ 를 검사한다.
 */
describe('리그 권위', () => {
  it('★사장님이 주신 승률을 재현한다★ (Elo 400 환산 · ±1판)', () => {
    /* 두 리그 권위 차이 d → 기대 승률 = 1 / (1 + 10^(−d/400)) */
    const winPct = (a: number, b: number) => 100 / (1 + 10 ** (-(a - b) / 400))
    const ipl12 = authorityOf('nolink', 1)!.eloBonus
    const spl = authorityOf('supply', 1)!.eloBonus
    const san = authorityOf('sanply', 1)!.eloBonus
    const ipl56 = authorityOf('nolink', 5)!.eloBonus

    expect(Math.round(winPct(spl, san))).toBeCloseTo(65, 0) /* SPL vs 열산 65판 */
    expect(Math.round(winPct(ipl12, spl))).toBeCloseTo(70, 0) /* IPL1,2 vs SPL 70판 */
    expect(Math.round(winPct(ipl56, san))).toBeCloseTo(50, 0) /* IPL5,6 vs 열산 50판 */
  })

  it('daerule 은 통합 순위에 안 들어간다 (없는 리그 · O-042)', () => {
    expect(authorityOf('daerule', 1)).toBeNull()
    expect(unifiedScore([{ leagueSlug: 'daerule', division: 1, rank: 1, total: 100 }])).toBe(0)
  })
})

describe('등수 점수', () => {
  it('1등 100 · 꼴등 0 · 사이는 고르게', () => {
    expect(rankScore(1, 101)).toBe(100)
    expect(rankScore(101, 101)).toBe(0)
    expect(rankScore(51, 101)).toBe(50)
  })

  it('혼자면 100 (나눌 수가 없다)', () => {
    expect(rankScore(1, 1)).toBe(100)
  })
})

describe('★통합 점수 — 사장님이 못박으신 결과★', () => {
  it('★열산만 1위인 사람은 통합 1위가 못 된다★', () => {
    /* > «열산 1위가 통합 1위가 될수는 없다» */
    const sanOnly = unifiedScore([{ leagueSlug: 'sanply', division: 1, rank: 1, total: 1000 }])
    const splAndSan = unifiedScore([
      { leagueSlug: 'supply', division: 1, rank: 1, total: 400 },
      { leagueSlug: 'sanply', division: 1, rank: 1, total: 1000 },
    ])
    expect(sanOnly).toBe(100)
    expect(splAndSan).toBe(300)
    expect(splAndSan).toBeGreaterThan(sanOnly)
  })

  it('★사장님 예시가 재현된다★ — IPL 20판 + SPL 1등 + 열산 1등 > 열산만 1등', () => {
    /*
     * > «IPL 기록20판(4-5티어물) SPL 400판 1위 열산 1000판 1위 이렇게 해서
     * >  통합 1등이 될수는 있다. 근데 열산판수도 많고 승률도 높아야한다»
     * IPL 은 판수가 적어 등수가 낮다 — 그래도 SPL·열산 1등이 받쳐 준다
     */
    const 사장님예시 = unifiedScore([
      { leagueSlug: 'nolink', division: 4, rank: 900, total: 1000 } /* 20판 → 하위 */,
      { leagueSlug: 'supply', division: 1, rank: 1, total: 400 },
      { leagueSlug: 'sanply', division: 1, rank: 1, total: 1000 },
    ])
    const 열산만 = unifiedScore([{ leagueSlug: 'sanply', division: 1, rank: 1, total: 1000 }])
    expect(사장님예시).toBeGreaterThan(열산만)
  })

  it('★판수만 늘려서는 안 오른다★ — 등수 점수라 1등을 해야 오른다', () => {
    const 많이뛰고꼴등 = unifiedScore([{ leagueSlug: 'supply', division: 1, rank: 400, total: 400 }])
    const 적게뛰고1등 = unifiedScore([{ leagueSlug: 'supply', division: 1, rank: 1, total: 400 }])
    expect(많이뛰고꼴등).toBe(0)
    expect(적게뛰고1등).toBeGreaterThan(많이뛰고꼴등)
  })

  it('★IPL 1,2티어가 제일 무겁다★ (3배)', () => {
    const ipl12 = unifiedScore([{ leagueSlug: 'nolink', division: 1, rank: 1, total: 100 }])
    const spl = unifiedScore([{ leagueSlug: 'supply', division: 1, rank: 1, total: 100 }])
    const san = unifiedScore([{ leagueSlug: 'sanply', division: 1, rank: 1, total: 100 }])
    expect(ipl12).toBe(300)
    expect(spl).toBe(200)
    expect(san).toBe(100)
  })
})
