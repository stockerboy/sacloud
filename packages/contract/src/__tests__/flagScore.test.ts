import { describe, expect, it } from 'vitest'
import {
  FLAG_GATE_RAW,
  FLAG_MIN_GAMES,
  FLAG_MIN_WIN_RATE,
  dayAxisParts,
  dayAxisScores,
  dayAxisValues,
  flagPercentile,
  flagPercentileMid,
  saveScaleOf,
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
  /* ★4번 축 «평균 사망 시간»★ (2026-09-16 사장님) — 261초를 세 번에 = 87초 */
  deathSeconds: 261,
  deathCount: 3,
  burstRounds: 9,
  /* ★캐리력은 «한 라운드 최대 킬»★ (2026-09-15 사장님) — 3킬을 두 번 낸 판 */
  maxRoundKills: 3,
  maxRoundTimes: 2,
  /* ★3번 축 «게임영향력»★ — 우위를 만든 킬 (2026-09-15) */
  evenKills: 30,
  /* ★5번 축 «교환율»★ — 동료가 죽은 직후 그 킬러를 되잡은 수 / 동료가 죽은 수 */
  tradeKills: 9,
  mateDeaths: 30,
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
    /*
     * ⚠ ★같은 날 세 번째 뜻★ — 게임영향력은 이제 «우위를 만든 킬 ÷ 라운드» 다
     *   (사장님: «킬을 가장 많이했다고 무조건 걔가 잘한것처럼 되는 그 구조가 싫은거야»).
     *   30킬 / 60라운드 = 라운드당 0.5회 → 50%.
     *   옛 기대값 — 60 (3킬을 «적 다섯 중 셋» 으로 본 판) · 그 전 — 10 (판당 킬)
     */
    expect(v.carry).toBe(50)
    /*
     * ★평균 사망 시간★ (2026-09-16 사장님) — 죽은 시각 합 ÷ 죽은 수.
     * ⚠ 옛 ④ 선짤은 «판당 몇 번» 이라 12회/6판 = 2 였다.
     */
    expect(v.survival).toBe(87)
    /*
     * ⚠ ★5번 축이 «연속킬» 에서 «교환율» 로 바뀌었다★ (2026-09-15 사장님 «교환율로 해줘»).
     *   9번 되갚음 / 동료 죽음 30번 = 30%. 옛 기대값 — 1.5 (판당 연속킬 회수)
     */
    expect(v.burst).toBe(30)
    expect(v.outnumbered).toBeCloseTo(55.6, 1)
  })

  /*
   * ⚠ ★옛 게임영향력(«한 라운드 최대 킬») 의 시험들은 내렸다★ (2026-09-15).
   *   그 축은 같은 날 «우위를 만든 킬» 로 바뀌었다. 옛 식(`influencePercentOf`)과
   *   그 눈금 상수는 지우지 않았으니 되살릴 때 시험도 git 에서 꺼내 온다.
   */
  it('★게임영향력 — 라운드당 1회가 100%★ (2026-09-15 사장님)', () => {
    /* 우위를 만든 킬을 라운드로 나눈다. 60라운드에 60번이면 꽉 찬다 */
    expect(dayAxisValues(tally({ rounds: 60, evenKills: 0 })).carry).toBe(0)
    expect(dayAxisValues(tally({ rounds: 60, evenKills: 15 })).carry).toBe(25)
    expect(dayAxisValues(tally({ rounds: 60, evenKills: 60 })).carry).toBe(100)
    /* 라운드당 한 번을 넘겨도 100% 를 안 넘는다 */
    expect(dayAxisValues(tally({ rounds: 60, evenKills: 90 })).carry).toBe(100)
    /* 라운드를 모르면 못 잰다 — 0 이라 우기지 않는다 */
    expect(dayAxisValues(tally({ rounds: 0 })).carry).toBeNull()
  })

  it('★교환율 — 동료가 죽은 직후 되갚은 비율★ (2026-09-15 사장님)', () => {
    expect(dayAxisValues(tally({ tradeKills: 9, mateDeaths: 30 })).burst).toBe(30)
    expect(dayAxisValues(tally({ tradeKills: 0, mateDeaths: 30 })).burst).toBe(0)
    /* 동료가 한 번도 안 죽었으면 잴 것이 없다 — 랭킹에서는 null */
    expect(dayAxisValues(tally({ tradeKills: 0, mateDeaths: 0 })).burst).toBeNull()
    /* 한 판 설명에서는 0 으로 적는다 (다른 축과 같은 규칙) */
    expect(dayAxisValues(tally({ tradeKills: 0, mateDeaths: 0 }), FLAG_GATE_RAW).burst).toBe(0)
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

describe('★한 판 문턱★ FLAG_GATE_RAW — 0/0 은 0% 다 (2026-09-15 사장님)', () => {
  /*
   * > «세이브 상황없었으면 0%(0/0) 있었는디 못해도 0%(0/1) 두번중한번하면(1/2) 50% 이런식»
   *
   * 경기 상세는 ★줄을 세우는 자리가 아니다.★ 그래서 «못 잼»(null) 을 두지 않고
   * «없었다» 를 0 으로 적는다. 랭킹은 반대다 — 바로 밑 시험이 그걸 지킨다.
   */
  it('상황이 아예 없었으면 0% 다 (0/0)', () => {
    const v = dayAxisValues(tally({ aloneRounds: 0, aloneWon: 0, outRounds: 0, outWon: 0 }), FLAG_GATE_RAW)
    expect(v.save).toBe(0)
    expect(v.outnumbered).toBe(0)
  })

  it('한 번 있었는데 못했으면 0% 다 (0/1)', () => {
    expect(dayAxisValues(tally({ aloneRounds: 1, aloneWon: 0 }), FLAG_GATE_RAW).save).toBe(0)
  })

  it('두 번 중 한 번이면 50% 다 (1/2)', () => {
    expect(dayAxisValues(tally({ aloneRounds: 2, aloneWon: 1 }), FLAG_GATE_RAW).save).toBe(50)
  })

  it('★무기를 몰라도 싸움은 0% 다★ — 한 판 설명에서는 빈칸을 두지 않는다', () => {
    expect(dayAxisValues(tally({ weapon: null }), FLAG_GATE_RAW).duel).toBe(0)
  })

  it('★랭킹은 그대로 null 이다★ — 안 겪은 사람을 못한 사람과 같이 깔면 안 된다', () => {
    expect(dayAxisValues(tally({ aloneRounds: 0, aloneWon: 0 })).save).toBeNull()
  })
})

describe('dayAxisParts — «몇 번 중 몇 번»', () => {
  it('세이브는 이긴 수 / 혼자 남은 수', () => {
    const p = dayAxisParts(tally({ aloneRounds: 2, aloneWon: 1 }))
    expect(p.save).toEqual({ numerator: 1, denominator: 2 })
  })

  it('★평균 사망 시간은 분모가 「죽은 수」다★ (2026-09-16 사장님)', () => {
    const p = dayAxisParts(tally({ deathSeconds: 261, deathCount: 3 }))
    expect(p.survival).toEqual({ numerator: 261, denominator: 3 })
  })

  it('★평균 사망 시간 — 261초를 세 번에 나누면 87초★', () => {
    expect(dayAxisValues(tally({ deathSeconds: 261, deathCount: 3 })).survival).toBe(87)
  })

  it('죽은 적이 없으면 잴 수 없다 — 0 이라고 적지 않는다 (D-106)', () => {
    expect(dayAxisValues(tally({ deathSeconds: 0, deathCount: 0 })).survival).toBeNull()
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

describe('★flagPercentileMid★ — 동점을 가운데로 (한 판 육각용)', () => {
  it('★동점이 여럿이면 다 같은 가운데 값★ — 바닥에 깔리지 않는다', () => {
    /* 열 명 중 일곱이 0 인 판. 옛 방식이면 일곱 다 0 백분위라 도형이 찌그러졌다 */
    const pool = [0, 0, 0, 0, 0, 0, 0, 40, 60, 80]
    expect(flagPercentile(pool, 0)).toBe(0)
    expect(flagPercentileMid(pool, 0)).toBe(35)
  })

  it('혼자 꼭대기면 거의 100, 혼자 바닥이면 거의 0', () => {
    const pool = [10, 20, 30, 40]
    expect(flagPercentileMid(pool, 40)).toBe(87.5)
    expect(flagPercentileMid(pool, 10)).toBe(12.5)
  })

  it('순서는 뒤집히지 않는다 — 높은 값이 늘 더 크다', () => {
    const pool = [10, 10, 30, 30, 50]
    const a = flagPercentileMid(pool, 10) as number
    const b = flagPercentileMid(pool, 30) as number
    const c = flagPercentileMid(pool, 50) as number
    expect(a).toBeLessThan(b)
    expect(b).toBeLessThan(c)
  })

  it('못 잰 값이나 빈 모집단이면 null', () => {
    expect(flagPercentileMid([1, 2], null)).toBeNull()
    expect(flagPercentileMid([], 1)).toBeNull()
  })
})

describe('★선짤 잣대★ — 무기 기준값으로 나눈다 (2026-09-15 사장님)', () => {
  it('같은 «판당 회수» 라도 라플이 더 위다 — 스나가 2.62배 유리한 것을 지운다', () => {
    const sniper = tally({ weapon: 1, games: 10, firstKills: 23 })
    const rifle = tally({
      weapon: 0, games: 10, firstKills: 23,
      rifleDuelWon: 20, rifleDuelLost: 10, sniperDuelWon: 0, sniperDuelLost: 0,
    })
    /*
     * ⚠ ★뜻이 바뀐 시험이다★ — 2026-09-16 에 ④ 가 «평균 사망 시간» 이 되면서
     *   ★기준선으로 나누지 않는다.★ 스나는 스나끼리, 라플은 라플끼리 견주기 때문에
     *   («스나수는 스나수끼리 비교하고 라플수는 라플수끼리») 무기별 보정이 필요 없다.
     *   옛 판(선짤 기준선 나누기)은 `openingScoreOf` 에 그대로 남아 있다.
     */
    const withDeaths = (t: FlagDayTally): FlagDayTally => ({ ...t, deathSeconds: 261, deathCount: 3 })
    expect(dayAxisValues(withDeaths(sniper)).survival).toBe(87)
    expect(dayAxisValues(withDeaths(rifle)).survival).toBe(87)
    /* 잣대도 값 그대로다 — 무기로 밀어 주지 않는다 */
    expect(dayAxisScores(withDeaths(sniper)).survival).toBe(
      dayAxisScores(withDeaths(rifle)).survival,
    )
  })
})

describe('★saveScaleOf★ — 세이브는 횟수 고정 눈금 (2026-09-15 사장님)', () => {
  it('0회면 그래프가 움직이지 않는다', () => {
    expect(saveScaleOf(0)).toBe(0)
  })

  it('★1회는 중간 육각 테두리★ (0.66)', () => {
    expect(saveScaleOf(1)).toBe(66)
  })

  it('★4회는 가장 큰 육각 테두리★', () => {
    expect(saveScaleOf(4)).toBe(100)
  })

  it('2·3회는 그 사이를 고르게 나눈 자리다', () => {
    expect(saveScaleOf(2)).toBeGreaterThan(66)
    expect(saveScaleOf(2)).toBeLessThan(saveScaleOf(3) as number)
    expect(saveScaleOf(3)).toBeLessThan(100)
  })

  it('★5회 이상은 4회로 친다★ — 테두리를 넘지 않는다', () => {
    expect(saveScaleOf(5)).toBe(100)
    expect(saveScaleOf(12)).toBe(100)
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
