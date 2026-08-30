/**
 * 스나수의 두 축 — **스나싸움**과 **작업 성공률** (사양 4절 2번·5번 · D-195).
 *
 * 고정하려는 것
 *   1. 죽인 쪽의 **무기 칸을 짝지어** 읽는다 — 엇갈려 읽으면 스나가 라플로 뒤집힌다
 *   2. 좌표는 **죽인 사람이 서 있던 자리**(`kill_*`)다. 죽은 자리가 아니다
 *   3. 반반인 사람의 무기는 **판정하지 않는다** — 모르는 것은 모르는 채로 둔다
 *   4. 상대 무기를 모르는 교전은 **분모에도 넣지 않는다** (D-106)
 *   5. 같은 교전을 양쪽에서 세면 **승률 합이 정확히 50%** 다
 */
import { describe, expect, it } from 'vitest'
import {
  duelTallyOf,
  inZone,
  killsOf,
  weaponAgreementOf,
  weaponByPlayerOf,
  type DuelEvent,
  type KillRecord,
  type Weapon,
  type ZoneCells,
} from '../duel'

/* -------------------------------------------------------------------------- */
/* 픽스처                                                                       */
/* -------------------------------------------------------------------------- */

interface Actor {
  usn: string
  /** 킬로그에 찍히는 무기 키 */
  weapon: string
}

const sniper = (usn: string): Actor => ({ usn, weapon: 'sniper' })
const rifle = (usn: string): Actor => ({ usn, weapon: 'riple' })

/** 셀 10 짜리 격자에서 `"1,2"` 칸 — 스나싸움 구역이라고 치자 */
const ZONE: ZoneCells = { cell: 10, cells: ['1,2'] }

/** 구역 안 두 자리 (둘 다 `"1,2"`) */
const IN_A = { x: 15, y: 25 }
const IN_B = { x: 11, y: 29 }
/** 구역 밖 (`"9,9"`) */
const OUT = { x: 95, y: 95 }
/**
 * 죽은 사람이 서 있던 자리로 쓰는 미끼 값 (`"4,6"`).
 * 구역 판정이 이 칸을 보면 안 된다.
 */
const DEATH_SPOT = { x: 45, y: 65 }

/** 초 → `"MM:SS"` */
function clock(seconds: number): string {
  const mm = Math.floor(seconds / 60)
  const ss = seconds % 60
  return String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0')
}

/**
 * 주체가 죽인 줄 — 죽인 쪽 무기는 `weapon` 칸에 실린다.
 * `target_weapon` 에는 **죽은 쪽 무기를 미끼로** 넣어 둔다. 엇갈려 읽으면 값이 뒤집힌다.
 */
function kill(
  round: number,
  at: number,
  killer: Actor,
  victim: Actor,
  spot: { x: number; y: number } = IN_A,
): DuelEvent {
  return {
    round: String(round),
    event_time: clock(at),
    event_type: 'kill',
    target_event_type: 'death',
    str_usn: killer.usn,
    target_str_usn: victim.usn,
    weapon: killer.weapon,
    target_weapon: victim.weapon,
    kill_x: spot.x,
    kill_y: spot.y,
    death_x: DEATH_SPOT.x,
    death_y: DEATH_SPOT.y,
  }
}

/**
 * 같은 킬을 **죽은 쪽 시점**에서 적은 줄 — 죽인 쪽 무기는 `target_weapon` 칸에 실린다.
 * `weapon` 에는 죽은 쪽 무기가 미끼로 들어 있다.
 */
function killed(
  round: number,
  at: number,
  victim: Actor,
  killer: Actor,
  spot: { x: number; y: number } = IN_A,
): DuelEvent {
  return {
    round: String(round),
    event_time: clock(at),
    event_type: 'death',
    target_event_type: 'kill',
    str_usn: victim.usn,
    target_str_usn: killer.usn,
    weapon: victim.weapon,
    target_weapon: killer.weapon,
    kill_x: spot.x,
    kill_y: spot.y,
    death_x: DEATH_SPOT.x,
    death_y: DEATH_SPOT.y,
  }
}

/** 킬 한 건을 직접 세운다 — `killsOf` 를 거치지 않는 단위 테스트용 */
function rec(
  killer: string,
  victim: string,
  weapon: Weapon | null,
  spot: { x: number; y: number } | null = IN_A,
): KillRecord {
  return { round: 1, killer, victim, weapon, at: spot }
}

