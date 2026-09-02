/**
 * 전투력 육각형의 **좌표와 문구** (`docs/PLAYER_TRAITS_SPEC.md` 4절 · D-185).
 *
 * ── 여기서 고정하는 것
 *   1. **0번 꼭지점이 맨 위**이고 60°씩 돈다 — 계약의 축 순서가 그대로 화면 순서다
 *   2. 축 이름은 그림을 덮지 않게 좌/우로 정렬된다
 *   3. 백분위는 `상위 N%` 로 뒤집어 적는다 (97.5 → 상위 2.5%)
 *   4. 못 재는 이유는 **중복 없이** 한 줄로 모으고, 다 쟀으면 아무 말도 하지 않는다
 */
import { describe, expect, it } from 'vitest'
import type { PlayerTraitAxis } from '@sacloud/contract'
import {
  HEX_CENTER,
  HEX_LABEL_RADIUS,
  HEX_RADIUS,
  axisLabelAnchor,
  axisValueText,
  hexPoint,
  hexPolygon,
  hexRing,
  pendingSummary,
  pendingText,
  topPercentText,
} from '../record/traitCopy'

/** 중심에서 본 각도(도) — 0°가 오른쪽, 시계방향이 양수인 SVG 좌표계다 */
function angleOf(point: { x: number; y: number }): number {
  const degree = (Math.atan2(point.y - HEX_CENTER.y, point.x - HEX_CENTER.x) * 180) / Math.PI
  return (degree + 360) % 360
}

/** 중심에서의 거리 */
function radiusOf(point: { x: number; y: number }): number {
  return Math.hypot(point.x - HEX_CENTER.x, point.y - HEX_CENTER.y)
}

/** 축 하나를 만든다 — 검사하는 값만 넘긴다 */
function axis(over: Partial<PlayerTraitAxis> = {}): PlayerTraitAxis {
  return { key: 'carry', label: '캐리력', percentile: null, pending: 'rounds', ...over }
}

/* -------------------------------------------------------------------------- */

describe('hexPoint — 꼭지점 좌표', () => {
  it('0번이 맨 위다 — 중심보다 y 가 작다', () => {
    const top = hexPoint(0, HEX_RADIUS)
    expect(top.y).toBeLessThan(HEX_CENTER.y)
    // 정확히 중심 바로 위 (반지름만큼)
    expect(top.x).toBeCloseTo(HEX_CENTER.x, 6)
    expect(top.y).toBeCloseTo(HEX_CENTER.y - HEX_RADIUS, 6)
  })

  it('3번은 맨 아래다 — 0번의 정반대', () => {
    const bottom = hexPoint(3, HEX_RADIUS)
    expect(bottom.y).toBeGreaterThan(HEX_CENTER.y)
    expect(bottom.x).toBeCloseTo(HEX_CENTER.x, 6)
    expect(bottom.y).toBeCloseTo(HEX_CENTER.y + HEX_RADIUS, 6)
  })

  it('여섯 점이 60도 간격이다', () => {
    const angles = Array.from({ length: 6 }, (_, index) => angleOf(hexPoint(index, HEX_RADIUS)))
    // 맨 위(0번)는 SVG 좌표계에서 270°
    expect(angles[0]).toBeCloseTo(270, 6)
    for (let index = 1; index < 6; index += 1) {
      const step = ((angles[index] as number) - (angles[index - 1] as number) + 360) % 360
      expect(step).toBeCloseTo(60, 6)
    }
  })

  it('시계방향으로 돈다 — 1번은 오른쪽 위다', () => {
    const next = hexPoint(1, HEX_RADIUS)
    expect(next.x).toBeGreaterThan(HEX_CENTER.x)
    expect(next.y).toBeLessThan(HEX_CENTER.y)
  })

  it('여섯 점 모두 중심에서 같은 거리다', () => {
    for (let index = 0; index < 6; index += 1) {
      expect(radiusOf(hexPoint(index, HEX_RADIUS))).toBeCloseTo(HEX_RADIUS, 6)
    }
  })

  it('반지름이 0이면 전부 중심이다 — 값이 0인 축이 튀어나가지 않는다', () => {
    for (let index = 0; index < 6; index += 1) {
      expect(radiusOf(hexPoint(index, 0))).toBeCloseTo(0, 6)
    }
  })

  it('한 바퀴 돌면 제자리다', () => {
    const start = hexPoint(0, HEX_RADIUS)
    const round = hexPoint(6, HEX_RADIUS)
    expect(round.x).toBeCloseTo(start.x, 6)
    expect(round.y).toBeCloseTo(start.y, 6)
  })

  it('count 를 바꾸면 그 개수로 나눈 각도가 된다', () => {
    // 축이 늘거나 줄어도 그림이 따라온다
    const angles = Array.from({ length: 4 }, (_, index) => angleOf(hexPoint(index, HEX_RADIUS, 4)))
    for (let index = 1; index < 4; index += 1) {
      const step = ((angles[index] as number) - (angles[index - 1] as number) + 360) % 360
      expect(step).toBeCloseTo(90, 6)
    }
  })
})

