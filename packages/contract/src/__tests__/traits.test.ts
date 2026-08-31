/**
 * 전투력 육각형 · 플레이스타일 바 · 주무기 판정 (`docs/PLAYER_TRAITS_SPEC.md` · D-185).
 *
 * 여기서 고정하려는 것은 네 가지다.
 *   1. **모르는 것을 0 으로 채우지 않는다** — 빈 모집단은 `null` 이고, 못 재는 축도 `null` 이다 (D-106)
 *   2. **동점은 절반씩 나눠 갖는다(mid-rank)** — 같은 값이 순서만으로 갈리면 안 된다
 *   3. **주무기가 반반이면 고르지 않는다** — 한 무리에 넣으면 나머지 절반이 엉뚱한 무리에서 견줘진다
 *   4. **축은 언제나 6개 · `TRAIT_AXIS_KEYS` 순서** — 그 순서가 그대로 화면의 시계방향 순서다
 */
import { describe, expect, it } from 'vitest'
import {
  PLAYSTYLE_SIDE_KEYS,
  TRAIT_AXIS_KEYS,
  TRAIT_AXIS_KEYS_V1,
  TRAIT_AXIS_KEYS_V2,
  TRAIT_AXIS_LABEL,
  TRAIT_MIN_GAMES,
  TRAIT_PENDING_TEXT,
  buildPlayerPlaystyle,
  playstyleValueOf,
  buildPlayerTraits,
  isMeasurablePending,
  mainWeaponOf,
  percentileOf,
  type TraitAxis,
  type TraitAxisKey,
  type TraitHexagon,
  type TraitInput,
} from '../traits'

/** 축 하나를 키로 꺼내는 헬퍼 — 배열 인덱스로 집으면 순서가 바뀔 때 조용히 어긋난다 */
function axisOf(hexagon: TraitHexagon, key: TraitAxisKey): TraitAxis {
  const axis = hexagon.axes.find((item) => item.key === key)
  if (!axis) throw new Error(`축 ${key} 가 없다`)
  return axis
}

/**
 * 예전에 빈 자리(`undecided`)를 빼던 헬퍼 (D-206). 4번이 `기회창출` 로 채워져
 * (D-214) 지금은 **여섯 축이 전부** 데이터 상태를 따른다.
 *
 * 이름과 자리를 남겨 둔다 — 빈 축이 다시 생기면 여기가 그 자리다.
 */
function measurableAxes(hexagon: TraitHexagon): TraitAxis[] {
  return hexagon.axes
}

/** 라이플 주무기 · 판수 충분 — 필요한 것만 덮어쓴다 */
function rifleInput(over: Partial<TraitInput> = {}): TraitInput {
  return {
    weapon: 0,
    knownGames: TRAIT_MIN_GAMES,
    cohort: 120,
    carryPercentile: 71.2,
    damagePercentile: 64.8,
    ...over,
  }
}

/* -------------------------------------------------------------------------- */

