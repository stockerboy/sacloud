/**
 * 클랜 육각형 **V2** (`../clanTraitsV2` · D-235).
 *
 * 여기서 잡으려는 것은 **틀려도 그림이 멀쩡해 보이는** 종류의 버그다.
 * 육각형은 넓이만 보여 주므로 값이 조용히 틀려도 눈으로는 안 잡힌다. 특히 둘:
 *
 * ```
 * ① 비율을 다시 평균 내기        5라운드 경기가 18라운드 경기와 같은 무게를 갖는다
 * ② 못 잰 축을 0 으로 찍기       "아직 모른다" 가 "못한다" 로 바뀐다 (D-106)
 * ```
 *
 * 둘 다 그럴듯한 그림을 그리기 때문에 **테스트로 못 박는다.**
 */
import { describe, expect, it } from 'vitest'
import {
  CLAN_HEX_V2_AXIS_KEYS,
  CLAN_HEX_V2_AXIS_LABELS,
  CLAN_HEX_V2_CONFIG,
  CLAN_HEX_V2_LOWER_IS_BETTER,
  CLAN_HEX_V2_MIN_SAMPLES,
  CLAN_HEX_V2_ZONE_LABELS_TOTAL,
  ClanHexagonV2,
  buildClanHexV2Raw,
  normalizeAgainstFoe,
  normalizeByPercentile,
  sumClanHexTallies,
  type ClanHexTallyLike,
  type ClanHexV2,
  type ClanHexV2AxisKey,
} from '../clanTraitsV2'

/** 여섯 축이 전부 `null` 인 tally — 「배틀로그는 읽었는데 아무것도 못 쟀다」 */
function emptyTally(over: Partial<ClanHexTallyLike> = {}): ClanHexTallyLike {
  return {
    teamNo: '1',
    foeTeamNo: '2',
    rounds: 0,
    sidedRounds: 0,
    redRounds: 0,
    foeSnipers: 1,
    sniperFight: null,
    outnumbered: null,
    save: null,
    tempo: null,
    lastSniper: null,
    attackZone: null,
    ...over,
  }
}

/** 여섯 축이 다 차는 tally. 숫자는 시험용 표본이지 운영 데이터가 아니다 */
function fullTally(over: Partial<ClanHexTallyLike> = {}): ClanHexTallyLike {
  return emptyTally({
    rounds: 16,
    sidedRounds: 16,
    redRounds: 8,
    sniperFight: {
      redRounds: 8,
      foeSniperKills: 6,
      killsWithPosition: { byKiller: 6, byVictim: 6 },
      aSideKills: { byKiller: 2, byVictim: 3 },
      bLongKills: { byKiller: 2, byVictim: 1 },
      unzonedKills: { byKiller: 2, byVictim: 2 },
    },
    outnumbered: { rounds: 10, won: 4 },
    save: { rounds: 5, won: 2 },
    tempo: {
      redRounds: 8,
      redClearThreeRounds: 4,
      redClearThreeSecondsLowerBound: [10, 20, 20, 22],
      redClearThreeSecondsLowerBoundSum: 72,
      redRoundsWithoutThreeClears: 4,
    },
    lastSniper: {
      redWonRounds: 5,
      redWonSniperLast: 2,
      wonRounds: 9,
      wonSniperLast: 4,
      noFoeDeathRounds: 0,
      unknownLastWeaponRounds: 0,
      ambiguousLastRounds: 0,
    },
    attackZone: {
      redRounds: 8,
      redWonRounds: 5,
      redWonZoneSniperRounds: { byKiller: 1, byVictim: 3 },
      redLostZoneSniperRounds: { byKiller: 0, byVictim: 1 },
      sniperKillsWithPosition: { byKiller: 6, byVictim: 6 },
      sniperKillsInNamedZone: { byKiller: 1, byVictim: 4 },
      sniperKillsOutsideNamedZone: { byKiller: 5, byVictim: 2 },
      zoneLabels: ['CONDWI', 'SEOLDAE'],
    },
    ...over,
  })
}

/** 표본에서 하위 tally 를 꺼낸다 — 시험 표본이 잘못됐으면 그 자리에서 터뜨린다 */
function required<T>(value: T | null): T {
  if (value === null) throw new Error('시험 표본이 잘못됐다')
  return value
}

function axisOf(hex: ClanHexV2, key: ClanHexV2AxisKey) {
  const axis = hex.axes.find((entry) => entry.key === key)
  if (axis === undefined) throw new Error(`축이 없다: ${key}`)
  return axis
}

