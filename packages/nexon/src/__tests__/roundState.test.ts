/**
 * 라운드 복원 — 누가 언제 죽었나 (D-194).
 *
 * 고정하려는 것
 *   1. 못 읽은 값은 **`null` 이다. `0` 이 아니다** — 0초·0회는 실제 값이다
 *   2. 명단은 주체와 상대 **양쪽**에서 모으고, 어긋나면 그 사람을 버린다
 *   3. 같은 죽음이 두 줄로 와도 한 번만 센다
 *   4. 혼자 남음 · 둘이 남음은 **동료가 본인보다 먼저 죽은 수**로 판정한다
 *   5. **2:1 은 소수싸움이 아니다** (사양 4절 6번)
 *   6. 마지막 라운드 최다 킬은 동률이면 찍지 않는다 (사양 4절 4번)
 */
import { describe, expect, it } from 'vitest'
import {
  isRestorable,
  lastRoundTopKiller,
  rosterOf,
  roundStatesOf,
  roundTallyOf,
  secondsOf,
  type RoundStateEvent,
} from '../roundState'

/* -------------------------------------------------------------------------- */
/* 픽스처                                                                       */
/* -------------------------------------------------------------------------- */

interface Actor {
  usn: string
  /** `team_no` — 클랜 번호다. 진영이 아니다 (D-184) */
  team: string
}

/** 조회 클랜 5명 */
const A = (n: number): Actor => ({ usn: 'A' + n, team: '0' })
/** 상대 클랜 5명 */
const B = (n: number): Actor => ({ usn: 'B' + n, team: '1' })

/** 초 → `"MM:SS"` (경기 시작부터의 누적 시간) */
function clock(seconds: number): string {
  const mm = Math.floor(seconds / 60)
  const ss = seconds % 60
  return String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0')
}

/** 킬 줄 — 주체가 죽였고 상대가 죽었다 */
function kill(round: number, at: number, killer: Actor, dead: Actor): RoundStateEvent {
  return {
    round: String(round),
    event_time: clock(at),
    event_type: 'kill',
    target_event_type: 'death',
    str_usn: killer.usn,
    team_no: killer.team,
    target_str_usn: dead.usn,
    target_team_no: dead.team,
  }
}

/** 같은 킬을 죽은 쪽에서 적은 줄 — 양쪽이 다 조회 클랜이면 이렇게 두 번 온다 */
function killed(round: number, at: number, dead: Actor, killer: Actor): RoundStateEvent {
  return {
    round: String(round),
    event_time: clock(at),
    event_type: 'death',
    target_event_type: 'kill',
    str_usn: dead.usn,
    team_no: dead.team,
    target_str_usn: killer.usn,
    target_team_no: killer.team,
  }
}

/** 죽음이 아닌 줄 — 명단에는 올라가지만 라운드 복원에는 잡히면 안 된다 */
function meet(a: Actor, b: Actor): RoundStateEvent {
  return {
    round: '1',
    event_time: '00:01',
    event_type: 'hit',
    target_event_type: 'hit',
    str_usn: a.usn,
    team_no: a.team,
    target_str_usn: b.usn,
    target_team_no: b.team,
  }
}

/** 5대5 명단만 세워 두는 줄들 — 죽음은 한 건도 만들지 않는다 */
function fullRoster(): RoundStateEvent[] {
  return [1, 2, 3, 4, 5].map((n) => meet(A(n), B(n)))
}

/** 지정한 라운드만 이겼다고 답하는 `wonRound` */
const wonOnly =
  (...rounds: number[]) =>
  (round: number): boolean =>
    rounds.includes(round)

/** 승패를 모른다 */
const wonUnknown = (): null => null

/* -------------------------------------------------------------------------- */
/* secondsOf                                                                   */
/* -------------------------------------------------------------------------- */