describe('percentileOf — 백분위', () => {
  it('모집단이 비면 null 이다 — 0(꼴찌)이 아니다', () => {
    expect(percentileOf([], 5)).toBeNull()
    expect(percentileOf([], 0)).toBeNull()
    // 0 으로 떨어지면 "아직 모른다" 가 "제일 못한다" 로 둔갑한다 (D-106)
    expect(percentileOf([], 5)).not.toBe(0)
  })

  it('모집단이 있으면 0 도 유효한 값이다 — null 과 구분한다', () => {
    // 모두보다 작다 = 진짜 꼴찌. 이때의 0 은 "모른다" 가 아니다
    expect(percentileOf([10, 20, 30], 5)).toBe(0)
  })

  it('모두보다 크면 100 이다', () => {
    expect(percentileOf([10, 20, 30], 40)).toBe(100)
  })

  it('최솟값·최댓값 경계는 자기 동점 몫의 절반을 갖는다', () => {
    // 최솟값 10: 아래 0명 · 동점 1명 → rank 0.5 / 4 = 12.5
    expect(percentileOf([10, 20, 30, 40], 10)).toBe(12.5)
    // 최댓값 40: 아래 3명 · 동점 1명 → rank 3.5 / 4 = 87.5
    expect(percentileOf([10, 20, 30, 40], 40)).toBe(87.5)
  })

  it('동점은 절반씩 나눠 갖는다 (mid-rank)', () => {
    // 전원 동점이면 아무도 앞서지 않는다 → 정확히 한가운데
    expect(percentileOf([1, 1, 1, 1], 1)).toBe(50)
    // 아래 2명 · 동점 2명 → rank 3 / 4 = 75
    expect(percentileOf([5, 5, 10, 10], 10)).toBe(75)
    // 아래 0명 · 동점 2명 → rank 1 / 4 = 25
    expect(percentileOf([5, 5, 10, 10], 5)).toBe(25)
  })

  it('같은 값을 가진 사람은 몇 명이든 같은 백분위가 나온다', () => {
    const population = [1, 2, 2, 2, 3]
    // 순서만으로 갈리면 판당 킬처럼 뭉치는 값에서 등수가 요동친다
    expect(percentileOf(population, 2)).toBe(percentileOf(population, 2))
    // 아래 1명 · 동점 3명 → rank 2.5 / 5 = 50
    expect(percentileOf(population, 2)).toBe(50)
  })

  it('모집단에 없는 값도 사이 자리로 잰다', () => {
    // 아래 2명 · 동점 0명 → rank 2 / 4 = 50
    expect(percentileOf([10, 20, 30, 40], 25)).toBe(50)
  })

  it('소수 첫째자리까지 반올림한다', () => {
    // rank 1.5 / 3 = 50, rank 0.5 / 3 = 16.666… → 16.7
    expect(percentileOf([1, 2, 3], 1)).toBe(16.7)
    expect(percentileOf([1, 2, 3], 3)).toBe(83.3)
  })

  it('한 명뿐인 모집단은 자기 자신과 동점이라 50 이다', () => {
    expect(percentileOf([7], 7)).toBe(50)
    expect(percentileOf([7], 8)).toBe(100)
    expect(percentileOf([7], 6)).toBe(0)
  })

  it('음수가 섞여도 순서대로 잰다', () => {
    expect(percentileOf([-30, -10, 0, 10], -10)).toBe(37.5)
  })
})

/* -------------------------------------------------------------------------- */

describe('mainWeaponOf — 주무기', () => {
  it('무기를 아는 판이 하나도 없으면 null', () => {
    expect(mainWeaponOf(0, 0)).toBeNull()
  })

  it('정확히 반반이면 null — 한쪽으로 몰지 않는다', () => {
    expect(mainWeaponOf(5, 5)).toBeNull()
    expect(mainWeaponOf(1, 1)).toBeNull()
    expect(mainWeaponOf(50, 50)).toBeNull()
  })

  it('과반이면 그 무기가 주무기다', () => {
    expect(mainWeaponOf(6, 4)).toBe(0)
    expect(mainWeaponOf(4, 6)).toBe(1)
  })

  it('한 판 차이여도 과반이면 정해진다', () => {
    expect(mainWeaponOf(6, 5)).toBe(0)
    expect(mainWeaponOf(5, 6)).toBe(1)
  })

  it('한쪽만 뛰었으면 그 무기다', () => {
    expect(mainWeaponOf(1, 0)).toBe(0)
    expect(mainWeaponOf(0, 1)).toBe(1)
  })

  it('라이플 0 은 유효한 값이다 — falsy 라고 null 취급하지 않는다', () => {
    const weapon = mainWeaponOf(9, 1)
    expect(weapon).toBe(0)
    expect(weapon).not.toBeNull()
  })
})

/* -------------------------------------------------------------------------- */

describe('buildPlayerTraits — 육각형 뼈대', () => {
  it('축은 언제나 6개이고 TRAIT_AXIS_KEYS 순서다', () => {
    for (const input of [
      rifleInput(),
      rifleInput({ weapon: 1 }),
      rifleInput({ weapon: null }),
      rifleInput({ knownGames: 0 }),
    ]) {
      const hexagon = buildPlayerTraits(input)
      expect(hexagon.axes).toHaveLength(6)
      expect(hexagon.axes.map((axis) => axis.key)).toEqual([...TRAIT_AXIS_KEYS])
    }
  })

  it('knownGames 를 그대로 돌려준다', () => {
    expect(buildPlayerTraits(rifleInput({ knownGames: 37 })).known_games).toBe(37)
    expect(buildPlayerTraits(rifleInput({ knownGames: 0 })).known_games).toBe(0)
  })
})