/** 한 축만 재고 나머지는 못 잰 육각형 — 정규화 시험용 */
function oneAxis(key: ClanHexV2AxisKey, raw: number, denominator = 40): ClanHexV2 {
  const hex = buildClanHexV2Raw({ tally: emptyTally(), matches: 1 })
  const axis = axisOf(hex, key)
  axis.numerator = raw * denominator
  axis.denominator = denominator
  axis.raw = raw
  axis.pending = null
  return { ...hex, measured: 1 }
}

/* -------------------------------------------------------------------------- */

describe('축 목록', () => {
  it('언제나 6개이고 순서가 `CLAN_HEX_V2_AXIS_KEYS` 와 같다', () => {
    const cases: (ClanHexTallyLike | null)[] = [null, emptyTally(), fullTally()]
    for (const tally of cases) {
      const hex = buildClanHexV2Raw({ tally, matches: 1 })
      expect(hex.axes).toHaveLength(6)
      expect(hex.axes.map((axis) => axis.key)).toEqual([...CLAN_HEX_V2_AXIS_KEYS])
      expect(hex.axes.map((axis) => axis.label)).toEqual(
        CLAN_HEX_V2_AXIS_KEYS.map((key) => CLAN_HEX_V2_AXIS_LABELS[key]),
      )
    }
  })

  it('게임템포만 「짧을수록 좋다」이다', () => {
    const lower = CLAN_HEX_V2_AXIS_KEYS.filter((key) => CLAN_HEX_V2_LOWER_IS_BETTER[key])
    expect(lower).toEqual(['tempo'])
  })
})

describe('sumClanHexTallies — **비율을 평균 내지 않는다** (D-235 Q8)', () => {
  it('5라운드 100% 와 18라운드 0% 를 섞으면 50% 가 아니라 5/23 이다', () => {
    const short = fullTally({ outnumbered: { rounds: 5, won: 5 } })
    const long = fullTally({ outnumbered: { rounds: 18, won: 0 } })

    const sum = sumClanHexTallies([short, long])
    expect(sum.outnumbered).toEqual({ rounds: 23, won: 5 })

    const hex = buildClanHexV2Raw({ tally: sum, matches: 2 })
    const axis = axisOf(hex, 'outnumbered')
    expect(axis.numerator).toBe(5)
    expect(axis.denominator).toBe(23)
    expect(axis.raw).toBeCloseTo(5 / 23, 10)
    /* 비율 평균이었다면 0.5 였을 것이다. 그게 이 시험의 전부다 */
    expect(axis.raw).not.toBeCloseTo(0.5, 3)
    expect(axis.text).toBe('22%')
  })

  it('게임템포도 초의 **합**과 라운드의 **합**으로 나눈다', () => {
    const fast = fullTally({
      tempo: {
        redRounds: 3,
        redClearThreeRounds: 1,
        redClearThreeSecondsLowerBound: [10],
        redClearThreeSecondsLowerBoundSum: 10,
        redRoundsWithoutThreeClears: 2,
      },
    })
    const slow = fullTally({
      tempo: {
        redRounds: 9,
        redClearThreeRounds: 9,
        redClearThreeSecondsLowerBound: [30, 30, 30, 30, 30, 30, 30, 30, 30],
        redClearThreeSecondsLowerBoundSum: 270,
        redRoundsWithoutThreeClears: 0,
      },
    })

    const sum = sumClanHexTallies([fast, slow])
    expect(sum.tempo?.redClearThreeRounds).toBe(10)
    expect(sum.tempo?.redClearThreeSecondsLowerBound).toHaveLength(10)

    const axis = axisOf(buildClanHexV2Raw({ tally: sum, matches: 2 }), 'tempo')
    /* 경기 평균이었다면 (10 + 30) / 2 = 20초 였을 것이다 */
    expect(axis.raw).toBe(28)
    expect(axis.text).toBe('28.0초')
  })

  it('못 잰 경기(`null`)는 분모에 섞이지 않고, 전부 못 쟀으면 결과도 `null` 이다', () => {
    const measured = fullTally({ save: { rounds: 4, won: 3 } })
    const missing = fullTally({ save: null })
    expect(sumClanHexTallies([measured, missing]).save).toEqual({ rounds: 4, won: 3 })
    expect(sumClanHexTallies([missing, missing]).save).toBeNull()
  })

  it('구역을 안 준 경기의 `A쪽`·`B롱` 을 0 으로 섞지 않는다', () => {
    const zoned = fullTally()
    const unzoned = fullTally({
      sniperFight: {
        redRounds: 8,
        foeSniperKills: 4,
        killsWithPosition: { byKiller: 4, byVictim: 4 },
        aSideKills: null,
        bLongKills: null,
        unzonedKills: null,
      },
    })
    const sum = sumClanHexTallies([zoned, unzoned])
    expect(sum.sniperFight?.redRounds).toBe(16)
    expect(sum.sniperFight?.foeSniperKills).toBe(10)
    /* 구역을 준 경기의 값만 남는다 */
    expect(sum.sniperFight?.aSideKills).toEqual({ byKiller: 2, byVictim: 3 })
  })

  it('빈 배열은 「아무것도 못 잰」 tally 다 — 던지지 않는다', () => {
    const sum = sumClanHexTallies([])
    expect(sum.rounds).toBe(0)
    expect(sum.outnumbered).toBeNull()
    expect(buildClanHexV2Raw({ tally: sum, matches: 0 }).measured).toBe(0)
  })
})