/* -------------------------------------------------------------------------- */

describe('hexPolygon — points 문자열', () => {
  it('반지름 개수만큼 점을 낸다', () => {
    expect(hexPolygon([10, 20, 30, 40, 50, 60]).split(' ')).toHaveLength(6)
    expect(hexPolygon([10, 20, 30]).split(' ')).toHaveLength(3)
  })

  it('`x,y` 를 공백으로 이어 붙인다', () => {
    for (const pair of hexPolygon([10, 20, 30, 40, 50, 60]).split(' ')) {
      expect(pair).toMatch(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
    }
  })

  it('소수 둘째자리까지 반올림한다', () => {
    for (const pair of hexPolygon(Array.from({ length: 6 }, () => HEX_RADIUS)).split(' ')) {
      for (const value of pair.split(',')) {
        expect(Number(value)).toBe(Math.round(Number(value) * 100) / 100)
      }
    }
  })

  it('첫 점은 중심 바로 위다', () => {
    const [first] = hexPolygon(Array.from({ length: 6 }, () => HEX_RADIUS)).split(' ')
    expect(first).toBe(`${HEX_CENTER.x},${HEX_CENTER.y - HEX_RADIUS}`)
  })

  it('축마다 반지름이 다르면 서로 다른 거리로 찍힌다', () => {
    const points = hexPolygon([10, 60, 10, 60, 10, 60])
      .split(' ')
      .map((pair) => {
        const [x, y] = pair.split(',').map(Number)
        return { x: x as number, y: y as number }
      })
    expect(radiusOf(points[0] as { x: number; y: number })).toBeCloseTo(10, 1)
    expect(radiusOf(points[1] as { x: number; y: number })).toBeCloseTo(60, 1)
  })
})

describe('hexRing — 정육각형 한 겹', () => {
  it('점 6개가 모두 같은 반지름이다', () => {
    const points = hexRing(40)
      .split(' ')
      .map((pair) => {
        const [x, y] = pair.split(',').map(Number)
        return { x: x as number, y: y as number }
      })
    expect(points).toHaveLength(6)
    for (const point of points) expect(radiusOf(point)).toBeCloseTo(40, 1)
  })

  it('반지름이 다르면 다른 겹이 나온다', () => {
    expect(hexRing(20)).not.toBe(hexRing(40))
  })
})

/* -------------------------------------------------------------------------- */

describe('axisLabelAnchor — 축 이름 자리와 정렬', () => {
  it('위·아래 꼭지점은 가운데 정렬이다', () => {
    expect(axisLabelAnchor(0).anchor).toBe('middle')
    expect(axisLabelAnchor(3).anchor).toBe('middle')
  })

  it('오른쪽 꼭지점은 왼쪽 정렬(start)이다', () => {
    expect(axisLabelAnchor(1).anchor).toBe('start')
    expect(axisLabelAnchor(2).anchor).toBe('start')
  })

  it('왼쪽 꼭지점은 오른쪽 정렬(end)이다 — 이름이 그림을 덮지 않는다', () => {
    expect(axisLabelAnchor(4).anchor).toBe('end')
    expect(axisLabelAnchor(5).anchor).toBe('end')
  })

  it('테두리 바깥에 놓인다', () => {
    for (let index = 0; index < 6; index += 1) {
      expect(radiusOf(axisLabelAnchor(index))).toBeGreaterThan(HEX_RADIUS)
      expect(radiusOf(axisLabelAnchor(index))).toBeCloseTo(HEX_LABEL_RADIUS, 1)
    }
  })

  it('좌표는 소수 둘째자리까지 반올림된다', () => {
    for (let index = 0; index < 6; index += 1) {
      const point = axisLabelAnchor(index)
      expect(point.x).toBe(Math.round(point.x * 100) / 100)
      expect(point.y).toBe(Math.round(point.y * 100) / 100)
    }
  })
})

/* -------------------------------------------------------------------------- */

describe('topPercentText — 상위 N%', () => {
  it('백분위 97.5 는 상위 2.5% 다', () => {
    expect(topPercentText(97.5)).toBe('상위 2.5%')
  })

  it('못 잰 축은 null 이다 — `-` 로 채우지 않는다', () => {
    expect(topPercentText(null)).toBeNull()
  })

  it('양 끝을 뒤집는다', () => {
    expect(topPercentText(100)).toBe('상위 0%')
    expect(topPercentText(0)).toBe('상위 100%')
  })

  it('백분위 0 은 유효한 값이라 null 이 되지 않는다', () => {
    // falsy 라고 못 잰 것으로 떨어지면 꼴찌가 `측정중` 으로 숨는다
    expect(topPercentText(0)).not.toBeNull()
  })

  it('한가운데는 상위 50% 다', () => {
    expect(topPercentText(50)).toBe('상위 50%')
  })

  it('소수 첫째자리까지 반올림한다 — 부동소수 찌꺼기를 그대로 적지 않는다', () => {
    expect(topPercentText(71.2)).toBe('상위 28.8%')
    expect(topPercentText(64.83)).toBe('상위 35.2%')
  })
})

/* -------------------------------------------------------------------------- */

describe('pendingText — 못 재는 이유', () => {
  it('다 쟀으면 빈 문자열이다', () => {
    expect(pendingText(null)).toBe('')
  })

  it('이유마다 계약의 문구를 그대로 쓴다', () => {
    expect(pendingText('rounds')).toBe('라운드 복원 필요')
    expect(pendingText('battlelog')).toBe('배틀로그 필요')
    expect(pendingText('position')).toBe('포지션 판정 필요')
    expect(pendingText('games')).toBe('경기 부족')
    expect(pendingText('weapon')).toBe('주무기 미정')
    /* 빈 자리 (D-206) — 나머지 다섯과 뜻이 다르다.
       4번이 `기회창출` 로 채워져(D-214) 지금 이 사유를 쓰는 축은 없지만, 다음 빈 축을
       위해 문구는 남아 있다. 그래서 아래 테스트들은 **축 키가 아니라 사유**로 건다 */
    expect(pendingText('undecided')).toBe('미정')
  })
})

describe('axisValueText — 꼭지점 밑 한마디', () => {
  it('쟀으면 `상위 N%` 다', () => {
    expect(axisValueText(axis({ percentile: 88, pending: null }))).toBe('상위 12%')
  })

  it('재료를 기다리는 축은 `측정중` 이다', () => {
    for (const pending of ['rounds', 'battlelog', 'position', 'games', 'weapon'] as const) {
      expect(axisValueText(axis({ pending }))).toBe('측정중')
    }
  })

  it('빈 자리는 `미정` 이다 — `측정중` 과 구분한다 (D-206)', () => {
    // `측정중` 은 곧 채워진다는 뜻이고, `미정` 은 사람이 정해야 한다는 뜻이다
    expect(axisValueText(axis({ label: '미정', pending: 'undecided' }))).toBe('미정')
  })

  it('값이 있으면 pending 보다 값이 이긴다', () => {
    expect(axisValueText(axis({ percentile: 50, pending: 'undecided' }))).toBe('상위 50%')
  })
})

describe('pendingSummary — 아래 한 줄 요약', () => {
  it('다 쟀으면 빈 문자열이다', () => {
    const measured = Array.from({ length: 6 }, () => axis({ percentile: 50, pending: null }))
    expect(pendingSummary(measured)).toBe('')
    expect(pendingSummary([])).toBe('')
  })

  it('이유가 중복되면 한 번만 적는다', () => {
    const axes = [
      axis({ key: 'save', pending: 'rounds' }),
      axis({ key: 'duel', percentile: 64.8, pending: null }),
      axis({ key: 'carry', percentile: 71.2, pending: null }),
      axis({ key: 'opening', label: '미정', pending: 'undecided' }),
      // 5번 축은 2026-09-02 에 `finish` → `burst` 로 바뀌었다 (D-260).
      // 이 테스트가 보는 것은 `pendingSummary` 의 중복 제거이지 축 자체가 아니라,
      // 키만 옮기고 사유(`position`)는 그대로 둔다 — 그 사유도 지우지 않았다
      axis({ key: 'burst', pending: 'position' }),
      axis({ key: 'outnumbered', pending: 'rounds' }),
    ]
    // `라운드 복원 필요` 가 두 축이지만 문구는 한 번만 나온다.
    // 빈 자리(`미정`)는 항목에서 빠진다 (D-206)
    expect(pendingSummary(axes)).toBe('측정중 3항목 — 라운드 복원 필요 · 포지션 판정 필요')
  })

  it('항목 수는 축 수이고 이유 수와 다를 수 있다', () => {
    const axes = Array.from({ length: 6 }, () => axis({ pending: 'weapon' }))
    expect(pendingSummary(axes)).toBe('측정중 6항목 — 주무기 미정')
  })

  it('처음 나온 순서대로 이유를 잇는다', () => {
    const axes = [
      axis({ key: 'burst', pending: 'position' }),
      axis({ key: 'save', pending: 'rounds' }),
      axis({ key: 'duel', pending: 'battlelog' }),
      axis({ key: 'save', pending: 'rounds' }),
    ]
    expect(pendingSummary(axes)).toBe(
      '측정중 4항목 — 포지션 판정 필요 · 라운드 복원 필요 · 배틀로그 필요',
    )
  })

  it('빈 자리(`미정`)는 `측정중 N항목` 에 넣지 않는다 (D-206)', () => {
    // 재료를 기다리는 중이 아니라 **아직 정하지 않은** 축이다. 섞어 세면 "곧 채워진다" 로 읽힌다
    const axes = [
      axis({ key: 'save', pending: 'rounds' }),
      axis({ key: 'opening', label: '미정', pending: 'undecided' }),
    ]
    expect(pendingSummary(axes)).toBe('측정중 1항목 — 라운드 복원 필요')
    // 빈 자리 하나만 남았으면 아무 말도 하지 않는다 — 꼭지점의 `미정` 이 이미 말한다
    expect(pendingSummary([axis({ label: '미정', pending: 'undecided' })])).toBe('')
  })

  it('값이 있어도 pending 이 남아 있으면 항목에 센다', () => {
    // percentile 이 아니라 pending 이 판정 기준이다
    const axes = [axis({ percentile: 50, pending: 'games' }), axis({ percentile: 50, pending: null })]
    expect(pendingSummary(axes)).toBe('측정중 1항목 — 경기 부족')
  })
})