describe('buildPlayerTraits — 못 재는 경우', () => {
  it('주무기가 null 이면 여섯 축 전부 pending=weapon 이다', () => {
    const hexagon = buildPlayerTraits(rifleInput({ weapon: null }))
    expect(hexagon.weapon).toBeNull()
    expect(measurableAxes(hexagon).every((axis) => axis.pending === 'weapon')).toBe(true)
    // 잴 수 있었던 캐리력·샷싸움도 함께 막힌다 — 누구와 견줄지를 모르기 때문이다
    expect(hexagon.axes.every((axis) => axis.percentile === null)).toBe(true)
    expect(hexagon.measured).toBe(0)
    expect(hexagon.measuring).toBe(true)
    // 4번도 이제 데이터 축이다 — 무기를 모르면 함께 막힌다 (D-214)
    expect(axisOf(hexagon, 'opening').pending).toBe('weapon')
  })

  it('주무기를 모르면 모집단도 null 이다 — 섞어 세지 않는다', () => {
    expect(buildPlayerTraits(rifleInput({ weapon: null, cohort: 120 })).cohort).toBeNull()
  })

  it(`knownGames 가 ${TRAIT_MIN_GAMES}판 미만이면 여섯 축 전부 pending=games 다`, () => {
    const hexagon = buildPlayerTraits(rifleInput({ knownGames: TRAIT_MIN_GAMES - 1 }))
    expect(measurableAxes(hexagon).every((axis) => axis.pending === 'games')).toBe(true)
    expect(hexagon.axes.every((axis) => axis.percentile === null)).toBe(true)
    expect(hexagon.cohort).toBeNull()
    expect(hexagon.measured).toBe(0)
    /* 4번도 같이 막힌다 — `기회창출` 은 더 뛰면 채워지는 축이다 (D-214) */
    expect(axisOf(hexagon, 'opening').pending).toBe('games')
  })

  it(`정확히 ${TRAIT_MIN_GAMES}판이면 재기 시작한다 — 경계는 미만이다`, () => {
    const hexagon = buildPlayerTraits(rifleInput({ knownGames: TRAIT_MIN_GAMES }))
    expect(hexagon.axes.some((axis) => axis.pending === 'games')).toBe(false)
    expect(hexagon.cohort).toBe(120)
  })

  it('주무기와 판수가 둘 다 모자라면 주무기 쪽이 먼저다', () => {
    const hexagon = buildPlayerTraits(rifleInput({ weapon: null, knownGames: 0 }))
    expect(measurableAxes(hexagon).every((axis) => axis.pending === 'weapon')).toBe(true)
  })
})