describe('buildClanHexV2Raw — 못 잰 축은 `null` 이다. **0 이 아니다** (D-106)', () => {
  it('tally 자체가 없으면 여섯 축이 전부 `null` · `측정중` 이다', () => {
    const hex = buildClanHexV2Raw({ tally: null, matches: 0 })
    for (const axis of hex.axes) {
      expect(axis.raw).toBeNull()
      expect(axis.value).toBeNull()
      expect(axis.numerator).toBeNull()
      expect(axis.denominator).toBeNull()
      expect(axis.text).toBe('측정중')
      expect(axis.pending).toBe('battlelog')
    }
    expect(hex.measured).toBe(0)
  })

  it('상대 스나를 못 짚으면 ①⑤⑥ 이 `foeSniper` 다 — 0 이 아니다', () => {
    const hex = buildClanHexV2Raw({ tally: emptyTally({ foeSnipers: 0 }), matches: 1 })
    expect(axisOf(hex, 'sniperFight').pending).toBe('foeSniper')
    expect(axisOf(hex, 'lastSniper').pending).toBe('foeSniper')
    expect(axisOf(hex, 'attackZone').pending).toBe('foeSniper')
    expect(axisOf(hex, 'sniperFight').raw).toBeNull()
  })

  it('구역 좌표가 없으면 ① 이 `zone` 이다', () => {
    const tally = fullTally()
    const hex = buildClanHexV2Raw({
      tally: {
        ...tally,
        sniperFight: { ...required(tally.sniperFight), aSideKills: null, bLongKills: null },
      },
      matches: 1,
    })
    expect(axisOf(hex, 'sniperFight').pending).toBe('zone')
    expect(axisOf(hex, 'sniperFight').raw).toBeNull()
  })

  it('진영을 하나도 모르면 레드 기준 축이 `side` 다', () => {
    const tally = fullTally()
    const hex = buildClanHexV2Raw({
      tally: {
        ...tally,
        redRounds: 0,
        sniperFight: { ...required(tally.sniperFight), redRounds: 0 },
        tempo: { ...required(tally.tempo), redRounds: 0 },
        attackZone: { ...required(tally.attackZone), redRounds: 0 },
      },
      matches: 1,
    })
    expect(axisOf(hex, 'sniperFight').pending).toBe('side')
    expect(axisOf(hex, 'tempo').pending).toBe('side')
    expect(axisOf(hex, 'lastSniper').pending).toBe('side')
    expect(axisOf(hex, 'attackZone').pending).toBe('side')
    /* ②③ 은 진영을 보지 않는다 (D-202) — 그대로 잰다 */
    expect(axisOf(hex, 'outnumbered').raw).toBeCloseTo(0.4, 10)
  })

  it('분모가 0이면 `sample` 이다 — 0 으로 나눠 `NaN` 을 만들지 않는다', () => {
    const hex = buildClanHexV2Raw({
      tally: fullTally({ outnumbered: { rounds: 0, won: 0 } }),
      matches: 1,
    })
    const axis = axisOf(hex, 'outnumbered')
    expect(axis.pending).toBe('sample')
    expect(axis.raw).toBeNull()
    expect(axis.text).toBe('측정중')
  })

  it('「겪었는데 한 번도 못 했다」는 0 이다. `null` 로 바꾸지 않는다', () => {
    const hex = buildClanHexV2Raw({
      tally: fullTally({ save: { rounds: 7, won: 0 } }),
      matches: 1,
    })
    const axis = axisOf(hex, 'save')
    expect(axis.raw).toBe(0)
    expect(axis.pending).toBeNull()
    expect(axis.text).toBe('0%')
  })

  it('D-235 의 분자/분모를 그대로 쓴다 · `value` 는 아직 `null` 이다', () => {
    const hex = buildClanHexV2Raw({ tally: fullTally(), matches: 1 })
    expect(hex.measured).toBe(6)

    /* ① aSide.byKiller + bLong.byKiller / redRounds — **byVictim 이 아니다** */
    expect(axisOf(hex, 'sniperFight').numerator).toBe(4)
    expect(axisOf(hex, 'sniperFight').denominator).toBe(8)
    expect(axisOf(hex, 'sniperFight').text).toBe('0.50킬')
    expect(axisOf(hex, 'outnumbered').text).toBe('40%')
    expect(axisOf(hex, 'save').text).toBe('40%')
    /* ④ 72초 / 4라운드 */
    expect(axisOf(hex, 'tempo').raw).toBe(18)
    expect(axisOf(hex, 'tempo').text).toBe('18.0초')
    /* ⑤ 2 / 5 */
    expect(axisOf(hex, 'lastSniper').text).toBe('40%')
    /* ⑥ redWonZoneSniperRounds.byKiller(1) / redWonRounds(5) */
    expect(axisOf(hex, 'attackZone').numerator).toBe(1)
    expect(axisOf(hex, 'attackZone').text).toBe('20%')

    for (const axis of hex.axes) expect(axis.value).toBeNull()
  })

  it('구역은 넷 중 둘만 쓴다고 값에 남긴다 (D-235 Q6)', () => {
    const hex = buildClanHexV2Raw({ tally: fullTally(), matches: 1 })
    expect(hex.zoneLabelsUsed).toBe(2)
    expect(hex.zoneLabelsTotal).toBe(CLAN_HEX_V2_ZONE_LABELS_TOTAL)
    expect(hex.formulaVersion).toBe(CLAN_HEX_V2_CONFIG.formulaVersion)
  })

  it('Zod 계약(`ClanHexagonV2`)을 통과한다', () => {
    const hex = buildClanHexV2Raw({ tally: fullTally(), matches: 3 })
    expect(() => ClanHexagonV2.parse(hex)).not.toThrow()
    const [ours] = normalizeAgainstFoe(hex, buildClanHexV2Raw({ tally: fullTally(), matches: 3 }))
    expect(() => ClanHexagonV2.parse(ours)).not.toThrow()
  })
})

