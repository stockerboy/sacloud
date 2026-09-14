import { describe, expect, it } from 'vitest'
import {
  FLAG_MIN_GAMES,
  FLAG_MIN_WIN_RATE,
  dayAxisValues,
  flagPercentile,
  rankFlagDay,
  type FlagDayTally,
} from '../flagScore'

/**
 * ★깃발 점수★ (2026-09-15 사장님: «막 경쟁해서 새벽 3시에 1등인 사람이 깃발 꽂고»).
 *
 * 줄 세우기가 틀려도 화면은 안 죽는다 — ★엉뚱한 사람이 깃발을 받을 뿐이다.★
 * 그래서 «누가 빠지나» 를 한 줄씩 박아 둔다.
 */

/** 기본이 넉넉한 하루치 — 시험마다 필요한 칸만 덮어쓴다 */
const tally = (over: Partial<FlagDayTally> = {}): FlagDayTally => ({
  games: 6,
  win: 4,
  lose: 2,
  kill: 60,
  death: 50,
  rounds: 60,
  firstKills: 12,
  burstRounds: 9,
  aloneRounds: 8,
  aloneWon: 4,
  outRounds: 9,
  outWon: 5,
  sniperDuelWon: 20,
  sniperDuelLost: 10,
  rifleDuelWon: 0,
  rifleDuelLost: 0,
  weapon: 1,
  ...over,
})

describe('dayAxisValues — 표본이 모자라면 null (0 으로 안 채운다)', () => {
  it('넉넉하면 여섯 축이 다 나온다', () => {
    const v = dayAxisValues(tally())
    expect(v.save).toBe(50)
    expect(v.duel).toBeCloseTo(66.7, 1)
    expect(v.carry).toBe(10)
    expect(v.opening).toBe(20)
    expect(v.burst).toBe(15)
    expect(v.outnumbered).toBeCloseTo(55.6, 1)
  })

  it('★혼자 남은 라운드가 적으면 세이브는 null★', () => {
    expect(dayAxisValues(tally({ aloneRounds: 2, aloneWon: 2 })).save).toBeNull()
  })

  it('★싸움 표본이 적으면 싸움은 null★', () => {
    expect(dayAxisValues(tally({ sniperDuelWon: 2, sniperDuelLost: 1 })).duel).toBeNull()
  })

  it('★주무기를 모르면 싸움은 null★ — 어느 쪽 수치를 볼지 못 정한다', () => {
    expect(dayAxisValues(tally({ weapon: null })).duel).toBeNull()
  })

  it('라플이면 라플 싸움을 본다', () => {
    const v = dayAxisValues(tally({ weapon: 0, rifleDuelWon: 15, rifleDuelLost: 5 }))
    expect(v.duel).toBe(75)
  })
})

describe('flagPercentile', () => {
  it('나보다 낮은 사람의 비율이다', () => {
    expect(flagPercentile([10, 20, 30, 40], 30)).toBe(50)
    expect(flagPercentile([10, 20, 30, 40], 10)).toBe(0)
    expect(flagPercentile([10, 20, 30, 40], 99)).toBe(100)
  })

  it('못 잰 값이나 빈 모집단이면 null', () => {
    expect(flagPercentile([10, 20], null)).toBeNull()
    expect(flagPercentile([], 10)).toBeNull()
  })
})

describe('rankFlagDay — 누가 깃발을 다투나', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      ref: `p${i}`,
      tally: tally({ kill: 40 + i * 4, aloneWon: 2 + (i % 6), outWon: 2 + (i % 6) }),
    }))

  it('점수가 높은 순으로 셋만 준다', () => {
    const out = rankFlagDay(many(10))
    expect(out).toHaveLength(3)
    expect(out.map((r) => r.rank)).toEqual([1, 2, 3])
    expect(out[0]!.score).toBeGreaterThanOrEqual(out[1]!.score)
    expect(out[1]!.score).toBeGreaterThanOrEqual(out[2]!.score)
  })

  it(`★그날 ${FLAG_MIN_GAMES}판을 못 채우면 빠진다★`, () => {
    const out = rankFlagDay([
      { ref: 'few', tally: tally({ games: FLAG_MIN_GAMES - 1, win: 3, lose: 0 }) },
      ...many(4),
    ])
    expect(out.map((r) => r.ref)).not.toContain('few')
  })

  it(`★그날 승률이 ${FLAG_MIN_WIN_RATE}% 미만이면 빠진다★ — 진 날은 안 올린다`, () => {
    const out = rankFlagDay([
      { ref: 'lost', tally: tally({ games: 10, win: 4, lose: 6 }) },
      ...many(4),
    ])
    expect(out.map((r) => r.ref)).not.toContain('lost')
  })

  it('★못 잰 축이 하나라도 있으면 빠진다★ — 고르게 잘했는지 말할 수 없다', () => {
    const out = rankFlagDay([
      { ref: 'partial', tally: tally({ aloneRounds: 1, aloneWon: 1 }) },
      ...many(4),
    ])
    expect(out.map((r) => r.ref)).not.toContain('partial')
  })

  it('★아무도 못 채우면 빈 배열★ — 억지로 셋을 채우지 않는다', () => {
    expect(rankFlagDay([{ ref: 'a', tally: tally({ games: 1, win: 1, lose: 0 }) }])).toEqual([])
    expect(rankFlagDay([])).toEqual([])
  })

  it('★백분위는 그날 뛴 사람들 안에서 낸다★ — 혼자면 축이 전부 0 이다', () => {
    const out = rankFlagDay([{ ref: 'only', tally: tally() }])
    expect(out).toHaveLength(1)
    expect(out[0]!.axes.every((a) => a.pct === 0)).toBe(true)
  })

  it('★킬뎃은 킬÷(킬+데스) 다★ — 120% 같은 값이 나오면 안 된다', () => {
    const out = rankFlagDay([{ ref: 'x', tally: tally({ kill: 60, death: 40 }) }])
    expect(out[0]!.kdRate).toBe(60)
    expect(out[0]!.kdRate).toBeLessThanOrEqual(100)
  })

  it('킬도 데스도 0 이면 킬뎃은 null — 0% 라고 우기지 않는다', () => {
    const out = rankFlagDay([{ ref: 'x', tally: tally({ kill: 0, death: 0 }) }])
    expect(out[0]!.kdRate).toBeNull()
  })
})