describe('buildPlayerTraits — 4번은 기회창출이다 (D-214)', () => {
  it('꼭지점은 그대로 6개다 — 오각형이 되지 않는다', () => {
    // 사용자가 육각형을 유지하기로 했다 ("육각그래프는 꼭 쓰고싶은데")
    expect(TRAIT_AXIS_KEYS).toHaveLength(6)
    expect(buildPlayerTraits(rifleInput()).axes).toHaveLength(6)
  })

  it('4번 자리이고 옛 두 판과 같은 자리다', () => {
    expect(TRAIT_AXIS_KEYS[3]).toBe('opening')
    expect(TRAIT_AXIS_KEYS_V2[3]).toBe('undecided')
    expect(TRAIT_AXIS_KEYS_V1[3]).toBe('matchman')
  })

  it('이름은 무기와 무관하게 `기회창출` 이다', () => {
    for (const weapon of [0, 1, null] as const) {
      expect(axisOf(buildPlayerTraits(rifleInput({ weapon })), 'opening').label).toBe('기회창출')
    }
  })

  it('`매치의 사나이` 는 축 목록에서 빠진 채다', () => {
    const hexagon = buildPlayerTraits(rifleInput())
    expect(hexagon.axes.some((axis) => axis.key === 'matchman' as string)).toBe(false)
    expect(hexagon.axes.some((axis) => axis.label === '매치의 사나이')).toBe(false)
  })

  it('옛 축 이름은 지우지 않았다 — MVP 규칙(D-182)이 계속 쓴다', () => {
    expect(TRAIT_AXIS_LABEL.matchman.rifle).toBe('매치의 사나이')
    expect(TRAIT_AXIS_KEYS_V1).toHaveLength(6)
  })

  it('빈 자리였던 판(`undecided`)도 남아 있다 — 다음 빈 축을 위해 지우지 않는다', () => {
    expect(TRAIT_AXIS_KEYS_V2).toHaveLength(6)
    expect(TRAIT_AXIS_LABEL.undecided.rifle).toBe('미정')
    expect(TRAIT_PENDING_TEXT.undecided).toBe('미정')
    expect(isMeasurablePending('undecided')).toBe(false)
    for (const pending of ['rounds', 'battlelog', 'position', 'games', 'weapon'] as const) {
      expect(isMeasurablePending(pending)).toBe(true)
    }
  })

  it('백분위를 주면 그대로 붙는다', () => {
    const axis = axisOf(buildPlayerTraits(rifleInput({ openingPercentile: 82.5 })), 'opening')
    expect(axis).toMatchObject({ percentile: 82.5, pending: null })
  })

  it('재료가 아예 없으면 `라운드 복원 필요` 다 — 0 으로 채우지 않는다', () => {
    const axis = axisOf(buildPlayerTraits(rifleInput()), 'opening')
    expect(axis.percentile).toBeNull()
    expect(axis.percentile).not.toBe(0) // 0 은 "꼴찌" 라는 실제 값이다 (D-106)
    expect(axis.pending).toBe('rounds')
  })

  it('자료는 있는데 표본이 모자라면 `경기 부족` 이다 — 둘을 뭉뚱그리지 않는다', () => {
    const axis = axisOf(
      buildPlayerTraits(rifleInput({ hasRoundData: true, openingPercentile: null })),
      'opening',
    )
    expect(axis.pending).toBe('games')
  })

  it('matchManPercentile 을 넘겨도 무시한다 — 축에 다시 붙지 않는다', () => {
    const hexagon = buildPlayerTraits(rifleInput({ matchManPercentile: 88.8 }))
    expect(hexagon.axes.every((axis) => axis.percentile !== 88.8)).toBe(true)
  })
})

describe('buildPlayerTraits — 축별 판정 (라이플)', () => {
  const hexagon = buildPlayerTraits(rifleInput())

  it('캐리력은 판당 킬 백분위로 채워진다', () => {
    expect(axisOf(hexagon, 'carry')).toMatchObject({ percentile: 71.2, pending: null })
  })

  it('샷싸움(duel)은 딜량 백분위로 채워진다 — 라플은 지금 잴 수 있다', () => {
    expect(axisOf(hexagon, 'duel')).toMatchObject({ percentile: 64.8, pending: null })
  })

  it('원어택 성공률(finish)은 포지션 판정이 먼저다', () => {
    expect(axisOf(hexagon, 'finish')).toMatchObject({ percentile: null, pending: 'position' })
  })

  it('백분위가 없으면 그 축만 pending=games 로 남는다', () => {
    const partial = buildPlayerTraits(rifleInput({ carryPercentile: null }))
    expect(axisOf(partial, 'carry')).toMatchObject({ percentile: null, pending: 'games' })
    // 다른 축까지 막히지 않는다
    expect(axisOf(partial, 'duel').percentile).toBe(64.8)
  })

  it('딜량이 없으면 duel 만 pending=games 다', () => {
    const partial = buildPlayerTraits(rifleInput({ damagePercentile: null }))
    expect(axisOf(partial, 'duel')).toMatchObject({ percentile: null, pending: 'games' })
    expect(axisOf(partial, 'carry').percentile).toBe(71.2)
  })

  it('백분위 0 은 유효한 값이다 — 모르는 것으로 떨어지지 않는다', () => {
    const zero = buildPlayerTraits(rifleInput({ carryPercentile: 0, damagePercentile: 0 }))
    expect(axisOf(zero, 'carry')).toMatchObject({ percentile: 0, pending: null })
    expect(axisOf(zero, 'duel')).toMatchObject({ percentile: 0, pending: null })
    expect(zero.measured).toBe(2)
  })
})

