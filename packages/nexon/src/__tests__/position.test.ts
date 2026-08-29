import { describe, expect, it } from 'vitest'
import {
  centroidOf,
  centroidsOf,
  classifyPosition,
  cosineSimilarity,
  hasSniperKill,
  histogramOf,
  leaveOneOut,
  positionPointsOf,
  zoneCounts,
  zoneOf,
  type BattleLogPositionEvent,
  type LabeledHistogram,
  type ZoneMap,
} from '../position'

const MAP: ZoneMap = {
  cell: 10,
  zone: {
    '20,30': '2F',
    '21,30': '2F',
    '15,40': 'B',
    '16,40': 'B',
    '30,25': 'SHORT',
  },
}

describe('본인 좌표만 뽑는다', () => {
  it('kill 은 kill_*, death 는 death_* 가 본인 자리다', () => {
    const events: BattleLogPositionEvent[] = [
      { event_type: 'kill', kill_x: 200, kill_y: 300, death_x: 999, death_y: 999 },
      { event_type: 'death', kill_x: 111, kill_y: 111, death_x: 150, death_y: 400 },
    ]
    expect(positionPointsOf(events)).toEqual([
      { x: 200, y: 300 },
      { x: 150, y: 400 },
    ])
  })

  it('폭파·수류탄사 같은 이벤트는 쓰지 않는다 — 위치의 뜻이 다르다', () => {
    const events: BattleLogPositionEvent[] = [
      { event_type: 'bomb', kill_x: 1, kill_y: 1, death_x: 2, death_y: 2 },
      { event_type: 'g_death', kill_x: 3, kill_y: 3, death_x: 4, death_y: 4 },
    ]
    expect(positionPointsOf(events)).toEqual([])
  })

  it('좌표가 문자열로 와도 읽는다. 없으면 그 줄만 버린다', () => {
    const events: BattleLogPositionEvent[] = [
      { event_type: 'kill', kill_x: '200.5', kill_y: '300' },
      { event_type: 'kill', kill_x: null, kill_y: 300 },
      { event_type: 'kill', kill_x: 'x', kill_y: '3' },
    ]
    expect(positionPointsOf(events)).toEqual([{ x: 200.5, y: 300 }])
  })
})

describe('스나 든 판 제외 (실측 75%→80%)', () => {
  it('스나 킬이 하나라도 있으면 그 경기다', () => {
    expect(hasSniperKill([{ event_type: 'kill', weapon: 'sniper' }])).toBe(true)
  })

  it('스나에게 죽은 것은 내가 스나를 든 것이 아니다', () => {
    expect(hasSniperKill([{ event_type: 'death', weapon: 'sniper' }])).toBe(false)
  })

  it('라플만 들었으면 아니다', () => {
    expect(hasSniperKill([{ event_type: 'kill', weapon: 'riple' }])).toBe(false)
  })
})

describe('구역 지도', () => {
  it('좌표를 셀로 접어 구역을 찾는다', () => {
    expect(zoneOf(MAP, { x: 205, y: 309 })).toBe('2F')
    expect(zoneOf(MAP, { x: 159, y: 400 })).toBe('B')
  })

  it('지도에 없는 칸은 null 이다 — 없는 구역을 지어내지 않는다', () => {
    expect(zoneOf(MAP, { x: 900, y: 900 })).toBeNull()
  })

  it('구역별로 센다. 지도 밖은 세지 않는다', () => {
    const counts = zoneCounts(MAP, [
      { x: 205, y: 305 },
      { x: 215, y: 305 },
      { x: 155, y: 405 },
      { x: 900, y: 900 },
    ])
    expect(counts).toEqual({ '2F': 2, B: 1 })
  })
})

describe('격자 분포', () => {
  it('비율로 만든다 — 표본 수가 달라도 견줄 수 있어야 한다', () => {
    const hist = histogramOf([
      { x: 10, y: 10 },
      { x: 15, y: 15 },
      { x: 50, y: 50 },
    ])
    expect(hist).toEqual({ '0,0': 2 / 3, '2,2': 1 / 3 })
  })

  it('좌표가 없으면 빈 분포다', () => {
    expect(histogramOf([])).toEqual({})
  })

  it('같은 자리에 몰린 두 사람은 표본 수가 달라도 같은 분포다', () => {
    const few = histogramOf([{ x: 10, y: 10 }])
    const many = histogramOf(Array.from({ length: 50 }, () => ({ x: 12, y: 13 })))
    expect(cosineSimilarity(few, many)).toBeCloseTo(1)
  })
})

describe('닮음', () => {
  it('겹치는 칸이 없으면 0 이다', () => {
    expect(cosineSimilarity({ '0,0': 1 }, { '9,9': 1 })).toBe(0)
  })

  it('빈 분포와는 0 이다', () => {
    expect(cosineSimilarity({}, { '0,0': 1 })).toBe(0)
  })

  it('중심은 평균이다', () => {
    expect(centroidOf([{ a: 1 }, { a: 0, b: 1 }])).toEqual({ a: 0.5, b: 0.5 })
  })
})

describe('포지션 판정', () => {
  const centroids = {
    '2F': { '10,15': 0.8, '11,15': 0.2 },
    B: { '7,20': 0.9, '8,20': 0.1 },
  }

  it('가장 닮은 쪽을 고르고 2등과의 차이를 남긴다', () => {
    const verdict = classifyPosition({ '10,15': 1 }, centroids)
    expect(verdict.position).toBe('2F')
    expect(verdict.runnerUp).toBe('B')
    expect(verdict.margin).toBeGreaterThan(0)
  })

  it('표본이 없으면 찍지 않는다', () => {
    expect(classifyPosition({}, centroids).position).toBeNull()
  })

  it('중심이 하나도 없으면 찍지 않는다', () => {
    expect(classifyPosition({ '10,15': 1 }, {}).position).toBeNull()
  })

  it('어느 중심과도 겹치지 않으면 찍지 않는다', () => {
    expect(classifyPosition({ '99,99': 1 }, centroids).position).toBeNull()
  })
})

describe('정답 표본 검증', () => {
  const samples: LabeledHistogram[] = [
    { key: 'a', position: '2F', hist: { '10,15': 1 } },
    { key: 'b', position: '2F', hist: { '10,15': 0.9, '11,15': 0.1 } },
    { key: 'c', position: 'B', hist: { '7,20': 1 } },
    { key: 'd', position: 'B', hist: { '7,20': 0.8, '8,20': 0.2 } },
  ]

  it('포지션별 중심을 만든다', () => {
    expect(Object.keys(centroidsOf(samples)).sort()).toEqual(['2F', 'B'])
  })

  it('한 명씩 빼고 맞힌다 — 자기 자신을 중심에 넣지 않는다', () => {
    const result = leaveOneOut(samples)
    expect(result.total).toBe(4)
    expect(result.correct).toBe(4)
    expect(result.accuracy).toBe(1)
  })

  it('정답이 한 명뿐인 포지션은 맞힐 수 없고, 그것을 감추지 않는다', () => {
    const result = leaveOneOut([
      { key: 'a', position: '2F', hist: { '10,15': 1 } },
      { key: 'c', position: 'B', hist: { '7,20': 1 } },
    ])
    expect(result.correct).toBe(0)
    expect(result.misses).toHaveLength(2)
  })
})
