/**
 * ★구역별 어택/방어 · 자리★ — 사장님 규칙이 코드에 그대로 있는지 (2026-09-17).
 *
 * 값을 지어내지 않는다. 아래 라운드는 ★실제 배틀로그★ 다 —
 * sometimes vs methodcrew (`260817230952124001`) 3라운드. 사장님이 직접 짚으신 라운드다:
 *
 * > «3라운드는 교환이야. 에이를 3명이나 왔는데 3명까진 막았지만 마지막에 우리스나가
 * >  로둥이한테 죽고 그걸 saylove가 마무리한거잖아. 이건 진짜 에이 잘막은거야»
 */
import { describe, expect, it } from 'vitest'

import {
  A_ZONE_LABELS,
  B_ZONE_LABELS,
  POSITION_MIN_GAMES,
  POSITION_MIN_RATIO,
  POSITION_SNIPER_SHARE,
  SHORT_KILL_ZONE_LABELS,
  buildZoneIndex,
  judgeExchange,
  judgeShort,
  positionOf,
  sideAxisOfPosition,
  zoneCellsOfAnyLabels,
  type AnyZoneFile,
  type PlayerSeatTally,
  type SideKill,
} from '../sideAxes'

/* 칸 10 짜리 작은 지도 — 실제 좌표를 10으로 나눈 칸 그대로다 */
const STYLE: AnyZoneFile = {
  cell: 10,
  zone: {
    '34,27': 'MERI',      // 347,271 — Nostalgia♡ 가 죽은 자리
    '25,27': 'HOLJEONG',  // 255,272 — plumda 가 쏜 자리
    '26,27': 'HOLJEONG',  // 269,274 · 264,278 — felony·plumda 가 죽은 자리
    '37,26': 'NOKDWI',    // 370,268 — wavycake 가 쏜 자리
    '36,27': 'NOKDWI',    // 363,274 — wavycake 가 죽은 자리
    '15,38': 'BIRONG',    // 154,382 — 래띠 가 죽은 자리
    '29,32': 'HOLJEONG',
  },
}
const FLOOR: AnyZoneFile = {
  cell: 10,
  zone: {
    '22,44': 'BADAK',     // 227,440 — summerkeshi 가 쏜 자리
    '29,32': ['SHORT'],   // 292,321 — 겹쳐 그은 좁은 자리라 배열이다
  },
}
const FILES = [STYLE, FLOOR]

const at = (x: number, y: number) => ({ x, y })
/** `def` 는 «죽은 쪽이 수비인가» — 3라운드 수비는 sometimes 다 */
const kill = (kx: number, ky: number, dx: number, dy: number, victimIsDefence: boolean): SideKill => ({
  killAt: at(kx, ky),
  deathAt: at(dx, dy),
  victimIsDefence,
  killerIsDefence: !victimIsDefence,
})

/* ★실제 3라운드★ — 시각순 일곱 건 */
const ROUND_3: SideKill[] = [
  kill(227, 440, 154, 382, false), // summerkeshi(수비) → 래띠   · 바닥에서 쏨, 비롱에서 죽음
  kill(255, 272, 347, 271, true),  // plumda(공격) → Nostalgia♡ · 홀정면에서 쏨, ★머리★ 에서 죽음
  kill(347, 271, 269, 274, false), // Nostalgia♡ 수류탄 → felony · ★머리★ 에서 쏨
  kill(347, 271, 264, 278, false), // Nostalgia♡ 수류탄 → plumda · ★머리★ 에서 쏨
  kill(370, 268, 264, 270, false), // wavycake(수비) → 선농설렁탕 · ★녹뒤★ 에서 쏨
  kill(267, 274, 363, 274, true),  // 로둥이(공격) → wavycake  · ★녹뒤★ 에서 죽음
  kill(292, 321, 284, 271, false), // sayIove(수비) → 로둥이   · 숏+홀정면에서 쏨
]

describe('구역 파일 두 벌 합치기', () => {
  it('한 칸이 여러 구역일 수 있다 (`floor-zones` 는 값이 배열이다)', () => {
    const idx = buildZoneIndex(FILES)
    expect(idx).not.toBeNull()
    expect([...(idx?.at(292, 321) ?? [])].sort()).toEqual(['HOLJEONG', 'SHORT'])
  })

  it('★(0,0) 은 좌표 없음이다★ — 맵 구석이 아니다', () => {
    const idx = buildZoneIndex(FILES)
    expect(idx?.at(0, 0)).toEqual([])
    expect(idx?.at(null, 5)).toEqual([])
  })

  it('파일이 비면 null 이다 — 구역을 모르면서 판정하지 않는다', () => {
    expect(buildZoneIndex([])).toBeNull()
    expect(zoneCellsOfAnyLabels([], ['MERI'])).toBeNull()
  })

  it('없는 이름을 지어내지 않는다 — 0칸이면 null 이다', () => {
    expect(zoneCellsOfAnyLabels(FILES, ['그런구역없음'])).toBeNull()
  })
})