/** 무기 판정표를 손으로 세운다 */
function weapons(entries: Record<string, Weapon>): Map<string, Weapon> {
  return new Map(Object.entries(entries) as [string, Weapon][])
}

/* -------------------------------------------------------------------------- */
/* killsOf                                                                     */
/* -------------------------------------------------------------------------- */

describe('killsOf — 킬 한 건씩 뽑기', () => {
  it('event_type 이 kill 이면 **주체**가 죽인 것이고 무기는 `weapon` 칸이다', () => {
    expect(killsOf([kill(1, 10, sniper('A1'), rifle('B1'))])).toEqual([
      { round: 1, killer: 'A1', victim: 'B1', weapon: 1, at: IN_A },
    ])
  })

  it('target_event_type 이 kill 이면 **상대**가 죽인 것이고 무기는 `target_weapon` 칸이다', () => {
    /* 이 줄의 `weapon` 칸에는 죽은 A2 의 라플이 들어 있다.
       엇갈려 읽으면 스나 B1 의 킬이 라플 킬로 뒤집힌다 */
    expect(killsOf([killed(1, 10, rifle('A2'), sniper('B1'))])).toEqual([
      { round: 1, killer: 'B1', victim: 'A2', weapon: 1, at: IN_A },
    ])
  })

  it('죽인 쪽이 라플이면 0 이다 — 미끼로 들어온 상대 스나를 읽지 않는다', () => {
    expect(killsOf([kill(1, 10, rifle('A1'), sniper('B1'))])[0]?.weapon).toBe(0)
    expect(killsOf([killed(1, 10, sniper('A2'), rifle('B1'))])[0]?.weapon).toBe(0)
  })

  it('둘 다 kill 인 줄은 버린다 — 누가 죽였는지 못 읽는다', () => {
    const row = { ...kill(1, 10, sniper('A1'), rifle('B1')), target_event_type: 'kill' }
    expect(killsOf([row])).toEqual([])
  })

  it('둘 다 kill 이 아닌 줄은 버린다 — 죽음이 아니다', () => {
    const row: DuelEvent = {
      round: '1',
      event_time: '00:10',
      event_type: 'hit',
      target_event_type: 'hit',
      str_usn: 'A1',
      target_str_usn: 'B1',
    }
    expect(killsOf([row])).toEqual([])
  })

  it('riple 은 0 · sniper 는 1 · 그 밖의 무기는 null 이다', () => {
    const rows = [
      { ...kill(1, 10, sniper('A1'), rifle('B1')), weapon: 'riple' },
      { ...kill(1, 11, sniper('A1'), rifle('B2')), weapon: 'sniper' },
      { ...kill(1, 12, sniper('A1'), rifle('B3')), weapon: 'throw' },
      { ...kill(1, 13, sniper('A1'), rifle('B4')), weapon: 'close' },
      { ...kill(1, 14, sniper('A1'), rifle('B5')), weapon: '' },
      { ...kill(1, 15, sniper('A1'), rifle('B6')), weapon: null },
    ]
    expect(killsOf(rows).map((k) => k.weapon)).toEqual([0, 1, null, null, null, null])
  })

  it('같은 킬이 두 줄로 와도 **한 번만** 센다 (라운드 · 죽은 사람 · 시각이 같다)', () => {
    const kills = killsOf([
      kill(3, 42, sniper('A1'), rifle('B1')),
      killed(3, 42, rifle('B1'), sniper('A1')),
    ])
    expect(kills).toEqual([{ round: 3, killer: 'A1', victim: 'B1', weapon: 1, at: IN_A }])
  })

  it('같은 사람이 다른 시각에 죽으면 서로 다른 킬이다', () => {
    const kills = killsOf([
      kill(3, 42, sniper('A1'), rifle('B1')),
      kill(3, 55, sniper('A2'), rifle('B1')),
    ])
    expect(kills.map((k) => k.killer)).toEqual(['A1', 'A2'])
  })

  it('좌표는 **죽인 사람이 서 있던 자리**(kill_*)다 — 죽은 자리를 읽지 않는다', () => {
    const kills = killsOf([kill(1, 10, sniper('A1'), rifle('B1'), IN_B)])
    expect(kills[0]?.at).toEqual(IN_B)
    expect(kills[0]?.at).not.toEqual(DEATH_SPOT)
  })

  it('좌표가 없으면 at 은 null 이다 — 0,0 으로 밀어 넣지 않는다', () => {
    const rows = [
      { ...kill(1, 10, sniper('A1'), rifle('B1')), kill_x: null, kill_y: null },
      { ...kill(1, 11, sniper('A1'), rifle('B2')), kill_x: 15, kill_y: null },
      { ...kill(1, 12, sniper('A1'), rifle('B3')), kill_x: '', kill_y: 25 },
    ]
    expect(killsOf(rows).map((k) => k.at)).toEqual([null, null, null])
  })

  it('round 가 0 · 빈 문자열 · null 이면 round 만 null 이고 **킬 자체는 살린다**', () => {
    const rows = [
      { ...kill(1, 10, sniper('A1'), rifle('B1')), round: 0 },
      { ...kill(1, 11, sniper('A1'), rifle('B2')), round: '' },
      { ...kill(1, 12, sniper('A1'), rifle('B3')), round: null },
    ]
    const kills = killsOf(rows)
    expect(kills).toHaveLength(3)
    expect(kills.map((k) => k.round)).toEqual([null, null, null])
    expect(kills.map((k) => k.victim)).toEqual(['B1', 'B2', 'B3'])
  })

  it('누가 죽였는지·누가 죽었는지 모르는 줄은 버린다', () => {
    const rows = [
      { ...kill(1, 10, sniper('A1'), rifle('B1')), str_usn: null },
      { ...kill(1, 11, sniper('A1'), rifle('B2')), target_str_usn: '' },
    ]
    expect(killsOf(rows)).toEqual([])
  })

  it('빈 입력이면 빈 배열이다', () => {
    expect(killsOf([])).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/* weaponByPlayerOf                                                            */
/* -------------------------------------------------------------------------- */

describe('weaponByPlayerOf — 그 경기에서 각자 무엇을 들었나', () => {
  it('자기 킬의 무기로 판정하고 **더 많이 쓴 쪽**을 고른다', () => {
    const map = weaponByPlayerOf([
      rec('A1', 'B1', 1),
      rec('A1', 'B2', 1),
      rec('A1', 'B3', 0),
      rec('B1', 'A2', 0),
      rec('B1', 'A3', 0),
      rec('B1', 'A4', 1),
    ])
    expect(map.get('A1')).toBe(1)
    expect(map.get('B1')).toBe(0)
  })

  it('반반이면 **아예 넣지 않는다** — 한쪽으로 밀면 그 사람의 교전이 통째로 거짓이 된다', () => {
    const map = weaponByPlayerOf([rec('A1', 'B1', 1), rec('A1', 'B2', 0)])
    expect(map.has('A1')).toBe(false)
  })

  it('무기를 모르는 킬은 세지 않는다 — 스나 1 · 미상 3 이면 스나다', () => {
    const map = weaponByPlayerOf([
      rec('A1', 'B1', 1),
      rec('A1', 'B2', null),
      rec('A1', 'B3', null),
      rec('A1', 'B4', null),
    ])
    expect(map.get('A1')).toBe(1)
  })

  it('무기를 아는 킬이 하나도 없으면 넣지 않는다', () => {
    const map = weaponByPlayerOf([rec('A1', 'B1', null)])
    expect(map.has('A1')).toBe(false)
  })

  it('킬이 없는 사람은 Map 에 없다 — 죽기만 한 선수의 무기는 모른다', () => {
    const map = weaponByPlayerOf([rec('A1', 'B1', 1)])
    expect(map.has('B1')).toBe(false)
    expect(map.size).toBe(1)
  })

  it('킬이 하나도 없으면 빈 Map 이다', () => {
    expect(weaponByPlayerOf([]).size).toBe(0)
  })
})

/* -------------------------------------------------------------------------- */
/* inZone                                                                      */
/* -------------------------------------------------------------------------- */

describe('inZone — 그 자리가 구역 안인가', () => {
  it('셀 크기로 나눈 격자가 구역 목록에 있으면 true 다', () => {
    expect(inZone(ZONE, { x: 15, y: 25 })).toBe(true)
    expect(inZone(ZONE, { x: 95, y: 95 })).toBe(false)
  })

  it('point 가 null 이면 false 다 — 모르는 자리를 구역 안으로 치지 않는다', () => {
    expect(inZone(ZONE, null)).toBe(false)
  })

  it('경계값 — 칸의 시작은 포함하고 다음 칸은 제외한다', () => {
    expect(inZone(ZONE, { x: 10, y: 20 })).toBe(true)
    expect(inZone(ZONE, { x: 9, y: 20 })).toBe(false)
    expect(inZone(ZONE, { x: 19, y: 29 })).toBe(true)
    expect(inZone(ZONE, { x: 20, y: 20 })).toBe(false)
    expect(inZone(ZONE, { x: 10, y: 30 })).toBe(false)
    expect(inZone(ZONE, { x: 10, y: 19 })).toBe(false)
  })

  it('셀 크기가 바뀌면 같은 좌표도 다른 칸이다', () => {
    expect(inZone({ cell: 5, cells: ['3,5'] }, { x: 15, y: 25 })).toBe(true)
    expect(inZone({ cell: 5, cells: ['1,2'] }, { x: 15, y: 25 })).toBe(false)
  })

  it('구역이 비어 있으면 언제나 false 다', () => {
    expect(inZone({ cell: 10, cells: [] }, IN_A)).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* duelTallyOf                                                                 */
/* -------------------------------------------------------------------------- */

describe('duelTallyOf — 스나싸움 · 작업 재료', () => {
  it('그 선수가 **스나가 아니면 null 이다. 0 이 아니다**', () => {
    const kills = [rec('A1', 'B1', 0)]
    const tally = duelTallyOf({
      kills,
      weaponByPlayer: weapons({ A1: 0, B1: 1 }),
      usn: 'A1',
      zone: ZONE,
    })
    expect(tally).toBeNull()
  })

  it('그 선수의 무기를 **모르면 null 이다** — 0 을 돌려주지 않는다', () => {
    const tally = duelTallyOf({
      kills: [rec('A1', 'B1', 1)],
      weaponByPlayer: weapons({ B1: 1 }),
      usn: 'A1',
      zone: ZONE,
    })
    expect(tally).toBeNull()
  })

  it('겪은 것이 없으면 전부 0 이다 — null 과 구분된다', () => {
    expect(
      duelTallyOf({ kills: [], weaponByPlayer: weapons({ A1: 1 }), usn: 'A1', zone: ZONE }),
    ).toEqual({ snipeDuels: 0, snipeDuelWins: 0, workKills: 0, workRifleKills: 0 })
  })

  it('작업 — 내 킬 중 상대가 **라플**이면 workRifleKills 가 오른다', () => {
    const tally = duelTallyOf({
      kills: [rec('A1', 'B1', 1), rec('A1', 'B2', 1), rec('A1', 'B3', 1)],
      weaponByPlayer: weapons({ A1: 1, B1: 0, B2: 0, B3: 1 }),
      usn: 'A1',
      zone: ZONE,
    })
    expect(tally?.workKills).toBe(3)
    expect(tally?.workRifleKills).toBe(2)
  })

  it('상대 무기를 모르면 **분모에도 안 들어간다** — 모르는 것을 라플로 세지 않는다', () => {
    const tally = duelTallyOf({
      kills: [rec('A1', 'B1', 1), rec('A1', 'UNKNOWN', 1)],
      weaponByPlayer: weapons({ A1: 1, B1: 0 }),
      usn: 'A1',
      zone: ZONE,
    })
    expect(tally?.workKills).toBe(1)
    expect(tally?.workRifleKills).toBe(1)
  })

  it('내가 **죽은** 교전은 workKills 에 안 들어간다 — 그건 내 킬이 아니다', () => {
    const tally = duelTallyOf({
      kills: [rec('B1', 'A1', 0)],
      weaponByPlayer: weapons({ A1: 1, B1: 0 }),
      usn: 'A1',
      zone: ZONE,
    })
    expect(tally).toEqual({ snipeDuels: 0, snipeDuelWins: 0, workKills: 0, workRifleKills: 0 })
  })

  it('스나싸움 — 구역 안에서 상대 스나를 잡으면 교전과 승리가 함께 오른다', () => {
    const tally = duelTallyOf({
      kills: [rec('A1', 'B1', 1, IN_A)],
      weaponByPlayer: weapons({ A1: 1, B1: 1 }),
      usn: 'A1',
      zone: ZONE,
    })
    expect(tally).toEqual({ snipeDuels: 1, snipeDuelWins: 1, workKills: 1, workRifleKills: 0 })
  })

  it('스나싸움 — 구역 안에서 상대 스나에게 죽으면 **분모에만** 오른다', () => {
    const tally = duelTallyOf({
      kills: [rec('B1', 'A1', 1, IN_B)],
      weaponByPlayer: weapons({ A1: 1, B1: 1 }),
      usn: 'A1',
      zone: ZONE,
    })
    expect(tally).toEqual({ snipeDuels: 1, snipeDuelWins: 0, workKills: 0, workRifleKills: 0 })
  })

  it('구역 **밖**의 스나 교전은 세지 않는다 — 작업 쪽에는 그대로 남는다', () => {
    const tally = duelTallyOf({
      kills: [rec('A1', 'B1', 1, OUT), rec('B2', 'A1', 1, OUT)],
      weaponByPlayer: weapons({ A1: 1, B1: 1, B2: 1 }),
      usn: 'A1',
      zone: ZONE,
    })
    expect(tally).toEqual({ snipeDuels: 0, snipeDuelWins: 0, workKills: 1, workRifleKills: 0 })
  })

  it('구역 안이어도 상대가 **라플**이면 스나싸움이 아니다', () => {
    const tally = duelTallyOf({
      kills: [rec('A1', 'B1', 1, IN_A)],
      weaponByPlayer: weapons({ A1: 1, B1: 0 }),
      usn: 'A1',
      zone: ZONE,
    })
    expect(tally).toEqual({ snipeDuels: 0, snipeDuelWins: 0, workKills: 1, workRifleKills: 1 })
  })

  it('자리를 모르는(at 이 null) 교전은 스나싸움으로 세지 않는다', () => {
    const tally = duelTallyOf({
      kills: [rec('A1', 'B1', 1, null)],
      weaponByPlayer: weapons({ A1: 1, B1: 1 }),
      usn: 'A1',
      zone: ZONE,
    })
    expect(tally).toEqual({ snipeDuels: 0, snipeDuelWins: 0, workKills: 1, workRifleKills: 0 })
  })

  it('나와 무관한 제3자끼리의 킬은 아무것도 세지 않는다', () => {
    const tally = duelTallyOf({
      kills: [rec('B1', 'A2', 1, IN_A), rec('A3', 'B2', 1, IN_A)],
      weaponByPlayer: weapons({ A1: 1, A2: 1, A3: 1, B1: 1, B2: 1 }),
      usn: 'A1',
      zone: ZONE,
    })
    expect(tally).toEqual({ snipeDuels: 0, snipeDuelWins: 0, workKills: 0, workRifleKills: 0 })
  })

  it('구역 판정은 **죽인 쪽 자리**로 한다 — 죽은 자리가 구역이어도 세지 않는다', () => {
    /* 죽인 쪽은 구역 밖(OUT), 죽은 쪽 자리(DEATH_SPOT)만 구역인 상황 */
    const deathZone: ZoneCells = { cell: 10, cells: ['4,6'] }
    const tally = duelTallyOf({
      kills: [rec('A1', 'B1', 1, OUT)],
      weaponByPlayer: weapons({ A1: 1, B1: 1 }),
      usn: 'A1',
      zone: deathZone,
    })
    expect(tally?.snipeDuels).toBe(0)
  })
})

/* -------------------------------------------------------------------------- */
/* 같은 교전을 양쪽에서 세면 승률 합이 정확히 50%                                  */
/* -------------------------------------------------------------------------- */

describe('스나싸움 승률의 총합은 정확히 50% 다', () => {
  /** 이벤트에서 모든 스나의 재료를 모아 총 교전·총 승리를 낸다 */
  function totals(events: DuelEvent[]) {
    const kills = killsOf(events)
    const weaponByPlayer = weaponByPlayerOf(kills)
    let duels = 0
    let wins = 0
    for (const usn of weaponByPlayer.keys()) {
      const tally = duelTallyOf({ kills, weaponByPlayer, usn, zone: ZONE })
      if (!tally) continue
      duels += tally.snipeDuels
      wins += tally.snipeDuelWins
    }
    return { duels, wins }
  }

  it('한 번의 교전은 이긴 쪽 1승/1교전 · 진 쪽 0승/1교전이다', () => {
    const A1 = sniper('A1')
    const B1 = sniper('B1')
    const events = [
      /* 구역 안 교전 — A1 이 B1 을 잡았다 */
      kill(1, 10, A1, B1, IN_A),
      /* B1 을 스나로 판정시키기 위한 구역 밖 킬. 상대(A2)는 킬이 없어 무기를 모른다 */
      kill(2, 20, B1, rifle('A2'), OUT),
    ]
    const kills = killsOf(events)
    const weaponByPlayer = weaponByPlayerOf(kills)
    expect(weaponByPlayer.get('A1')).toBe(1)
    expect(weaponByPlayer.get('B1')).toBe(1)

    const a = duelTallyOf({ kills, weaponByPlayer, usn: 'A1', zone: ZONE })
    const b = duelTallyOf({ kills, weaponByPlayer, usn: 'B1', zone: ZONE })
    expect(a?.snipeDuels).toBe(1)
    expect(a?.snipeDuelWins).toBe(1)
    expect(b?.snipeDuels).toBe(1)
    expect(b?.snipeDuelWins).toBe(0)

    const { duels, wins } = totals(events)
    expect(duels).toBe(2)
    expect(wins).toBe(1)
    expect(wins / duels).toBe(0.5)
  })

  it('여러 교전을 모두 합쳐도 승률 총합은 정확히 50% 다', () => {
    const A1 = sniper('A1')
    const A2 = sniper('A2')
    const B1 = sniper('B1')
    const B2 = sniper('B2')
    const events = [
      kill(1, 10, A1, B1, IN_A),
      kill(2, 20, A1, B1, IN_B),
      kill(3, 30, B1, A2, IN_A),
      kill(4, 40, A2, B2, IN_B),
      kill(5, 50, B2, A1, IN_A),
    ]

    const kills = killsOf(events)
    const weaponByPlayer = weaponByPlayerOf(kills)
    const tallyOf = (usn: string) => duelTallyOf({ kills, weaponByPlayer, usn, zone: ZONE })

    expect(tallyOf('A1')).toMatchObject({ snipeDuels: 3, snipeDuelWins: 2 })
    expect(tallyOf('B1')).toMatchObject({ snipeDuels: 3, snipeDuelWins: 1 })
    expect(tallyOf('A2')).toMatchObject({ snipeDuels: 2, snipeDuelWins: 1 })
    expect(tallyOf('B2')).toMatchObject({ snipeDuels: 2, snipeDuelWins: 1 })

    const { duels, wins } = totals(events)
    expect(duels).toBe(10)
    expect(wins).toBe(5)
    expect(wins / duels).toBe(0.5)
  })

  it('구역 밖 교전을 섞어도 총합은 여전히 정확히 50% 다 — 양쪽이 같이 빠진다', () => {
    const A1 = sniper('A1')
    const B1 = sniper('B1')
    const events = [
      kill(1, 10, A1, B1, IN_A),
      /* 구역 밖 교전 — 두 사람 모두의 분모에서 함께 빠져야 한다 */
      kill(2, 20, B1, A1, OUT),
      kill(3, 30, A1, B1, OUT),
    ]
    const { duels, wins } = totals(events)
    expect(duels).toBe(2)
    expect(wins).toBe(1)
    expect(wins / duels).toBe(0.5)
  })
})

/* -------------------------------------------------------------------------- */
/* weaponAgreementOf                                                           */
/* -------------------------------------------------------------------------- */

describe('weaponAgreementOf — 킬로그 판정과 DB 무기의 교차검산', () => {
  it('같으면 same · 다르면 different 로 센다', () => {
    const result = weaponAgreementOf(
      weapons({ A1: 1, A2: 0, A3: 1 }),
      weapons({ A1: 1, A2: 0, A3: 0 }),
    )
    expect(result).toEqual({ compared: 3, same: 2, different: 1, onlyInferred: 0 })
  })

  it('정답에 없는 사람은 onlyInferred 다 — 분모에 넣지 않는다', () => {
    const result = weaponAgreementOf(weapons({ A1: 1, A2: 1 }), weapons({ A1: 1 }))
    expect(result).toEqual({ compared: 1, same: 1, different: 0, onlyInferred: 1 })
  })

  it('정답에만 있는 사람은 아무 데도 안 센다 — 킬로그가 판정하지 못한 것이다', () => {
    const result = weaponAgreementOf(weapons({ A1: 1 }), weapons({ A1: 1, A9: 0 }))
    expect(result).toEqual({ compared: 1, same: 1, different: 0, onlyInferred: 0 })
  })

  it('둘 다 비어 있으면 전부 0 이다', () => {
    expect(weaponAgreementOf(new Map(), new Map())).toEqual({
      compared: 0,
      same: 0,
      different: 0,
      onlyInferred: 0,
    })
  })
})
