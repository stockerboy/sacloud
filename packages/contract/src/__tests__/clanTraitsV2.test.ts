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
 *
 * ── ⚠ ★2026-09-16 밤 — 축 여섯이 통째로 바뀌었다★ (사장님이 밤새 회의로 확정)
 *
 * ```
 * 옛 여섯   sniperDuel · outnumbered · save · riflePower · sniperInfluence · firstBloodless
 * 새 여섯   sniperDuel · sniperInfluence · rifleInfluence · blockChance · outnumbered · save
 * ```
 *
 *   · `sniperInfluence` 는 ★키는 같지만 뜻이 다르다★ — 옛것은 «스나가 킬 낸 라운드
 *     승률 − 침묵 라운드 승률» 이었고, 새것은 «무기별 점수를 상대와 견준 차» 다
 *   · `riflePower`·`firstBloodless` 는 축에서 내려갔다. ★재료와 셈은 그대로 산다★
 *
 *   그래서 이 파일은 ★옛 축을 시험하던 것을 지우지 않았다★ (`CLAUDE.md` 1-4).
 *   축에서 내려간 것은 화면 축 대신 ★tally 와 셈 함수를 직접★ 본다.
 *   바뀐 시험에는 「⚠ 옛 기대값 — …」 을 주석으로 남겼다.
 */
import { describe, expect, it } from 'vitest'
import {
  CLAN_HEX_V2_AXIS_KEYS,
  CLAN_HEX_V2_AXIS_KEYS_V4,
  CLAN_HEX_V2_AXIS_LABELS,
  CLAN_HEX_V2_CONFIG,
  CLAN_HEX_V2_CONFIG_KILLER,
  CLAN_HEX_V2_LOWER_IS_BETTER,
  CLAN_HEX_V2_MIN_SAMPLES,
  CLAN_HEX_V2_ZONE_LABELS_TOTAL,
  ClanHexagonV2,
  GAP_FULL_SCALE,
  gapDiffPerRound,
  SNIPER_INFLUENCE_FULL_SCALE,
  buildClanHexV2Raw,
  diffAxis,
  legacyTempoSeconds,
  normalizeAgainstFoe,
  normalizeByPercentile,
  sumClanHexTallies,
  tradeCountOf,
  firstBloodAxisV3,
  tradeAxisV4,
  zoneCountOf,
  type ClanHexTallyLike,
  type ClanHexV2,
  type ClanHexV2AnyAxisKey,
  type ClanHexV2AxisKey,
  type GapScoreTallyLike,
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
    sniperInfluence: null,
    /* ★2026-09-16 밤에 늘어난 두 칸★ — 새 축 셋(스나·라플 영향력 · 기회차단)의 재료다 */
    blockChance: null,
    gapScore: null,
    firstBlood: null,
    firstBloodless: null,
    trade: null,
    outnumbered: null,
    save: null,
    riflePower: null,
    tempo: null,
    sniperFight: null,
    lastSniper: null,
    attackZone: null,
    ...over,
  }
}

/**
 * ★스나·라플 영향력★ 의 재료 한 판치. 숫자는 시험용 표본이지 운영 데이터가 아니다.
 *
 * 값은 ★스나와 라플이 서로 다른 답★ 이 나오게 골랐다 — 둘이 같으면 스나 칸과 라플
 * 칸을 바꿔 읽는 버그를 시험이 못 잡는다. 셈은 «(우리 − 상대) ÷ 라운드 ÷ 사람수» 다.
 *
 * ```
 * 스나  (40 − 24) / 16라운드 / 2명 = +0.50점
 * 라플  (60 − 48) / 16라운드 / 3명 = +0.25점
 * ```
 *
 * ── ★«점수» 가 무엇인가★ (2026-09-16 밤 · 세는 쪽이 매긴다)
 *   상대 스나를 선짤로 잡으면 1점, 2킬 2점, 3킬 4점, 4킬 6점, 올킬 10점
 *   (선짤 없이 냈으면 절반). 세이브 +3 · 소수싸움에서 살아 나가며 잡으면 +2,
 *   그 라운드를 이기면 +2 더. ★여기 40·60 은 그 점수의 합이다★ — 킬 수가 아니다.
 *
 * ── 이 표본이 «그럴듯한 값» 인 근거
 *   실측(이긴 팀 기준) 한 사람당·라운드당 점수 차가 ★스나 +0.68점 · 라플 +0.45점★ 이다.
 *   +0.50 / +0.25 는 그 언저리라 눈금(`GAP_FULL_SCALE` ±1.5) 한가운데에 떨어진다 —
 *   자르기(clamp)에 걸려 시험이 통과해 버리는 일이 없다.
 */