describe('normalizeAgainstFoe — 경기 상세 (D-235 Q7)', () => {
  it('큰 쪽이 1.0 이고 나머지는 그 비율이다', () => {
    const [ours, theirs] = normalizeAgainstFoe(
      oneAxis('save', 0.6),
      oneAxis('save', 0.3),
    )
    expect(axisOf(ours, 'save').value).toBe(1)
    expect(axisOf(theirs, 'save').value).toBeCloseTo(0.5, 10)
    /* 원값·글자는 건드리지 않는다 — 화면은 여전히 `60%` 를 적는다 */
    expect(axisOf(ours, 'save').raw).toBe(0.6)
  })

  it('**게임템포는 뒤집힌다** — 짧은 쪽이 1.0 이다', () => {
    const [fast, slow] = normalizeAgainstFoe(
      oneAxis('tempo', 15),
      oneAxis('tempo', 30),
    )
    expect(axisOf(fast, 'tempo').value).toBe(1)
    expect(axisOf(slow, 'tempo').value).toBeCloseTo(0.5, 10)
    /* 뒤집힌 것은 `value` 뿐이다. 초는 그대로 */
    expect(axisOf(fast, 'tempo').raw).toBe(15)
    expect(axisOf(slow, 'tempo').raw).toBe(30)
  })

  it('한쪽만 값이 있는 축은 **양쪽 다 `null`** 이고 `pending=compare` 다', () => {
    const [ours, theirs] = normalizeAgainstFoe(
      oneAxis('lastSniper', 0.5),
      buildClanHexV2Raw({ tally: emptyTally({ foeSnipers: 0 }), matches: 1 }),
    )
    const mine = axisOf(ours, 'lastSniper')
    expect(mine.value).toBeNull()
    expect(mine.pending).toBe('compare')
    /* 상대는 원래 못 잰 이유를 그대로 유지한다 */
    expect(axisOf(theirs, 'lastSniper').pending).toBe('foeSniper')
    expect(ours.measured).toBe(0)
  })

  it('둘 다 0이면 둘 다 0이다 — 0 은 실제 관측이다 (D-106)', () => {
    const [ours, theirs] = normalizeAgainstFoe(oneAxis('save', 0), oneAxis('save', 0))
    expect(axisOf(ours, 'save').value).toBe(0)
    expect(axisOf(theirs, 'save').value).toBe(0)
  })

  it('둘 다 못 잰 축은 그대로 못 잰 축이다', () => {
    const [ours] = normalizeAgainstFoe(
      buildClanHexV2Raw({ tally: null, matches: 0 }),
      buildClanHexV2Raw({ tally: null, matches: 0 }),
    )
    expect(axisOf(ours, 'save').pending).toBe('battlelog')
    expect(axisOf(ours, 'save').value).toBeNull()
  })
})