describe('buildPlayerTraits — 축별 판정 (스나이퍼)', () => {
  const hexagon = buildPlayerTraits(rifleInput({ weapon: 1 }))

  it('스나싸움(duel)은 킬로그가 있어야 한다 — 딜량으로 대신 채우지 않는다', () => {
    expect(axisOf(hexagon, 'duel')).toMatchObject({ percentile: null, pending: 'battlelog' })
  })

  it('작업 성공률(finish)도 배틀로그가 필요하다', () => {
    expect(axisOf(hexagon, 'finish')).toMatchObject({ percentile: null, pending: 'battlelog' })
  })

  it('캐리력은 무기와 무관하게 채워진다', () => {
    expect(axisOf(hexagon, 'carry')).toMatchObject({ percentile: 71.2, pending: null })
  })

  it('스나는 잴 수 있는 축이 캐리력 하나뿐이다', () => {
    expect(hexagon.measured).toBe(1)
  })
})

describe('buildPlayerTraits — 라운드 복원이 필요한 축', () => {
  it('세이브·소수싸움은 무기와 무관하게 항상 rounds 다', () => {
    for (const weapon of [0, 1] as const) {
      const hexagon = buildPlayerTraits(rifleInput({ weapon }))
      for (const key of ['save', 'outnumbered'] as const) {
        expect(axisOf(hexagon, key)).toMatchObject({ percentile: null, pending: 'rounds' })
      }
    }
  })
})

describe('buildPlayerTraits — 축 이름은 주무기를 따른다', () => {
  const sniper = buildPlayerTraits(rifleInput({ weapon: 1 }))
  const rifle = buildPlayerTraits(rifleInput({ weapon: 0 }))

  it('스나 화면은 스나싸움 · 작업 성공률', () => {
    expect(axisOf(sniper, 'duel').label).toBe('스나싸움')
    expect(axisOf(sniper, 'finish').label).toBe('작업 성공률')
  })

  it('라플 화면은 샷싸움 · 원어택 성공률', () => {
    expect(axisOf(rifle, 'duel').label).toBe('샷싸움')
    expect(axisOf(rifle, 'finish').label).toBe('원어택 성공률')
  })

  it('나머지 네 축은 무기와 무관하게 같은 이름이다', () => {
    for (const key of ['save', 'carry', 'opening', 'outnumbered'] as const) {
      expect(axisOf(sniper, key).label).toBe(axisOf(rifle, key).label)
      expect(axisOf(sniper, key).label).toBe(TRAIT_AXIS_LABEL[key].sniper)
    }
  })

  it('주무기를 몰라도 이름은 붙는다 (라플 표기가 기본)', () => {
    const unknown = buildPlayerTraits(rifleInput({ weapon: null }))
    expect(axisOf(unknown, 'duel').label).toBe('샷싸움')
    expect(unknown.axes.every((axis) => axis.label.length > 0)).toBe(true)
  })
})

describe('buildPlayerTraits — measured / measuring', () => {
  it('measured 는 값이 있는 축 수다', () => {
    expect(buildPlayerTraits(rifleInput()).measured).toBe(2)
    expect(buildPlayerTraits(rifleInput({ carryPercentile: null })).measured).toBe(1)
    expect(
      buildPlayerTraits(rifleInput({ carryPercentile: null, damagePercentile: null })).measured,
    ).toBe(0)
  })

  it('여섯 축이 다 차지 않으면 measuring 이다', () => {
    // 지금은 어떤 입력으로도 6축을 다 채울 수 없다 — 화면은 항상 `전투력 측정중` 을 함께 적는다
    expect(buildPlayerTraits(rifleInput()).measuring).toBe(true)
    expect(buildPlayerTraits(rifleInput({ weapon: 1 })).measuring).toBe(true)
    expect(buildPlayerTraits(rifleInput({ weapon: null })).measuring).toBe(true)
  })

  it('measured 와 axes 의 실제 값 개수가 어긋나지 않는다', () => {
    for (const input of [rifleInput(), rifleInput({ weapon: 1 }), rifleInput({ knownGames: 3 })]) {
      const hexagon = buildPlayerTraits(input)
      expect(hexagon.measured).toBe(hexagon.axes.filter((axis) => axis.percentile !== null).length)
    }
  })

  it('값이 있는 축은 pending 이 없고, 없는 축은 pending 이 있다', () => {
    const hexagon = buildPlayerTraits(rifleInput())
    for (const axis of hexagon.axes) {
      expect(axis.percentile === null).toBe(axis.pending !== null)
    }
  })
})

