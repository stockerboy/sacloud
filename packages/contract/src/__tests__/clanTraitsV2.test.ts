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
  CLAN_HEX_V2_CONFIG_KILLER,
  CLAN_HEX_V2_LOWER_IS_BETTER,
  CLAN_HEX_V2_MIN_SAMPLES,
  CLAN_HEX_V2_ZONE_LABELS_TOTAL,
  ClanHexagonV2,
  buildClanHexV2Raw,
  normalizeAgainstFoe,
  normalizeByPercentile,
  sumClanHexTallies,
  tradeCountOf,
  zoneCountOf,
  type ClanHexTallyLike,
  type ClanHexV2,
  type ClanHexV2AxisKey,
  type ClanHexV2Config,
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
    sniperDuel: null,
    firstBlood: null,
    trade: null,
    outnumbered: null,
    save: null,
    tempo: null,
    sniperFight: null,
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
    /* ① 스나 대 스나 — 분모는 won+lost 다 (D-256) */
    sniperDuel: { rounds: 16, won: 6, lost: 4 },
    /* ⑤ 선짤 — 동시각 2라운드는 **분모에서 이미 빠진** 값이다 (사용자 (가)) */
    firstBlood: { rounds: 12, won: 7, tiedRounds: 2 },
    /* ⑥ 교환 — 창 넷을 다 다르게 잡았다. 창을 바꾸면 값이 바뀌는지 시험하려는 것이다 */
    trade: { deaths: 20, within3: 2, within5: 5, within10: 8, sameRound: 12 },
    sniperFight: {
      redRounds: 8,
      foeSniperKills: 6,
      killsWithPosition: { byKiller: 6, byVictim: 6 },
      /* 두 해석이 **다른 값**을 내도록 잡았다 — 같으면 D-256 전환을 테스트가 못 잡는다.
         자리별 합은 양쪽 다 `killsWithPosition`(6)과 맞는다: 2+2+2 / 3+2+1 */
      aSideKills: { byKiller: 2, byVictim: 3 },
      bLongKills: { byKiller: 2, byVictim: 2 },
      unzonedKills: { byKiller: 2, byVictim: 1 },
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
      zoneLabels: ['CONDWI', 'SEOLDAE', 'NOKDWI', 'MERI'],
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

  /**
   * ⚠ **바뀌었다 (D-256)** — 옛 시험은 «상대 스나를 못 짚으면 **①⑤⑥** 이 `foeSniper`» 였다.
   * ⑤⑥ 이 **선짤·교환**으로 바뀌면서 **스나를 안 본다.** 이제 스나가 필요한 축은 ① 뿐이다.
   */
  it('상대 스나를 못 짚으면 **① 만** `foeSniper` 다 — 0 이 아니다', () => {
    const hex = buildClanHexV2Raw({ tally: emptyTally({ foeSnipers: 0 }), matches: 1 })
    expect(axisOf(hex, 'sniperDuel').pending).toBe('foeSniper')
    expect(axisOf(hex, 'sniperDuel').raw).toBeNull()
    /* ⑤⑥ 은 재료 자체가 없어서 `battlelog` 다. **`foeSniper` 가 아니다** */
    expect(axisOf(hex, 'firstBlood').pending).toBe('battlelog')
    expect(axisOf(hex, 'trade').pending).toBe('battlelog')
  })

  /**
   * ⚠ **바뀌었다 (D-256)** — 옛 시험은 «구역 좌표가 없으면 ① 이 `zone`» 이었다.
   * 사용자가 *"걍 에롱 비롱 필요없고"* 라고 해서 **① 이 구역을 안 쓴다.**
   * 그래서 지금 화면이 쓰는 축 중에 `zone` 으로 떨어질 수 있는 축은 **하나도 없다.**
   * `zone` 사유와 옛 축(`sniperFight`)은 지우지 않았다 (`CLAUDE.md` 10-4).
   */
  it('구역이 없어도 ① 은 멀쩡히 잰다 — 구역을 안 보기 때문이다', () => {
    const tally = fullTally()
    const hex = buildClanHexV2Raw({
      tally: {
        ...tally,
        sniperFight: { ...required(tally.sniperFight), aSideKills: null, bLongKills: null },
      },
      matches: 1,
    })
    expect(axisOf(hex, 'sniperDuel').pending).toBeNull()
    expect(axisOf(hex, 'sniperDuel').raw).toBeCloseTo(0.6, 10)
    /* 여섯 축 어디에도 `zone` 이 남지 않는다 */
    expect(hex.axes.map((axis) => axis.pending)).not.toContain('zone')
  })

  /**
   * ⚠ **바뀌었다 (D-256)** — 진영을 보는 축이 **④ 게임템포 하나만** 남았다.
   * ①⑤⑥ 이 전부 진영을 안 보는 정의로 바뀌었기 때문이다.
   */
  it('진영을 하나도 몰라도 **④ 만** `side` 다', () => {
    const tally = fullTally()
    const hex = buildClanHexV2Raw({
      tally: { ...tally, redRounds: 0, tempo: { ...required(tally.tempo), redRounds: 0 } },
      matches: 1,
    })
    expect(axisOf(hex, 'tempo').pending).toBe('side')
    /* 나머지 다섯은 진영을 안 본다 — 그대로 잰다 */
    expect(axisOf(hex, 'sniperDuel').pending).toBeNull()
    expect(axisOf(hex, 'firstBlood').pending).toBeNull()
    expect(axisOf(hex, 'trade').pending).toBeNull()
    expect(axisOf(hex, 'outnumbered').raw).toBeCloseTo(0.4, 10)
    expect(axisOf(hex, 'save').raw).toBeCloseTo(0.4, 10)
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

  it('여섯 축의 분자/분모를 그대로 쓴다 · `value` 는 아직 `null` 이다', () => {
    const hex = buildClanHexV2Raw({ tally: fullTally(), matches: 1 })
    expect(hex.measured).toBe(6)

    /* ① 스나싸움 — won(6) / (won + lost)(10). **사용자가 고른 분모다** (D-256) */
    expect(axisOf(hex, 'sniperDuel').numerator).toBe(6)
    expect(axisOf(hex, 'sniperDuel').denominator).toBe(10)
    expect(axisOf(hex, 'sniperDuel').text).toBe('60%')
    expect(axisOf(hex, 'outnumbered').text).toBe('40%')
    expect(axisOf(hex, 'save').text).toBe('40%')
    /* ④ 72초 / 4라운드 */
    expect(axisOf(hex, 'tempo').raw).toBe(18)
    expect(axisOf(hex, 'tempo').text).toBe('18.0초')
    /* ⑤ 선짤 — 7 / 12. 동시각 2라운드는 **분모에 없다** (사용자 (가)) */
    expect(axisOf(hex, 'firstBlood').numerator).toBe(7)
    expect(axisOf(hex, 'firstBlood').denominator).toBe(12)
    expect(axisOf(hex, 'firstBlood').text).toBe('58%')
    /* ⑥ 교환 — within5(5) / deaths(20). **5초가 사용자 확정이다** */
    expect(axisOf(hex, 'trade').numerator).toBe(5)
    expect(axisOf(hex, 'trade').denominator).toBe(20)
    expect(axisOf(hex, 'trade').text).toBe('25%')

    for (const axis of hex.axes) expect(axis.value).toBeNull()
  })

  /**
   * ⑤ 선짤 — 동시각 첫 킬은 **양 팀 다 분모에서 뺀다** (사용자 (가) · 실측 4.48%).
   *
   * 뺐다는 사실을 `tiedRounds` 로 **남긴다.** 나중에 «양쪽 다 성공» 으로 바꿀 수 있어야 한다.
   */
  it('⑤ 동시각 라운드는 분모에 안 들어가고, 그 수는 남는다', () => {
    const tally = fullTally()
    expect(required(tally.firstBlood).tiedRounds).toBe(2)
    /* 분모 12 는 동시각 2 를 뺀 값이다 — 14 가 아니다 */
    expect(axisOf(buildClanHexV2Raw({ tally, matches: 1 }), 'firstBlood').denominator).toBe(12)
  })

  /**
   * ⑥ 교환의 「직후」 — **창 넷을 다 저장한다.** 창을 바꿔도 **재빌드가 필요 없다.**
   *
   * 오늘 `byKiller`/`byVictim` 에서 겪은 것과 같은 이유다 — 고른 것은 해석이고
   * 데이터는 다 남긴다 (`CLAUDE.md` 10-4).
   */
  describe('⑥ 교환의 「직후」 창 (D-256)', () => {
    it('기본은 **5초**다 — 사용자가 골랐다', () => {
      expect(CLAN_HEX_V2_CONFIG.tradeWindow).toBe(5)
    })

    it('창을 바꾸면 같은 tally 에서 다른 값이 나온다', () => {
      const tally = fullTally()
      const at = (window: ClanHexV2Config['tradeWindow']) =>
        axisOf(
          buildClanHexV2Raw({ tally, matches: 1, config: { ...CLAN_HEX_V2_CONFIG, tradeWindow: window } }),
          'trade',
        ).numerator
      expect(at(3)).toBe(2)
      expect(at(5)).toBe(5)
      expect(at(10)).toBe(8)
      expect(at('sameRound')).toBe(12)
      /* 분모는 창과 무관하다 — 우리 팀원이 죽은 수다 */
      expect(axisOf(buildClanHexV2Raw({ tally, matches: 1 }), 'trade').denominator).toBe(20)
    })

    it('`tradeCountOf` 가 분기의 유일한 자리다', () => {
      const trade = { deaths: 9, within3: 1, within5: 2, within10: 3, sameRound: 4 }
      expect(tradeCountOf(trade, 3)).toBe(1)
      expect(tradeCountOf(trade, 5)).toBe(2)
      expect(tradeCountOf(trade, 10)).toBe(3)
      expect(tradeCountOf(trade, 'sameRound')).toBe(4)
    })
  })

  /**
   * 구역 해석(`byKiller`/`byVictim`)은 **살아 있다. 다만 지금 축 중에 쓰는 것이 없다** (D-256).
   *
   * 사용자가 ① 을 스나 대 스나로 바꾸고 ⑤⑥ 을 빼면서 구역을 보는 축이 사라졌다.
   * 스위치와 옛 tally 칸은 **지우지 않았다** (`CLAUDE.md` 10-4) — 옛 축이 되살아나면 그대로 쓴다.
   */
  describe('구역 해석은 남아 있다 (D-256)', () => {
    it('기본은 `byVictim` 이다', () => {
      expect(CLAN_HEX_V2_CONFIG.zoneAttribution).toBe('victim')
      expect(CLAN_HEX_V2_CONFIG_KILLER.zoneAttribution).toBe('killer')
    })

    it('`zoneCountOf` 가 분기의 유일한 자리다', () => {
      const zone = { byKiller: 7, byVictim: 11 }
      expect(zoneCountOf(zone, 'killer')).toBe(7)
      expect(zoneCountOf(zone, 'victim')).toBe(11)
    })

    /* 지금 여섯 축은 구역을 안 보므로 스위치를 뒤집어도 **값이 하나도 안 바뀐다** */
    it('스위치를 뒤집어도 지금 여섯 축의 값은 그대로다', () => {
      const now = buildClanHexV2Raw({ tally: fullTally(), matches: 1 })
      const flipped = buildClanHexV2Raw({
        tally: fullTally(),
        matches: 1,
        config: { ...CLAN_HEX_V2_CONFIG, zoneAttribution: 'killer' },
      })
      expect(flipped.axes.map((axis) => axis.raw)).toEqual(now.axes.map((axis) => axis.raw))
    })

    /* 옛 tally 칸은 그대로 저장된다 — 되살릴 때 재수집이 필요 없어야 한다 */
    it('옛 축의 재료(`sniperFight`·`lastSniper`·`attackZone`)는 tally 에 그대로 있다', () => {
      const tally = fullTally()
      expect(tally.sniperFight).not.toBeNull()
      expect(tally.lastSniper).not.toBeNull()
      expect(tally.attackZone).not.toBeNull()
      /* 합산도 계속 돈다 */
      const sum = sumClanHexTallies([tally, tally])
      expect(sum.attackZone?.redWonRounds).toBe(10)
      expect(sum.sniperFight?.aSideKills).toEqual({ byKiller: 4, byVictim: 6 })
    })
  })

  /**
   * ⚠ 이 테스트는 «넷 중 **둘**만 쓴다» 였다 (D-235 Q6). 좌표가 없던 시절의 이야기다.
   * 사용자가 2026-08-29 에 `녹뒤`·`머리` 를 직접 칠했고 지금은 넷이 다 돈다 (D-256).
   */
  it('⑥ 이 실제로 쓴 구역 수를 값에 남긴다 — 지금은 넷이다 (D-256)', () => {
    const hex = buildClanHexV2Raw({ tally: fullTally(), matches: 1 })
    expect(hex.zoneLabelsUsed).toBe(4)
    expect(hex.zoneLabelsTotal).toBe(CLAN_HEX_V2_ZONE_LABELS_TOTAL)
    expect(hex.zoneLabelsUsed).toBe(hex.zoneLabelsTotal)
    expect(hex.formulaVersion).toBe(CLAN_HEX_V2_CONFIG.formulaVersion)
  })

  /* 옛 행(`v2.1`)은 둘로 굳어 있다. 그 사실이 값과 함께 남는 것이 맞다 */
  it('옛 규칙으로 만들어진 tally 는 여전히 둘로 남는다', () => {
    const hex = buildClanHexV2Raw({
      tally: fullTally({
        attackZone: { ...required(fullTally().attackZone), zoneLabels: ['CONDWI', 'SEOLDAE'] },
      }),
      matches: 1,
    })
    expect(hex.zoneLabelsUsed).toBe(2)
    expect(hex.zoneLabelsTotal).toBe(4)
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
      oneAxis('sniperDuel', 0.5),
      buildClanHexV2Raw({ tally: emptyTally({ foeSnipers: 0 }), matches: 1 }),
    )
    const mine = axisOf(ours, 'sniperDuel')
    expect(mine.value).toBeNull()
    expect(mine.pending).toBe('compare')
    /* 상대는 원래 못 잰 이유를 그대로 유지한다 */
    expect(axisOf(theirs, 'sniperDuel').pending).toBe('foeSniper')
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
    expect(axisOf(hex, 'sniperDuel').pending).toBe('foeSniper')
    expect(axisOf(hex, 'sniperDuel').value).toBeNull()
  })

  it('축은 여전히 6개이고 순서가 같다', () => {
    const hex = normalizeByPercentile(sample(0.5), [])
    expect(hex.axes.map((axis) => axis.key)).toEqual([...CLAN_HEX_V2_AXIS_KEYS])
  })
})