describe('★사장님이 짚으신 3라운드★ — A 는 막은 것이다', () => {
  const aZone = zoneCellsOfAnyLabels(FILES, A_ZONE_LABELS)

  it('A 교전 다섯 건에서 수비 2 · 공격 3 — ★막음★', () => {
    const v = judgeExchange(ROUND_3, aZone)
    expect(v.engagements).toBe(5)
    expect(v.defenceDeaths).toBe(2)
    expect(v.attackDeaths).toBe(3)
    expect(v.breached).toBe(false)
    expect(v.judged).toBe(true)
  })

  it('⚠ 옛 셈이었으면 뚫림이었다 — 2번째 킬에 머리에서 잡혔다', () => {
    /* 옛 규칙: 3번째 킬 이내에 A구역에서 한 번이라도 잡히면 뚫림 */
    const oldBreach = ROUND_3.slice(0, 3).some((k) => k.victimIsDefence && k.deathAt.x === 347)
    expect(oldBreach).toBe(true)
    /* 그런데 사장님은 «진짜 에이 잘막은거야» 라 하셨다 → 새 셈이 맞다 */
    expect(judgeExchange(ROUND_3, aZone).breached).toBe(false)
  })

  it('★비김은 막음이다★', () => {
    const even: SideKill[] = [
      kill(347, 271, 269, 274, false),
      kill(255, 272, 347, 271, true),
    ]
    const v = judgeExchange(even, aZone)
    expect(v.defenceDeaths).toBe(1)
    expect(v.attackDeaths).toBe(1)
    expect(v.breached).toBe(false)
  })

  it('★교전 0건이면 판정 없음★ — 분모에서 빠진다', () => {
    const v = judgeExchange([kill(227, 440, 154, 382, false)], zoneCellsOfAnyLabels(FILES, ['ICHUNG']))
    expect(v.judged).toBe(false)
    expect(v.breached).toBe(false)
  })

  it('B 는 비롱·바닥 교전을 잡는다', () => {
    const v = judgeExchange(ROUND_3, zoneCellsOfAnyLabels(FILES, B_ZONE_LABELS))
    expect(v.engagements).toBe(1)
    expect(v.breached).toBe(false) // 죽은 쪽이 공격(래띠)이다
  })

  it('구역을 모르면 판정하지 않는다 (null)', () => {
    expect(judgeExchange(ROUND_3, null).judged).toBe(false)
  })
})

describe('숏은 ★잡았나★ 로 센다 — 교전 차가 아니다', () => {
  const shortKill = zoneCellsOfAnyLabels(FILES, SHORT_KILL_ZONE_LABELS)

  it('공격이 다섯 구역에서 잡으면 숏어택 성공', () => {
    /* 3라운드는 수비가 머리·녹뒤에서 잡았다 — ★공격은 못 잡았다★ */
    const v = judgeShort(ROUND_3, shortKill)
    expect(v.breached).toBe(false)
    expect(v.judged).toBe(true) // ★숏은 교전 0건이어도 분모에 남는다★
  })

  it('공격이 머리에서 잡으면 성공이다', () => {
    const v = judgeShort([kill(347, 271, 100, 100, true)], shortKill)
    expect(v.breached).toBe(true)
  })

  it('★죽은 자리는 안 본다★ — 잡은 사람이 그 자리에 있어야 한다', () => {
    /* 공격이 머리에서 «죽기만» 한 것은 숏어택이 아니다 */
    const v = judgeShort([kill(100, 100, 347, 271, false)], shortKill)
    expect(v.breached).toBe(false)
  })
})

describe('자리(포지션)', () => {
  const base: PlayerSeatTally = {
    games: 100, kills: 200, sniperKills: 0,
    bSpots: 0, f2Spots: 0, shortSpots: 0, spots: 100,
  }

  it('★30경기 미만은 자리를 안 붙인다★', () => {
    const v = positionOf({ ...base, games: POSITION_MIN_GAMES - 1, bSpots: 90 })
    expect(v.key).toBeNull()
    expect(v.pending).toBe('games')
  })

  it('스나가 먼저다 — 어느 구역에 앉든 스나다', () => {
    const v = positionOf({ ...base, sniperKills: 200 * POSITION_SNIPER_SHARE, bSpots: 90 })
    expect(v.key).toBe('sniper')
  })

  it('★스나 문턱을 낮추면 안 된다★ — 김철영(스나킬 41%)은 숏이다', () => {
    /* 사장님: «김철영 숏 맞아». 41% 는 50% 문턱 아래라 스나가 아니다 */
    const v = positionOf({ ...base, kills: 100, sniperKills: 41, bSpots: 29, f2Spots: 13, shortSpots: 26 })
    expect(v.key).not.toBe('sniper')
  })

  it('비중 1위가 자리다', () => {
    expect(positionOf({ ...base, bSpots: 64, f2Spots: 9, shortSpots: 11 }).key).toBe('biribe')
    expect(positionOf({ ...base, bSpots: 14, f2Spots: 58, shortSpots: 11 }).key).toBe('f2')
    expect(positionOf({ ...base, bSpots: 10, f2Spots: 14, shortSpots: 54 }).key).toBe('short')
  })

  it('★1·2위가 붙어 있으면 올포지션★ — 틀린 이름보다 없는 편이 낫다', () => {
    /* 불개미321 — B 26 / 2층 25 / 숏 27. 1.04배다 */
    const v = positionOf({ ...base, bSpots: 26, f2Spots: 25, shortSpots: 27 })
    expect(v.key).toBe('all')
    expect(v.ratio).toBeLessThan(POSITION_MIN_RATIO)
  })

  it('올포지션·자리불명은 구역을 안 나눈 합계를 쓴다', () => {
    expect(sideAxisOfPosition('all')).toBeNull()
    expect(sideAxisOfPosition(null)).toBeNull()
    expect(sideAxisOfPosition('biribe')).toBe('b')
    expect(sideAxisOfPosition('f2')).toBe('f2')
    expect(sideAxisOfPosition('short')).toBe('short')
    /* ★스나는 자리로 안 갈린다★ — 사장님 사양이 A·B 로 못박혀 있다 */
    expect(sideAxisOfPosition('sniper')).toBeNull()
  })

  it('자취가 아예 없으면 자리를 안 붙인다', () => {
    const v = positionOf({ ...base, spots: 0 })
    expect(v.key).toBeNull()
    expect(v.pending).toBe('spots')
  })
})