function gapTally(over: Partial<GapScoreTallyLike> = {}): GapScoreTallyLike {
  return {
    ourSniper: 40,
    ourRifle: 60,
    foeSniper: 24,
    foeRifle: 48,
    sniperHeads: 2,
    rifleHeads: 3,
    rounds: 16,
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
    /* ⑤ 스나영향력 — 일한 20 중 14승(70%) · 침묵 20 중 8승(40%) → ★+30.0%★ (2026-09-16 사장님이 «p» 를 빼심) */
    sniperInfluence: { rounds: 20, won: 14, quietRounds: 20, quietWon: 8 },
    /*
     * ★기회차단★ (2026-09-16 밤) — 상대가 먼저 킬을 낸 10라운드 중 3을 우리가 끊었다 → 30%.
     *   뒷면(`openRounds`·`heldRounds`)은 축에 안 쓰지만 ★버리지 않는다★ — 세는 쪽이
     *   같이 담아 두므로 합산이 그것도 지켜야 한다.
     */
    blockChance: { foeOpenRounds: 10, cutRounds: 3, openRounds: 6, heldRounds: 2 },
    /* ★스나·라플 영향력★ (2026-09-16 밤) — `games` 가 없으니 ★한 판★ 이다 */
    gapScore: gapTally(),
    firstBlood: { rounds: 12, won: 7, tiedRounds: 2 },
    /* ⑥ 교환 — 창 넷을 다 다르게 잡았다. 창을 바꾸면 값이 바뀌는지 시험하려는 것이다 */
    /* ⑥ 선짤없이 라운드 시작 — 14라운드 중 6번 먼저 맞음 → 1 − 6/14 = 57% */
    firstBloodless: { rounds: 14, lost: 6, tiedRounds: 2 },
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
    /* ④ 라이플화력 — 스나가 1킬 없이 1~3번째로 지워진 6라운드 중 3을 라플이 살렸다 */
    riflePower: { rounds: 6, won: 3 },
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

/**
 * 표본에서 하위 tally 를 꺼낸다 — 시험 표본이 잘못됐으면 그 자리에서 터뜨린다.
 *
 * ⚠ ★2026-09-16 밤★ — `undefined` 도 받는다. 새로 생긴 `blockChance`·`gapScore` 는
 *   `ClanHexTallyLike` 에서 **선택 칸**(`?`)이라 «옛 줄에는 아예 없다» 를 `undefined`
 *   로 말한다. 그 둘을 이 함수로 꺼내려면 여기가 `undefined` 를 알아야 한다.
 */
function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('시험 표본이 잘못됐다')
  return value
}

/**
 * ⚠ ★2026-09-16 밤 — 열쇠를 `ClanHexV2AnyAxisKey` 로 넓혔다.★
 *
 * 축에서 내려간 이름(`riflePower`·`firstBloodless`)으로도 **부를 수 있어야** 한다.
 * 그런 이름은 육각형에 없으니 아래 `throw` 로 떨어진다 — 그게 맞다. 옛 축을 되살리면
 * 그날부터 다시 찾아진다. 타입에서 막아 버리면 옛 시험을 지워야 하고, 그건
 * «지우지 않는다» 를 어긴다 (`CLAUDE.md` 1-4).
 */
function axisOf(hex: ClanHexV2, key: ClanHexV2AnyAxisKey) {
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

  /*
   * ⚠ ★2026-09-15★ — 옛 시험은 `expect(lower).toEqual(['tempo'])` 였다.
   *   사장님이 ④ 를 게임템포 → 라이플화력(비율, 클수록 좋다)으로 바꾸면서
   *   뒤집는 축이 하나도 남지 않았다. 표와 뒤집기 기계는 **남아 있다** —
   *   되살릴 때를 위해서고, 아래 「뒤집힌다」 시험이 계속 그걸 돌린다.
   */
  it('지금은 「짧을수록 좋다」인 축이 하나도 없다', () => {
    const lower = CLAN_HEX_V2_AXIS_KEYS.filter((key) => CLAN_HEX_V2_LOWER_IS_BETTER[key])
    expect(lower).toEqual([])
  })

  /*
   * ⚠ ★2026-09-16 밤 — 축 여섯이 통째로 바뀌었다★ (사장님).
   *
   *   ⚠ 옛 기대값 — 이 시험은 «④ 는 **라이플화력**이다» 였고 이렇게 봤다:
   *   ```
   *   expect(CLAN_HEX_V2_AXIS_KEYS[3]).toBe('riflePower')
   *   expect(CLAN_HEX_V2_AXIS_LABELS.riflePower).toBe('라이플화력')
   *   ```
   *   ④ 는 이제 ★기회차단★ 이다. 라이플화력의 ★이름표는 그대로 살아 있고★
   *   (`CLAN_HEX_V2_AXIS_KEYS_V4` 에 축 자리도 남아 있다) 아래가 그걸 지킨다.
   */
  it('여섯 축은 ★2026-09-16 밤 판★ 이다 — ④ 가 기회차단이다', () => {
    expect([...CLAN_HEX_V2_AXIS_KEYS]).toEqual([
      'sniperDuel',
      'sniperInfluence',
      'rifleInfluence',
      'blockChance',
      'outnumbered',
      'save',
    ])
    expect(CLAN_HEX_V2_AXIS_KEYS[3]).toBe('blockChance')
    expect(CLAN_HEX_V2_AXIS_LABELS.blockChance).toBe('기회차단')
    expect(CLAN_HEX_V2_AXIS_LABELS.rifleInfluence).toBe('라플영향력')
  })

  /* 내려간 둘은 **지우지 않았다** — 옛 축 배열과 이름표가 그대로 있어야 되살릴 수 있다 */
  it('내려간 `riflePower`·`firstBloodless` 는 옛 축 배열과 이름표에 남아 있다', () => {
    const now = [...CLAN_HEX_V2_AXIS_KEYS] as string[]
    expect(now).not.toContain('riflePower')
    expect(now).not.toContain('firstBloodless')

    expect([...CLAN_HEX_V2_AXIS_KEYS_V4] as string[]).toContain('riflePower')
    expect([...CLAN_HEX_V2_AXIS_KEYS_V4] as string[]).toContain('firstBloodless')
    expect(CLAN_HEX_V2_AXIS_LABELS.riflePower).toBe('라이플화력')
    expect(CLAN_HEX_V2_AXIS_LABELS.firstBloodless).toBe('크랙 성공')
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

    /*
     * ⚠ ★2026-09-15★ — 옛 시험은 `axisOf(hex, 'tempo')` 로 축을 꺼냈다.
     *   게임템포가 꼭지점에서 내려와 이제 축이 아니다. 셈은 `legacyTempoSeconds`
     *   로 살아 있고 재료도 계속 쌓이므로, **합치는 방식**은 그대로 지킨다.
     */
    /* 경기 평균이었다면 (10 + 30) / 2 = 20초 였을 것이다 */
    expect(legacyTempoSeconds(sum)).toBe(28)
  })

  it('라이플화력도 **판을 평균 내지 않는다** — 분자합 / 분모합이다', () => {
    const few = fullTally({ riflePower: { rounds: 2, won: 2 } })
    const many = fullTally({ riflePower: { rounds: 18, won: 0 } })

    const sum = sumClanHexTallies([few, many])
    /* 옛 표본에는 `situationRounds` 칸이 없다 — 없으면 0으로 더한다 */
    expect(sum.riflePower).toEqual({ rounds: 20, won: 2, situationRounds: 0 })

    /*
     * ⚠ ★2026-09-16 밤★ — 라이플화력이 축에서 내려갔다 (기회차단과 교대).
     *   ★쌓는 방식은 그대로 지킨다★ — 되살릴 때 재수집이 없어야 하기 때문이다
     *   (`CLAUDE.md` 1-4). 그래서 화면 축 대신 합쳐진 tally 를 직접 나눠 본다.
     *   ⚠ 옛 기대값 — `axisOf(hex, 'riflePower').raw` 가 0.1 · `text` 가 `'10%'` 였다.
     */
    const part = required(sum.riflePower)
    /* 판 평균이었다면 (100% + 0%) / 2 = 50% 였을 것이다 */
    expect(part.won / part.rounds).toBeCloseTo(0.1, 10)
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

/* -------------------------------------------------------------------------- */
/* ★새 축 셋★ (2026-09-16 밤)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * ★기회차단★ — 먼저 맞고 시작한 라운드를 끊어냈나.
 *
 * 분모 `foeOpenRounds` = 상대가 그 라운드 첫 킬을 낸 라운드 수,
 * 분자 `cutRounds` = 그중 ★다음 킬을 우리가 낸★ 라운드 수.
 *
 * 실측에서 ★경기 승률과 상관 0.015★ — 여섯 축 중 «그냥 강팀» 이 안 섞인 유일한 축이다
 * (`CLAN_HEX_V2_AXIS_KEYS` 주석). 그래서 이 축이 조용히 틀리면 알아챌 다른 단서가 없다.
 */
describe('★기회차단★ — 상대가 연 라운드를 끊었나 (2026-09-16 밤)', () => {
  it('분자는 끊은 라운드 · 분모는 상대가 연 라운드다', () => {
    const axis = axisOf(buildClanHexV2Raw({ tally: fullTally(), matches: 1 }), 'blockChance')
    /* 표본은 `{ foeOpenRounds: 10, cutRounds: 3 }` 이다 → 3/10 */
    expect(axis.numerator).toBe(3)
    expect(axis.denominator).toBe(10)
    expect(axis.raw).toBeCloseTo(0.3, 10)
    expect(axis.text).toBe('30%')
    expect(axis.pending).toBeNull()
  })

  it('분모가 0 이면 「측정중」 이다 — 0% 로 적지 않는다 (D-106)', () => {
    const hex = buildClanHexV2Raw({
      tally: fullTally({ blockChance: { foeOpenRounds: 0, cutRounds: 0 } }),
      matches: 1,
    })
    const axis = axisOf(hex, 'blockChance')
    /* 「한 번도 안 맞고 시작했다」는 «못 끊었다» 가 아니다 — 잴 일이 없었던 것이다 */
    expect(axis.pending).toBe('sample')
    expect(axis.raw).toBeNull()
    expect(axis.text).toBe('측정중')
  })

  it('「당했는데 한 번도 못 끊었다」는 0% 다 — `null` 로 바꾸지 않는다', () => {
    const hex = buildClanHexV2Raw({
      tally: fullTally({ blockChance: { foeOpenRounds: 9, cutRounds: 0 } }),
      matches: 1,
    })
    const axis = axisOf(hex, 'blockChance')
    expect(axis.raw).toBe(0)
    expect(axis.pending).toBeNull()
    expect(axis.text).toBe('0%')
  })

  it('재료가 아예 없으면 `battlelog` 다 — 상대 스나를 안 보는 축이다', () => {
    const hex = buildClanHexV2Raw({ tally: emptyTally({ foeSnipers: 0 }), matches: 1 })
    expect(axisOf(hex, 'blockChance').pending).toBe('battlelog')
  })

  it('여러 판은 **비율을 평균 내지 않는다** — 분자합 / 분모합이다', () => {
    const few = fullTally({ blockChance: { foeOpenRounds: 2, cutRounds: 2 } })
    const many = fullTally({ blockChance: { foeOpenRounds: 18, cutRounds: 0 } })

    const sum = sumClanHexTallies([few, many])
    /* 뒷면 두 칸은 이 표본에 없다 — 없으면 0 으로 더한다 (`riflePower.situationRounds` 와 같은 꼴) */
    expect(sum.blockChance).toEqual({
      foeOpenRounds: 20,
      cutRounds: 2,
      openRounds: 0,
      heldRounds: 0,
    })

    const axis = axisOf(buildClanHexV2Raw({ tally: sum, matches: 2 }), 'blockChance')
    /* 판 평균이었다면 (100% + 0%) / 2 = 50% 였을 것이다 */
    expect(axis.raw).toBeCloseTo(0.1, 10)
    expect(axis.text).toBe('10%')
  })

  it('축이 안 쓰는 뒷면(`openRounds`·`heldRounds`)도 버리지 않고 쌓는다', () => {
    const sum = sumClanHexTallies([fullTally(), fullTally()])
    /* 표본 하나가 `{ openRounds: 6, heldRounds: 2 }` 다 — 두 판이면 그 두 배 */
    expect(sum.blockChance?.openRounds).toBe(12)
    expect(sum.blockChance?.heldRounds).toBe(4)
  })
})

/**
 * ★스나영향력 · 라플영향력★ — 무기별 점수를 상대와 견준 차 (2026-09-16 밤 사장님).
 *
 * ★같은 재료·같은 이름·다른 접기★ 다. 어느 쪽인지는 `games` 칸이 있는지로 갈린다:
 *
 * ```
 * 한 판 (games 없음)   «두 팀 총점 중 우리 몫»          63% : 37% (26%p 차이)
 * 여러 판 (games 있음)  «그 차가 앞선 판 비율»          64%
 * ```
 *
 * ⚠ ★2026-09-17 — 한 판 쪽이 «점» 에서 «몫(%)» 으로 바뀌었다★ (사장님:
 *   «무슨 0.15 -1.18 이렇게하면 어케 와닿겠어»). 옛 셈은 `gapDiffPerRound()` 에 그대로 있다.
 *
 * ⚠ 이 둘이 ★조용히 뒤바뀌면 그림이 멀쩡해 보인다★ — 둘 다 0~1 로 펴져 꼭짓점이
 *   그럴듯하게 찍힌다. 그래서 `text` 까지 못 박는다.
 */
describe('★스나영향력 · 라플영향력★ — 한 판과 여러 판이 다르게 접힌다 (2026-09-16 밤)', () => {
  it('한 판이면 «두 팀 총점 중 우리 몫» 을 적는다 (2026-09-17)', () => {
    const hex = buildClanHexV2Raw({ tally: fullTally(), matches: 1 })

    const sniper = axisOf(hex, 'sniperInfluence')
    /* 40 / (40 + 24) = 62.5% → 63% : 37% · 차이 26%p */
    expect(sniper.text).toBe('63% : 37% (26%p 차이)')
    /* 분자는 우리 점수 · 분모는 ★두 팀 합★ 이다 — 몫의 분모다 */
    expect(sniper.numerator).toBe(40)
    expect(sniper.denominator).toBe(64)
    /* `raw` 는 몫 그대로다 — 눈금을 따로 펼 필요가 없다 */
    expect(sniper.raw).toBeCloseTo(40 / 64, 10)
    expect(sniper.pending).toBeNull()

    const rifle = axisOf(hex, 'rifleInfluence')
    /* 60 / (60 + 48) = 55.6% → 56% : 44%.
       ★스나(63%)와 다른 값이어야 한다★ — 같으면 두 칸을 바꿔 읽는 버그를 못 잡는다 */
    expect(rifle.text).toBe('56% : 44% (12%p 차이)')
    expect(rifle.numerator).toBe(60)
    expect(rifle.denominator).toBe(108)
    expect(rifle.raw).toBeCloseTo(60 / 108, 10)
  })

  it('옛 셈(한 사람당 · 라운드당 점수 차)은 그대로 살아 있다 — 지우지 않는다', () => {
    /* (40 − 24) / 16라운드 / 2명 = +0.50점 — 2026-09-16 판이 적던 값이다 */
    expect(gapDiffPerRound(40, 24, 16, 2)).toBeCloseTo(0.5, 10)
    expect(gapDiffPerRound(60, 48, 16, 3)).toBeCloseTo(0.25, 10)
    /* 0 으로 나누지 않는다 */
    expect(gapDiffPerRound(40, 24, 0, 2)).toBe(0)
    expect(gapDiffPerRound(40, 24, 16, 0)).toBeCloseTo(1, 10)
  })

  it('뒤진 판은 몫이 절반 아래다 — 숫자를 지어내지 않는다', () => {
    const hex = buildClanHexV2Raw({
      /* 스나 칸만 뒤집었다: 24 / (24 + 40) = 37.5% → 38% : 62% */
      tally: fullTally({ gapScore: gapTally({ ourSniper: 24, foeSniper: 40 }) }),
      matches: 1,
    })
    const sniper = axisOf(hex, 'sniperInfluence')
    expect(sniper.text).toBe('38% : 62% (24%p 차이)')
    expect(sniper.raw).toBeCloseTo(24 / 64, 10)
    /* 라플 칸은 안 건드렸으니 그대로다 */
    expect(axisOf(hex, 'rifleInfluence').text).toBe('56% : 44% (12%p 차이)')
  })

  it('한쪽이 올킬이면 100% : 0% 다 — `raw` 가 0~1 밖으로 안 나간다', () => {
    /* 몫은 본래 0~1 이라 재금 자체가 필요 없다 — 그게 «점» 보다 나은 점이다 */
    const low = buildClanHexV2Raw({
      tally: fullTally({ gapScore: gapTally({ ourSniper: 0, foeSniper: 160 }) }),
      matches: 1,
    })
    expect(axisOf(low, 'sniperInfluence').raw).toBe(0)
    expect(axisOf(low, 'sniperInfluence').text).toBe('0% : 100% (100%p 차이)')

    const high = buildClanHexV2Raw({
      tally: fullTally({ gapScore: gapTally({ ourSniper: 160, foeSniper: 0 }) }),
      matches: 1,
    })
    expect(axisOf(high, 'sniperInfluence').raw).toBe(1)
    expect(axisOf(high, 'sniperInfluence').text).toBe('100% : 0% (100%p 차이)')
  })

  it('두 팀 다 0점이면 「측정중」 이다 — 0 으로 나누지 않는다 (2026-09-17)', () => {
    const hex = buildClanHexV2Raw({
      tally: fullTally({ gapScore: gapTally({ ourSniper: 0, foeSniper: 0 }) }),
      matches: 1,
    })
    expect(axisOf(hex, 'sniperInfluence').pending).not.toBeNull()
    expect(axisOf(hex, 'sniperInfluence').value).toBeNull()
  })

  it('라운드를 하나도 못 세면 두 축이 「측정중」 이다 — 0 으로 나누지 않는다', () => {
    const hex = buildClanHexV2Raw({
      tally: fullTally({ gapScore: gapTally({ rounds: 0 }) }),
      matches: 1,
    })
    for (const key of ['sniperInfluence', 'rifleInfluence'] as const) {
      expect(axisOf(hex, key).pending).toBe('sample')
      expect(axisOf(hex, key).raw).toBeNull()
      expect(axisOf(hex, key).text).toBe('측정중')
    }
  })

  it('재료가 아예 없으면 `battlelog` 다 — 상대 스나를 안 보는 축이다', () => {
    const hex = buildClanHexV2Raw({ tally: emptyTally({ foeSnipers: 0 }), matches: 1 })
    expect(axisOf(hex, 'sniperInfluence').pending).toBe('battlelog')
    expect(axisOf(hex, 'rifleInfluence').pending).toBe('battlelog')
  })

  /**
   * ★여기가 클랜 축의 핵심이다★ — 사장님: «스나차이 난 판을 모으기».
   *
   * «앞섰나» 는 ★판마다 한 번씩★ 세어 두어야 한다. 합친 뒤에는 어느 판에서
   * 앞섰는지 알 수 없기 때문이다 (점수를 다 더해 버리면 한 판의 큰 승리가
   * 여러 판의 작은 패배를 덮는다). 그래서 `sumClanHexTallies` 가 그 자리다.
   */
  describe('여러 판 — `sumClanHexTallies` 가 ★앞선 판 수★ 를 센다', () => {
    /* 스나 앞섬 · 라플 앞섬 (`fullTally` 기본: 40>24 · 60>48) */
    const bothAhead = () => fullTally()
    /* 스나 뒤짐 · 라플 앞섬 */
    const rifleOnly = () =>
      fullTally({ gapScore: gapTally({ ourSniper: 10, foeSniper: 90, ourRifle: 90, foeRifle: 10 }) })
    /* 스나 앞섬 · 라플 뒤짐 */
    const sniperOnly = () =>
      fullTally({ gapScore: gapTally({ ourSniper: 90, foeSniper: 10, ourRifle: 10, foeRifle: 90 }) })

    it('판마다 스나·라플을 따로 세고, 센 판 수도 남긴다', () => {
      /* 스나 앞선 판 = ①③ 두 판 · 라플 앞선 판 = ①②④ 세 판 */
      const sum = sumClanHexTallies([bothAhead(), rifleOnly(), sniperOnly(), rifleOnly()])
      expect(sum.gapScore?.games).toBe(4)
      expect(sum.gapScore?.sniperAheadGames).toBe(2)
      /* ★스나와 라플이 다른 수여야 한다★ — 같으면 한쪽 셈이 빠져도 안 걸린다 */
      expect(sum.gapScore?.rifleAheadGames).toBe(3)
    })

    it('합친 결과를 육각형에 넣으면 «앞선 판 비율» 이 된다 — 점수 차가 아니다', () => {
      const sum = sumClanHexTallies([bothAhead(), rifleOnly(), sniperOnly(), rifleOnly()])
      const hex = buildClanHexV2Raw({ tally: sum, matches: 4 })

      const sniper = axisOf(hex, 'sniperInfluence')
      expect(sniper.numerator).toBe(2)
      expect(sniper.denominator).toBe(4)
      expect(sniper.raw).toBeCloseTo(0.5, 10)
      expect(sniper.text).toBe('50%')

      const rifle = axisOf(hex, 'rifleInfluence')
      expect(rifle.text).toBe('75%')
      expect(rifle.raw).toBeCloseTo(0.75, 10)

      /* ★한 판짜리 글자(«+0.50점»)가 나오면 접기가 뒤바뀐 것이다★ */
      expect(sniper.text).not.toContain('점')
      expect(rifle.text).not.toContain('점')
    })

    it('동점인 판은 「앞섰다」로 안 센다 — 이겨야 앞선 것이다', () => {
      const tie = () =>
        fullTally({
          gapScore: gapTally({ ourSniper: 30, foeSniper: 30, ourRifle: 30, foeRifle: 30 }),
        })
      const sum = sumClanHexTallies([tie(), tie()])
      expect(sum.gapScore?.games).toBe(2)
      expect(sum.gapScore?.sniperAheadGames).toBe(0)
      expect(sum.gapScore?.rifleAheadGames).toBe(0)
      /* 0 은 실제 관측이다 — «한 판도 못 앞섰다» 이지 «못 쟀다» 가 아니다 (D-106) */
      const axis = axisOf(buildClanHexV2Raw({ tally: sum, matches: 2 }), 'sniperInfluence')
      expect(axis.raw).toBe(0)
      expect(axis.text).toBe('0%')
      expect(axis.pending).toBeNull()
    })

    it('이미 합친 것을 또 합쳐도 판 수가 두 번 세지지 않는다', () => {
      /*
       * 잡(`clanHexV2Summary`)이 실제로 이렇게 부른다 — 한 판씩 `folded` 에 접어 넣는다.
       * 그래서 «합 + 한 판» 이 늘 맞아야 한다. 합쳐진 쪽은 이미 센 수를 그대로 더하고,
       * 한 판짜리는 그 자리에서 판정한다.
       */
      const first = sumClanHexTallies([bothAhead(), rifleOnly()])
      expect(first.gapScore?.games).toBe(2)
      expect(first.gapScore?.sniperAheadGames).toBe(1)

      const second = sumClanHexTallies([first, sniperOnly()])
      expect(second.gapScore?.games).toBe(3)
      /* 1(이미 센 것) + 1(새 판) = 2 */
      expect(second.gapScore?.sniperAheadGames).toBe(2)
      /* 라플은 2(이미 센 것) + 0 = 2 */
      expect(second.gapScore?.rifleAheadGames).toBe(2)
    })

    it('점수 합도 같이 쌓는다 — 경기 단위 값을 되살릴 수 있어야 한다', () => {
      const sum = sumClanHexTallies([bothAhead(), bothAhead()])
      expect(sum.gapScore?.ourSniper).toBe(80)
      expect(sum.gapScore?.foeSniper).toBe(48)
      expect(sum.gapScore?.rounds).toBe(32)
      /* 사람 수는 판마다 다르므로 **합이 아니다** — 마지막 판의 값을 둔다 */
      expect(sum.gapScore?.sniperHeads).toBe(2)
      expect(sum.gapScore?.rifleHeads).toBe(3)
    })

    it('재료가 없는 판은 분모(`games`)에 안 들어간다', () => {
      const sum = sumClanHexTallies([bothAhead(), fullTally({ gapScore: null })])
      expect(sum.gapScore?.games).toBe(1)
      expect(sum.gapScore?.sniperAheadGames).toBe(1)
      /* 전부 없으면 결과도 `null` 이다 */
      expect(sumClanHexTallies([fullTally({ gapScore: null })]).gapScore).toBeNull()
    })
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
    /*
     * 나머지 다섯은 재료 자체가 없어서 `battlelog` 다. **`foeSniper` 가 아니다**
     * ⚠ 옛 기대값 — 이 줄은 `sniperInfluence` 와 `firstBloodless` 를 봤다.
     *   `firstBloodless` 가 축에서 내려가고 ★기회차단·라플영향력★ 이 들어왔다.
     */
    expect(axisOf(hex, 'sniperInfluence').pending).toBe('battlelog')
    expect(axisOf(hex, 'rifleInfluence').pending).toBe('battlelog')
    expect(axisOf(hex, 'blockChance').pending).toBe('battlelog')
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
  /*
   * ⚠ ★2026-09-15★ — 옛 시험 이름은 «진영을 하나도 몰라도 **④ 만** `side` 다» 였다.
   *   진영을 보던 축은 게임템포 하나였는데 라이플화력으로 바뀌었다.
   *   라이플화력은 «누가 먼저 죽었나 + 라운드를 땄나» 라 레드/블루를 안 본다.
   *   **이제 여섯 축이 전부 진영을 안 본다.**
   */
  it('진영을 하나도 몰라도 여섯 축이 다 측정된다', () => {
    const tally = fullTally()
    const hex = buildClanHexV2Raw({
      tally: { ...tally, redRounds: 0, tempo: { ...required(tally.tempo), redRounds: 0 } },
      matches: 1,
    })
    expect(hex.measured).toBe(6)
    /* ⚠ 옛 기대값 — 이 줄들은 `riflePower` 와 `firstBloodless` 를 봤다 (2026-09-16 밤에 교대) */
    expect(axisOf(hex, 'blockChance').pending).toBeNull()
    expect(axisOf(hex, 'sniperDuel').pending).toBeNull()
    expect(axisOf(hex, 'sniperInfluence').pending).toBeNull()
    expect(axisOf(hex, 'rifleInfluence').pending).toBeNull()
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
    /* ④ ★기회차단★ — 상대가 연 10라운드 중 3을 끊었다 (2026-09-16 밤) */
    expect(axisOf(hex, 'blockChance').numerator).toBe(3)
    expect(axisOf(hex, 'blockChance').denominator).toBe(10)
    expect(axisOf(hex, 'blockChance').text).toBe('30%')
    /*
     * ⚠ 옛 ④ 라이플화력은 `{ numerator: 3, denominator: 6, text: '50%' }` 였다.
     *   셈도 재료도 남아 있다 (`CLAUDE.md` 1-4) — tally 로 그대로 확인한다.
     */
    expect(required(fullTally().riflePower).won).toBe(3)
    expect(required(fullTally().riflePower).rounds).toBe(6)
    /* ⚠ 옛 ④ 게임템포는 72초 / 4라운드 = 18초 였다. 셈은 남아 있다 (`CLAUDE.md` 1-4) */
    expect(legacyTempoSeconds(fullTally())).toBe(18)
    /* ⑤ 선짤 — 7 / 12. 동시각 2라운드는 **분모에 없다** (사용자 (가)) */
    /*
     * ⚠ ★같은 날 두 번 바뀌었다가 제자리로 왔다★ (2026-09-15)
     *   ① 분모를 «경기» 로 → «판당 7.0회» (사장님 «클랜축도 마찬가지»)
     *   ② ★되돌림★ — 회의에서 ②안을 고르시며 «25초 안에 겨룬 라운드 중 먼저 딴 비율»
     *      이 됐다. 분모가 이미 «겨룬 라운드» 라 비율이 곧 뜻이다.
     *   세는 쪽이 `rounds` 를 25초로 좁혀 놓으므로 여기서는 그대로 나눈다.
     */
    /*
     * ②③ ★스나영향력 · 라플영향력★ (2026-09-16 밤 사장님) —
     *   한 판이라 «두 팀 총점 중 우리 몫» 이다. 분자는 우리 점수 · 분모는 ★두 팀 합★.
     *
     *   ⚠ 옛 기대값 둘을 남긴다 (`CLAUDE.md` 1-4) —
     *     2026-09-16 낮 (두 승률의 차)
     *       `{ numerator: 14, denominator: 20, text: '+30.0%', raw: 0.6 }`.
     *       일한 라운드 14/20 = 70% · 침묵 라운드 8/20 = 40% → 차 +30.0%p 를
     *       0~50%p 눈금으로 편 값이 0.6 이었다. 그 셈은 `diffAxis` 에 그대로 있다.
     *     2026-09-16 밤 (한 사람당 · 라운드당 점수 차)
     *       `{ numerator: 40, denominator: 24, text: '+0.50점' }`.
     *       그 셈은 `gapDiffPerRound()` 에 그대로 있다.
     */
    expect(axisOf(hex, 'sniperInfluence').numerator).toBe(40)
    expect(axisOf(hex, 'sniperInfluence').denominator).toBe(64)
    expect(axisOf(hex, 'sniperInfluence').text).toBe('63% : 37% (26%p 차이)')
    expect(axisOf(hex, 'rifleInfluence').text).toBe('56% : 44% (12%p 차이)')
    /* 옛 셈의 재료는 그대로다 — 일한 20 중 14승 · 침묵 20 중 8승 */
    expect(required(fullTally().sniperInfluence).won).toBe(14)
    expect(required(fullTally().sniperInfluence).quietWon).toBe(8)
    /* ⑥ 교환 — within5(5) / deaths(20). **5초가 사용자 확정이다** */
    /*
     * ⚠ 옛 ⑥ ★선짤없이 라운드 시작★ 은 `{ numerator: 8, denominator: 14, text: '57%' }`
     *   였다 (2026-09-16 사장님: «전체라운드를 분모에 두고 당한 라운드를 분자에 넣고
     *   ★1에서 빼면★ 안당한 라운드가 나오잖아»). 14라운드 중 6번 먼저 맞았으니 8/14.
     *   그 앞의 ⑥ 백어택은 `{ numerator: 5, denominator: 20, text: '25%' }` 였다.
     *   ★둘 다 재료가 계속 쌓인다★ — 아래가 그것을 지킨다.
     */
    expect(required(fullTally().firstBloodless).rounds).toBe(14)
    expect(required(fullTally().firstBloodless).lost).toBe(6)

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
    /*
     * ⚠ 2026-09-16 에 선짤이 축에서 내려갔다 (스나영향력과 교대). ★셈은 그대로 돈다★ —
     *   그래서 화면 축 대신 tally 를 직접 본다. 되살릴 때를 위한 시험이다.
     */
    expect(required(tally.firstBlood).rounds).toBe(12)
    expect(firstBloodAxisV3(required(tally.firstBlood))?.denominator).toBe(12)
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
      /*
       * ⚠ 2026-09-16 에 백어택이 축에서 내려갔다 (선짤없이 라운드 시작과 교대).
       *   ★셈은 그대로 돈다★ — 그래서 화면 축 대신 `tradeAxisV4` 를 직접 본다.
       *   되살릴 때를 위한 시험이다.
       */
      const tally = fullTally()
      const part = required(tally.trade)
      const at = (window: 3 | 5 | 10) => tradeAxisV4(part, window)?.numerator
      expect(at(3)).toBe(2)
      expect(at(5)).toBe(5)
      expect(at(10)).toBe(8)
      expect(tradeCountOf(part, 'sameRound')).toBe(12)
      /* 분모는 창과 무관하다 — 우리 팀원이 죽은 수다 */
      expect(tradeAxisV4(part, 5)?.denominator).toBe(20)
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
   * ★2026-09-16 밤에 축에서 내려간 둘★ — 라이플화력 · 크랙 성공.
   *
   * 사장님이 여섯을 통째로 바꿨지만 **재료와 셈은 지우지 않았다** (`CLAUDE.md` 1-4).
   * 되살릴 때 ★재수집이 없어야★ 하므로, 합산이 그 둘을 계속 쌓는지 못 박는다.
   */
  describe('내려간 두 축의 재료는 계속 쌓인다 (2026-09-16 밤)', () => {
    it('`riflePower` · `firstBloodless` 가 tally 에 그대로 있다', () => {
      const tally = fullTally()
      expect(tally.riflePower).not.toBeNull()
      expect(tally.firstBloodless).not.toBeNull()
    })

    it('합산도 계속 돈다 — 분자·분모를 쌓는다', () => {
      const sum = sumClanHexTallies([fullTally(), fullTally()])
      /* 라이플화력 3/6 짜리 두 판 → 6/12 */
      expect(sum.riflePower?.won).toBe(6)
      expect(sum.riflePower?.rounds).toBe(12)
      /* 크랙 성공 14라운드 중 6번 당한 두 판 → 28라운드 중 12번. 동시각 수도 남는다 */
      expect(sum.firstBloodless).toEqual({ rounds: 28, lost: 12, tiedRounds: 4 })
    })

    it('옛 ⑥ 의 셈(`1 − 당한 ÷ 전체`)이 내던 값은 그대로 나온다', () => {
      const part = required(fullTally().firstBloodless)
      /* 14라운드 중 6번 먼저 맞음 → 안 당한 8 → 8/14 = 57% (옛 기대값 그대로다) */
      expect(part.rounds - part.lost).toBe(8)
      expect(Math.round(((part.rounds - part.lost) / part.rounds) * 100)).toBe(57)
    })
  })

  /**
   * ★옛 ⑤ 스나영향력의 셈 — `diffAxis`★ (2026-09-16 낮 · 사장님이 실측 넷 중 D 를 고르심).
   *
   * 뜻: «스나가 킬을 낸 라운드 승률 − 스나가 한 명도 못 잡은 라운드 승률».
   * 같은 날 밤에 `sniperInfluence` 가 ★키를 그대로 둔 채 뜻만★ «무기별 점수 차» 로
   * 바뀌어서, 이 셈은 축 빌더에서 안 불린다. 함수는 `export` 로 살려 뒀고
   * 재료(`tally.sniperInfluence`)도 계속 쌓인다 (`CLAUDE.md` 1-4).
   *
   * ⚠ ★아무도 안 부르는 export 는 조용히 썩는다.★ 되살리는 날 «있는 줄 알았는데
   *   안 돌아간다» 가 되지 않게, 여기서 직접 불러 옛 값을 못 박는다.
   */
  describe('옛 ⑤ 스나영향력의 셈(`diffAxis`)은 아직 돈다 (2026-09-16 낮)', () => {
    it('두 승률의 차를 내고 0~50%p 를 0~1 눈금으로 편다', () => {
      /* `fullTally` 의 재료 그대로 — 일한 20 중 14승(70%) · 침묵 20 중 8승(40%) */
      const axis = diffAxis('sniperInfluence', required(fullTally().sniperInfluence))
      /* 차 = 70% − 40% = ★+30.0%★ (사장님이 «p» 를 빼셨다 — «%p» 가 아니라 «%» 로 적는다) */
      expect(axis.text).toBe('+30.0%')
      /* 육각형은 반지름이 0~1 이라 30 / 50 = 0.6 으로 편다 */
      expect(axis.raw).toBeCloseTo(30 / SNIPER_INFLUENCE_FULL_SCALE, 10)
      /* 분자·분모는 «일한 라운드» 쪽을 적는다 — 화면이 «14/20» 을 보여 줄 때 쓴다 */
      expect(axis.numerator).toBe(14)
      expect(axis.denominator).toBe(20)
      expect(axis.pending).toBeNull()
    })

    it('침묵한 라운드가 없으면 「일한 라운드 승률」로 떨어진다 — 차를 0 으로 안 만든다', () => {
      /*
       * 사장님: «둘다 0이면 좀 그래». 6:1 처럼 짧은 판에서 스나가 매 라운드 킬을 내면
       * 침묵한 라운드가 0 이다. 그때 차를 0 으로 찍으면 «영향력이 없다» 가 되어 거짓이다.
       */
      const axis = diffAxis('sniperInfluence', {
        rounds: 10,
        won: 7,
        quietRounds: 0,
        quietWon: 0,
      })
      expect(axis.text).toBe('70%')
      expect(axis.raw).toBeCloseTo(0.7, 10)
      /* 「측정중」이 아니다 — 잰 값이다 */
      expect(axis.pending).toBeNull()
    })

    it('차가 음수면 숫자는 음수 그대로 적고 `raw` 만 0 으로 막는다', () => {
      /* 일한 20 중 8승(40%) · 침묵 20 중 14승(70%) → 차 −30.0% */
      const axis = diffAxis('sniperInfluence', {
        rounds: 20,
        won: 8,
        quietRounds: 20,
        quietWon: 14,
      })
      /* ★숫자는 지어내지 않는다★ — 스나가 일해도 더 지는 팀이 실제로 있다 */
      expect(axis.text).toBe('-30.0%')
      /* 음수 반지름은 그릴 수 없다 */
      expect(axis.raw).toBe(0)
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

  /*
   * ⚠ ★2026-09-15★ — 옛 시험은 «게임템포는 뒤집힌다» 였다. 게임템포가 꼭지점에서
   *   내려와 지금은 뒤집히는 축이 하나도 없다. 그래도 **뒤집기 기계는 남아 있고**
   *   («짧을수록 좋다» 축이 다시 생길 수 있다) 안 돌리면 조용히 썩는다.
   *   그래서 표를 그 시험 동안만 손대서 기계를 그대로 돌린다. 끝나면 되돌린다.
   *
   * ⚠ ★2026-09-16 밤★ — 손대는 축을 `riflePower` → `blockChance` 로 옮겼다.
   *   라이플화력이 축에서 내려가 육각형에 그 꼭지점이 없다. ★재는 것은 축 이름이
   *   아니라 뒤집기 기계★ 라서, 지금 있는 축 아무거나로 돌리면 뜻이 같다.
   */
  it('**「짧을수록 좋다」 축은 뒤집힌다** — 기계가 아직 산다', () => {
    const was = CLAN_HEX_V2_LOWER_IS_BETTER.blockChance
    CLAN_HEX_V2_LOWER_IS_BETTER.blockChance = true
    try {
      const [fast, slow] = normalizeAgainstFoe(
        oneAxis('blockChance', 15),
        oneAxis('blockChance', 30),
      )
      expect(axisOf(fast, 'blockChance').value).toBe(1)
      expect(axisOf(slow, 'blockChance').value).toBeCloseTo(0.5, 10)
      /* 뒤집힌 것은 `value` 뿐이다. 원값은 그대로 */
      expect(axisOf(fast, 'blockChance').raw).toBe(15)
      expect(axisOf(slow, 'blockChance').raw).toBe(30)
    } finally {
      CLAN_HEX_V2_LOWER_IS_BETTER.blockChance = was
    }
  })

  /* ⚠ 옛 기대값 — 이 시험은 «라이플화력은 안 뒤집힌다» 였다 (2026-09-16 밤에 교대) */
  it('기회차단은 **안 뒤집힌다** — 높은 쪽이 1.0 이다', () => {
    const [strong, weak] = normalizeAgainstFoe(
      oneAxis('blockChance', 0.4),
      oneAxis('blockChance', 0.2),
    )
    expect(axisOf(strong, 'blockChance').value).toBe(1)
    expect(axisOf(weak, 'blockChance').value).toBeCloseTo(0.5, 10)
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

  /*
   * ⚠ ★2026-09-15★ — 옛 시험은 «게임템포는 짧을수록 높은 백분위다» 였다. 위와 같은 뜻으로 옮겼다
   * ⚠ ★2026-09-16 밤★ — 손대는 축을 `riflePower` → `blockChance` 로 옮겼다 (축에서 내려갔다).
   *   재는 것은 축 이름이 아니라 ★부호 뒤집기★ 라서 지금 있는 축 아무거나로 돌리면 뜻이 같다.
   */
  it('「짧을수록 좋다」 축은 **짧을수록 높은 백분위**다 — 기계가 아직 산다', () => {
    const was = CLAN_HEX_V2_LOWER_IS_BETTER.blockChance
    CLAN_HEX_V2_LOWER_IS_BETTER.blockChance = true
    try {
      const cohort = [10, 20, 30, 40, 50, 60].map((raw) => oneAxis('blockChance', raw))
      const fast = normalizeByPercentile(oneAxis('blockChance', 5), cohort)
      const slow = normalizeByPercentile(oneAxis('blockChance', 90), cohort)
      expect(axisOf(fast, 'blockChance').value as number).toBeGreaterThan(
        axisOf(slow, 'blockChance').value as number,
      )
    } finally {
      CLAN_HEX_V2_LOWER_IS_BETTER.blockChance = was
    }
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