describe('normalizeByPercentile — 클랜 페이지 (D-235 Q8)', () => {
  const sample = (raw: number, denominator = 40) => oneAxis('save', raw, denominator)

  it('표본이 ' + CLAN_HEX_V2_MIN_SAMPLES + '개 미만이면 값을 내지 않는다 (null · sample)', () => {
    const target = sample(0.5)
    const few = [sample(0.1), sample(0.2), sample(0.3)]
    const hex = normalizeByPercentile(target, few)
    expect(axisOf(hex, 'save').value).toBeNull()
    expect(axisOf(hex, 'save').pending).toBe('sample')
    expect(hex.measured).toBe(0)
  })

  it('표본이 충분하면 백분위(0~1)를 낸다 — 꼴찌는 0 쪽, 1등은 1 쪽이다', () => {
    const cohort = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map((raw) => sample(raw))
    const top = normalizeByPercentile(sample(0.9), cohort)
    const bottom = normalizeByPercentile(sample(0.0), cohort)
    const topValue = axisOf(top, 'save').value
    const bottomValue = axisOf(bottom, 'save').value
    expect(topValue).not.toBeNull()
    expect(bottomValue).not.toBeNull()
    expect(topValue as number).toBeGreaterThan(bottomValue as number)
    expect(topValue as number).toBeLessThanOrEqual(1)
    expect(bottomValue as number).toBeGreaterThanOrEqual(0)
  })

  it('게임템포는 **짧을수록 높은 백분위**다', () => {
    const cohort = [10, 20, 30, 40, 50, 60].map((raw) => oneAxis('tempo', raw))
    const fast = normalizeByPercentile(oneAxis('tempo', 5), cohort)
    const slow = normalizeByPercentile(oneAxis('tempo', 90), cohort)
    expect(axisOf(fast, 'tempo').value as number).toBeGreaterThan(
      axisOf(slow, 'tempo').value as number,
    )
  })

  it(`분모가 ${CLAN_HEX_V2_CONFIG.minDenominator} 라운드 미만이면 표본으로도 값으로도 안 쓴다`, () => {
    const cohort = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map((raw) => sample(raw))

    /* 목표의 분모가 모자란 경우 */
    const thin = normalizeByPercentile(sample(0.5, 3), cohort)
    expect(axisOf(thin, 'save').pending).toBe('sample')
    expect(axisOf(thin, 'save').value).toBeNull()
    /* 원값은 지우지 않는다 — 화면은 숫자를 그대로 적을 수 있어야 한다 */
    expect(axisOf(thin, 'save').raw).toBe(0.5)

    /* 표본 쪽 분모가 모자란 경우 — 모집단에서 빠져 표본 부족이 된다 */
    const thinCohort = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map((raw) => sample(raw, 3))
    expect(axisOf(normalizeByPercentile(sample(0.5), thinCohort), 'save').pending).toBe('sample')
  })

  it('못 잰 축은 정규화해도 그 이유를 유지한다 — `sample` 로 덮어쓰지 않는다', () => {
    const target = buildClanHexV2Raw({ tally: emptyTally({ foeSnipers: 0 }), matches: 1 })
    const hex = normalizeByPercentile(target, [target, target, target, target, target, target])
    expect(axisOf(hex, 'sniperFight').pending).toBe('foeSniper')
    expect(axisOf(hex, 'sniperFight').value).toBeNull()
  })

  it('축은 여전히 6개이고 순서가 같다', () => {
    const hex = normalizeByPercentile(sample(0.5), [])
    expect(hex.axes.map((axis) => axis.key)).toEqual([...CLAN_HEX_V2_AXIS_KEYS])
  })
})