describe('secondsOf — "MM:SS" 를 초로', () => {
  it('분과 초를 합쳐 초로 만든다', () => {
    expect(secondsOf('01:05')).toBe(65)
    expect(secondsOf('00:59')).toBe(59)
    expect(secondsOf('23:11')).toBe(1391)
  })

  it('"00:00" 은 0 이다 — 경기 시작 순간이라는 실제 값이다', () => {
    expect(secondsOf('00:00')).toBe(0)
  })

  it('읽을 수 없으면 **null 이다. 0 이 아니다** — 0으로 두면 그 라운드의 첫 죽음이 된다', () => {
    expect(secondsOf(null)).toBeNull()
    expect(secondsOf(undefined)).toBeNull()
    expect(secondsOf('')).toBeNull()
    expect(secondsOf('   ')).toBeNull()
    expect(secondsOf('abc')).toBeNull()
  })

  it('콜론이 둘이면 버린다 — "1:2:3" 을 앞 두 칸만 읽지 않는다', () => {
    expect(secondsOf('1:2:3')).toBeNull()
  })

  it('초가 60 이상이면 버린다 — 시:분을 초로 잘못 읽지 않는다', () => {
    expect(secondsOf('01:60')).toBeNull()
    expect(secondsOf('01:99')).toBeNull()
  })

  it('음수도 버린다', () => {
    expect(secondsOf('-1:00')).toBeNull()
    expect(secondsOf('01:-5')).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* rosterOf                                                                    */
/* -------------------------------------------------------------------------- */

describe('rosterOf — 그 경기에 뛴 사람', () => {
  it('주체와 상대 **양쪽 모두**에서 사람을 모은다', () => {
    const roster = rosterOf([kill(1, 10, B(1), A(2))])
    expect(roster.teamOf.get('B1')).toBe('1')
    expect(roster.teamOf.get('A2')).toBe('0')
    expect(roster.teamOf.size).toBe(2)
  })

  it('같은 사람이 두 팀으로 나오면 **버린다** — 다수결하지 않는다', () => {
    const roster = rosterOf([
      kill(1, 10, B(1), A(2)),
      kill(1, 20, B(1), { usn: 'A2', team: '1' }),
      kill(1, 30, B(1), { usn: 'A2', team: '0' }),
    ])
    expect(roster.teamOf.has('A2')).toBe(false)
    expect(roster.teamOf.get('B1')).toBe('1')
    /* 버려진 사람은 인원수에도 들어가지 않는다 */
    expect(roster.sizeOf.get('0')).toBeUndefined()
    expect(roster.sizeOf.get('1')).toBe(1)
  })

  it('teams 는 정렬돼 있다 — 나온 순서가 아니다', () => {
    const roster = rosterOf([kill(1, 10, B(1), A(1)), kill(1, 20, { usn: 'C1', team: '2' }, A(2))])
    expect(roster.teams).toEqual(['0', '1', '2'])
  })

  it('sizeOf 가 팀별 인원을 센다', () => {
    const roster = rosterOf(fullRoster())
    expect(roster.sizeOf.get('0')).toBe(5)
    expect(roster.sizeOf.get('1')).toBe(5)
    expect(roster.teams).toEqual(['0', '1'])
  })

  it('빈 이벤트면 아무도 없다', () => {
    const roster = rosterOf([])
    expect(roster.teams).toEqual([])
    expect(roster.teamOf.size).toBe(0)
  })
})

/* -------------------------------------------------------------------------- */
/* isRestorable                                                                */
/* -------------------------------------------------------------------------- */

describe('isRestorable — 복원해도 되는 경기인가', () => {
  it('팀이 둘이고 양쪽 다 정확히 teamSize 명이면 복원한다', () => {
    expect(isRestorable(rosterOf(fullRoster()), 5)).toBe(true)
  })

  it('한 팀이 4명이면 복원하지 않는다 — 못 본 죽음이 있을 수 있다', () => {
    const events = [1, 2, 3, 4].map((n) => meet(A(n), B(n))).concat(meet(A(1), B(5)))
    const roster = rosterOf(events)
    expect(roster.sizeOf.get('0')).toBe(4)
    expect(roster.sizeOf.get('1')).toBe(5)
    expect(isRestorable(roster, 5)).toBe(false)
  })

  it('팀이 셋이면 복원하지 않는다', () => {
    const events = fullRoster().concat(meet({ usn: 'C1', team: '2' }, A(1)))
    expect(isRestorable(rosterOf(events), 5)).toBe(false)
  })

  it('팀이 하나면 복원하지 않는다', () => {
    const roster = rosterOf([meet(A(1), A(2)), meet(A(3), A(4)), meet(A(5), A(1))])
    expect(roster.teams).toEqual(['0'])
    expect(isRestorable(roster, 5)).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* roundStatesOf                                                               */
/* -------------------------------------------------------------------------- */

describe('roundStatesOf — 라운드마다 죽은 순서', () => {
  it('event_type 이 death 면 **주체**가 죽은 것이다', () => {
    const states = roundStatesOf([killed(1, 10, A(2), B(1))])
    expect(states.get(1)).toEqual({ round: 1, deaths: [{ usn: 'A2', team: '0', at: 10 }] })
  })

  it('target_event_type 이 death 면 **상대**가 죽은 것이다', () => {
    const states = roundStatesOf([kill(1, 10, B(1), A(2))])
    expect(states.get(1)).toEqual({ round: 1, deaths: [{ usn: 'A2', team: '0', at: 10 }] })
  })

  it('둘 다 death 인 줄은 버린다 — 누가 죽었는지 못 읽는다', () => {
    const row = { ...kill(1, 10, B(1), A(2)), event_type: 'death' }
    expect(roundStatesOf([row]).size).toBe(0)
  })

  it('둘 다 death 가 아닌 줄은 버린다 — 죽음이 아니다', () => {
    expect(roundStatesOf([meet(A(1), B(1))]).size).toBe(0)
  })

  it('같은 죽음이 두 줄로 와도 **한 번만** 센다', () => {
    const states = roundStatesOf([kill(3, 42, B(1), A(2)), killed(3, 42, A(2), B(1))])
    expect(states.get(3)?.deaths).toEqual([{ usn: 'A2', team: '0', at: 42 }])
  })

  it('죽음을 시각 오름차순으로 정렬한다', () => {
    const states = roundStatesOf([
      kill(1, 90, B(1), A(4)),
      kill(1, 12, B(2), A(3)),
      kill(1, 45, B(3), A(5)),
    ])
    expect(states.get(1)?.deaths.map((death) => death.at)).toEqual([12, 45, 90])
    expect(states.get(1)?.deaths.map((death) => death.usn)).toEqual(['A3', 'A5', 'A4'])
  })

  it('라운드는 1부터다 — null · 빈 문자열 · 0 인 줄은 버린다', () => {
    const rows = [
      { ...kill(1, 10, B(1), A(2)), round: null },
      { ...kill(1, 11, B(1), A(3)), round: '' },
      { ...kill(1, 12, B(1), A(4)), round: '0' },
      { ...kill(1, 13, B(1), A(5)), round: 0 },
    ]
    expect(roundStatesOf(rows).size).toBe(0)
  })

  it('시각을 못 읽는 줄은 버린다 — 0초로 밀어 넣지 않는다', () => {
    const row = { ...kill(1, 10, B(1), A(2)), event_time: 'abc' }
    expect(roundStatesOf([row]).size).toBe(0)
  })

  it('라운드별로 나눠 담는다', () => {
    const states = roundStatesOf([kill(1, 10, B(1), A(2)), kill(2, 20, B(1), A(3))])
    expect([...states.keys()].sort()).toEqual([1, 2])
    expect(states.get(2)?.deaths).toEqual([{ usn: 'A3', team: '0', at: 20 }])
  })
})

/* -------------------------------------------------------------------------- */
/* roundTallyOf                                                                */
/* -------------------------------------------------------------------------- */

describe('roundTallyOf — 세이브 · 소수싸움 재료', () => {
  it('복원 불가 경기는 **null 이다. 0 이 아니다** — 셀 수 없는 것과 없는 것은 다르다', () => {
    const events = [1, 2, 3, 4].map((n) => meet(A(n), B(n))).concat(meet(A(1), B(5)))
    expect(roundTallyOf({ events, usn: 'A1', teamSize: 5, wonRound: wonOnly() })).toBeNull()
  })

  it('그 선수가 명단에 없으면 null 이다', () => {
    expect(
      roundTallyOf({ events: fullRoster(), usn: 'ZZ', teamSize: 5, wonRound: wonOnly() }),
    ).toBeNull()
  })

  it('겪은 적이 없으면 전부 0 이다 — null 과 구분된다', () => {
    expect(roundTallyOf({ events: fullRoster(), usn: 'A1', teamSize: 5, wonRound: wonOnly() })).toEqual({
      alone: 0,
      aloneWon: 0,
      outnumbered: 0,
      outnumberedWon: 0,
    })
  })

  it('동료 4명이 먼저 죽으면 혼자 남은 것이다 — 이겼으면 aloneWon 도 오른다', () => {
    const events = [
      ...fullRoster(),
      kill(1, 10, B(1), A(2)),
      kill(1, 20, B(1), A(3)),
      kill(1, 30, B(2), A(4)),
      kill(1, 40, B(2), A(5)),
    ]
    expect(roundTallyOf({ events, usn: 'A1', teamSize: 5, wonRound: wonOnly(1) })).toEqual({
      alone: 1,
      aloneWon: 1,
      outnumbered: 0,
      outnumberedWon: 0,
    })
  })

  it('혼자 남은 라운드를 소수싸움으로 **중복해서 세지 않는다**', () => {
    const events = [
      ...fullRoster(),
      kill(1, 10, B(1), A(2)),
      kill(1, 20, B(1), A(3)),
      kill(1, 30, B(2), A(4)),
      kill(1, 40, B(2), A(5)),
    ]
    const tally = roundTallyOf({ events, usn: 'A1', teamSize: 5, wonRound: wonOnly(1) })
    expect(tally?.alone).toBe(1)
    expect(tally?.outnumbered).toBe(0)
  })

  it('본인이 죽었어도 **동료 전원이 먼저** 죽었으면 혼자 남았던 것이다', () => {
    const events = [
      ...fullRoster(),
      kill(2, 10, B(1), A(2)),
      kill(2, 20, B(1), A(3)),
      kill(2, 30, B(2), A(4)),
      kill(2, 40, B(2), A(5)),
      kill(2, 50, B(3), A(1)),
    ]
    expect(roundTallyOf({ events, usn: 'A1', teamSize: 5, wonRound: wonOnly() })).toEqual({
      alone: 1,
      aloneWon: 0,
      outnumbered: 0,
      outnumberedWon: 0,
    })
  })

  it('본인이 **먼저** 죽었으면 혼자 남은 것이 아니다', () => {
    const events = [
      ...fullRoster(),
      kill(2, 10, B(1), A(1)),
      kill(2, 20, B(1), A(2)),
      kill(2, 30, B(2), A(3)),
      kill(2, 40, B(2), A(4)),
      kill(2, 50, B(3), A(5)),
    ]
    expect(roundTallyOf({ events, usn: 'A1', teamSize: 5, wonRound: wonOnly(2) })).toEqual({
      alone: 0,
      aloneWon: 0,
      outnumbered: 0,
      outnumberedWon: 0,
    })
  })

  it('진 라운드는 분모에만 남는다 — alone 은 오르고 aloneWon 은 그대로다', () => {
    const events = [
      ...fullRoster(),
      kill(1, 10, B(1), A(2)),
      kill(1, 20, B(1), A(3)),
      kill(1, 30, B(2), A(4)),
      kill(1, 40, B(2), A(5)),
    ]
    expect(roundTallyOf({ events, usn: 'A1', teamSize: 5, wonRound: () => false })).toEqual({
      alone: 1,
      aloneWon: 0,
      outnumbered: 0,
      outnumberedWon: 0,
    })
  })

  it('승패를 모르는 라운드도 분모에는 남는다 — 이긴 쪽으로는 세지 않는다', () => {
    const events = [
      ...fullRoster(),
      kill(1, 10, B(1), A(2)),
      kill(1, 20, B(1), A(3)),
      kill(1, 30, B(2), A(4)),
      kill(1, 40, B(2), A(5)),
    ]
    expect(roundTallyOf({ events, usn: 'A1', teamSize: 5, wonRound: wonUnknown })).toEqual({
      alone: 1,
      aloneWon: 0,
      outnumbered: 0,
      outnumberedWon: 0,
    })
  })

  it('동료 3명이 먼저 죽고 상대가 아직 3명이면 소수싸움이다 (2:3)', () => {
    const events = [
      ...fullRoster(),
      kill(1, 5, A(1), B(1)),
      kill(1, 10, B(3), A(3)),
      kill(1, 15, A(2), B(2)),
      kill(1, 20, B(3), A(4)),
      kill(1, 30, B(4), A(5)),
    ]
    expect(roundTallyOf({ events, usn: 'A1', teamSize: 5, wonRound: wonOnly(1) })).toEqual({
      alone: 0,
      aloneWon: 0,
      outnumbered: 1,
      outnumberedWon: 1,
    })
  })

  it('**2:1 은 세지 않는다** — 우리가 유리한 상황이라 능력의 증거가 아니다', () => {
    const events = [
      ...fullRoster(),
      kill(1, 5, A(1), B(1)),
      kill(1, 8, A(1), B(2)),
      kill(1, 10, B(5), A(3)),
      kill(1, 12, A(2), B(3)),
      kill(1, 20, B(5), A(4)),
      kill(1, 25, A(2), B(4)),
      kill(1, 30, B(5), A(5)),
    ]
    expect(roundTallyOf({ events, usn: 'A1', teamSize: 5, wonRound: wonOnly(1) })).toEqual({
      alone: 0,
      aloneWon: 0,
      outnumbered: 0,
      outnumberedWon: 0,
    })
  })

  it('진 소수싸움도 분모에는 남는다', () => {
    const events = [
      ...fullRoster(),
      kill(1, 5, A(1), B(1)),
      kill(1, 10, B(3), A(3)),
      kill(1, 15, A(2), B(2)),
      kill(1, 20, B(3), A(4)),
      kill(1, 30, B(4), A(5)),
    ]
    expect(roundTallyOf({ events, usn: 'A1', teamSize: 5, wonRound: () => false })).toEqual({
      alone: 0,
      aloneWon: 0,
      outnumbered: 1,
      outnumberedWon: 0,
    })
  })

  it('같은 사람이 한 라운드에 두 번 죽어 오면 **한 번으로 접는다** — 없던 세이브를 만들지 않는다', () => {
    /*
      한 경기를 두 클랜이 각각 보내면 같은 죽음의 `event_time` 이 1초 어긋나 들어온다.
      그러면 그 사람이 두 번 죽은 것이 되어 살아 있는 사람 수가 틀어지고,
      **없던 세이브가 생긴다.** 라운드별로 한 사람은 한 번만 센다.
      아래에서 B1 이 5초·6초에 두 번 죽는데, 접고 나면 상대는 정상적으로 5명이 죽는다.
    */
    const events = [
      ...fullRoster(),
      /* 1라운드: B1 이 두 줄로 죽어 온다 */
      kill(1, 10, B(1), A(2)),
      kill(1, 20, B(1), A(3)),
      kill(1, 30, B(2), A(4)),
      kill(1, 40, B(2), A(5)),
      kill(1, 5, A(1), B(1)),
      kill(1, 6, A(1), B(1)),
      kill(1, 7, A(1), B(2)),
      kill(1, 8, A(1), B(3)),
      kill(1, 9, A(1), B(4)),
      kill(1, 11, A(1), B(5)),
      /* 2라운드: 멀쩡하다 */
      kill(2, 10, B(1), A(2)),
      kill(2, 20, B(1), A(3)),
      kill(2, 30, B(2), A(4)),
      kill(2, 40, B(2), A(5)),
    ]
    /* 두 라운드 다 A1 이 혼자 남아 이겼다. 접지 않았다면 1라운드가 통째로 버려졌다 */
    expect(roundTallyOf({ events, usn: 'A1', teamSize: 5, wonRound: wonOnly(1, 2) })).toEqual({
      alone: 2,
      aloneWon: 2,
      outnumbered: 0,
      outnumberedWon: 0,
    })
  })

  it('같은 죽음이 두 줄로 와도 한 번만 세어 혼자 남음 판정이 흔들리지 않는다', () => {
    const events = [
      ...fullRoster(),
      kill(1, 10, B(1), A(2)),
      killed(1, 10, A(2), B(1)),
      kill(1, 20, B(1), A(3)),
      killed(1, 20, A(3), B(1)),
      kill(1, 30, B(2), A(4)),
      kill(1, 40, B(2), A(5)),
    ]
    expect(roundTallyOf({ events, usn: 'A1', teamSize: 5, wonRound: wonOnly(1) })).toEqual({
      alone: 1,
      aloneWon: 1,
      outnumbered: 0,
      outnumberedWon: 0,
    })
  })
})

/* -------------------------------------------------------------------------- */
/* lastRoundTopKiller                                                          */
/* -------------------------------------------------------------------------- */

describe('lastRoundTopKiller — 매치의 사나이', () => {
  it('**마지막 라운드**만 본다 — 앞 라운드를 아무리 쓸어도 소용없다', () => {
    const events = [
      kill(1, 10, A(1), B(1)),
      kill(1, 11, A(1), B(2)),
      kill(1, 12, A(1), B(3)),
      kill(1, 13, A(1), B(4)),
      kill(2, 20, B(5), A(2)),
      kill(2, 21, B(5), A(3)),
      kill(2, 22, A(1), B(1)),
    ]
    expect(lastRoundTopKiller(events)).toBe('B5')
  })

  it('입력 순서가 아니라 **가장 큰 라운드 번호**가 마지막이다', () => {
    const events = [
      kill(9, 90, B(5), A(2)),
      kill(9, 91, B(5), A(3)),
      kill(2, 20, A(1), B(1)),
      kill(2, 21, A(1), B(2)),
      kill(2, 22, A(1), B(3)),
    ]
    expect(lastRoundTopKiller(events)).toBe('B5')
  })

  it('동률이면 **null 이다 — 찍지 않는다**', () => {
    const events = [kill(3, 10, A(1), B(1)), kill(3, 20, A(2), B(2))]
    expect(lastRoundTopKiller(events)).toBeNull()
  })

  it('죽은 쪽에서 적은 줄도 같은 킬로 본다 — 두 번 세면 동률이 깨진다', () => {
    const events = [
      kill(1, 10, A(1), B(1)),
      killed(1, 10, B(1), A(1)),
      kill(1, 20, A(1), B(2)),
      kill(1, 30, A(2), B(3)),
      kill(1, 40, A(2), B(4)),
    ]
    /* 중복을 세면 A1 이 3킬로 단독 1위가 된다. 제대로 세면 2대2 동률이다 */
    expect(lastRoundTopKiller(events)).toBeNull()
  })

  it('킬이 하나도 없으면 null 이다', () => {
    expect(lastRoundTopKiller([])).toBeNull()
    expect(lastRoundTopKiller([meet(A(1), B(1))])).toBeNull()
  })

  it('양쪽 다 kill 인 줄은 읽을 수 없으니 버린다', () => {
    const row = { ...kill(1, 10, A(1), B(1)), target_event_type: 'kill' }
    expect(lastRoundTopKiller([row])).toBeNull()
  })

  it('라운드나 시각을 못 읽는 줄은 세지 않는다', () => {
    const events = [
      { ...kill(1, 10, A(1), B(1)), round: null },
      { ...kill(1, 20, A(1), B(2)), event_time: '' },
      kill(1, 30, A(2), B(3)),
    ]
    expect(lastRoundTopKiller(events)).toBe('A2')
  })
})