/* -------------------------------------------------------------------------- */

describe('buildPlayerPlaystyle — 플레이스타일 바', () => {
  const bars = buildPlayerPlaystyle()

  it('두 줄이고 블루·레드 순서다', () => {
    expect(bars.bars.map((bar) => bar.key)).toEqual([...PLAYSTYLE_SIDE_KEYS])
    expect(bars.bars.map((bar) => bar.side_label)).toEqual(['블루', '레드'])
  })

  it('재료가 없으면 두 줄 다 못 잰다 — 가운데(정석)로 채우지 않는다', () => {
    for (const bar of bars.bars) {
      expect(bar.value).toBeNull()
      expect(bar.value).not.toBe(0) // 0 은 "재 봤더니 가운데" 라는 뜻이다
      expect(bar.pending).toBe('rounds')
    }
    expect(bars.measuring).toBe(true)
  })

  it('진영별 양끝 문구가 다르다', () => {
    const [blue, red] = bars.bars
    expect(blue).toMatchObject({ left_label: '안전함', center_label: '정석', right_label: '변칙적' })
    expect(red).toMatchObject({ left_label: '느린전개', center_label: '정석', right_label: '빠른전개' })
  })

  /* ---- D-211 — 재료가 들어오면 실제로 찍힌다 ---- */

  it('백분위 50 은 정석(0)이고, 100·0 이 양 끝이다', () => {
    expect(playstyleValueOf(50)).toBe(0)
    expect(playstyleValueOf(100)).toBe(100)
    expect(playstyleValueOf(0)).toBe(-100)
    expect(playstyleValueOf(75)).toBe(50)
  })

  it('못 잰 백분위는 null 그대로다 — 가운데로 접지 않는다', () => {
    expect(playstyleValueOf(null)).toBeNull()
  })

  it('두 줄 다 재면 measuring 이 false 다', () => {
    const measured = buildPlayerPlaystyle({
      weapon: 0,
      bluePercentile: 80,
      redPercentile: 20,
      hasRoundData: true,
    })
    expect(measured.bars.map((bar) => bar.value)).toEqual([60, -60])
    expect(measured.bars.every((bar) => bar.pending === null)).toBe(true)
    expect(measured.measuring).toBe(false)
  })

  it('한 줄만 재면 그 줄만 찍고 나머지는 이유를 남긴다', () => {
    const half = buildPlayerPlaystyle({
      weapon: 1,
      bluePercentile: 30,
      redPercentile: null,
      hasRoundData: true,
    })
    expect(half.bars[0]?.value).toBe(-40)
    expect(half.bars[1]?.value).toBeNull()
    /* 자료는 있는데 표본이 모자란 것이라 `경기 부족` 이다 */
    expect(half.bars[1]?.pending).toBe('games')
    expect(half.measuring).toBe(true)
  })

  it('주무기를 모르면 누구와 견줄지도 모른다 — 두 줄 다 주무기 미정이다', () => {
    const unknown = buildPlayerPlaystyle({
      weapon: null,
      bluePercentile: 90,
      redPercentile: 90,
      hasRoundData: true,
    })
    for (const bar of unknown.bars) {
      expect(bar.value).toBeNull()
      expect(bar.pending).toBe('weapon')
    }
  })

  it('자료 자체가 없으면 `라운드 복원 필요` 다 — `경기 부족` 과 구분한다', () => {
    const none = buildPlayerPlaystyle({
      weapon: 0,
      bluePercentile: null,
      redPercentile: null,
      hasRoundData: false,
    })
    for (const bar of none.bars) expect(bar.pending).toBe('rounds')
  })
})
