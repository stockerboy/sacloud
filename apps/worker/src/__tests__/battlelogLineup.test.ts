import { describe, expect, it } from 'vitest'
import {
  accountsOf,
  planLineup,
  teamClanMapOf,
  type LineupEvent,
} from '../lib/battlelogLineup.js'

/**
 * 킬 한 건을 배틀로그 한 줄로 만든다.
 *
 * 실제 응답과 같은 모양이다 — 한 줄이 킬 하나를 **양쪽에서** 적는다
 * (`event_type='kill'` 이면 주체가 죽였고 상대가 죽었다).
 */
function kill(input: {
  round: number
  time: string
  killer: string
  killerTeam: string
  victim: string
  victimTeam: string
  weapon?: string
  killerNick?: string
  victimNick?: string
  eventKey?: number
}): LineupEvent {
  return {
    round: String(input.round),
    event_time: input.time,
    event_key: input.eventKey ?? null,
    event_type: 'kill',
    target_event_type: 'death',
    str_usn: input.killer,
    team_no: input.killerTeam,
    user_nick: input.killerNick ?? null,
    user_nexon_sn: null,
    target_str_usn: input.victim,
    target_team_no: input.victimTeam,
    target_user_nick: input.victimNick ?? null,
    target_user_nexon_sn: null,
    weapon: input.weapon ?? 'riple',
    target_weapon: '',
    kill_x: 100,
    kill_y: 200,
  }
}

const RED_CLAN = 'clan-red'
const BLUE_CLAN = 'clan-blue'
const TEAM_LIST = [
  { team_no: '0', clan_no: '111' },
  { team_no: '1', clan_no: '222' },
]
const resolveClanNo = (clanNo: string) =>
  clanNo === '111' ? RED_CLAN : clanNo === '222' ? BLUE_CLAN : null

/** 2대2 로 양 팀이 꽉 찬 경기. 팀 0 이 3킬, 팀 1 이 1킬 */
function fullMatchEvents(): LineupEvent[] {
  return [
    kill({ round: 1, time: '00:10', killer: 'A1', killerTeam: '0', victim: 'B1', victimTeam: '1', killerNick: '가' }),
    kill({ round: 1, time: '00:20', killer: 'A2', killerTeam: '0', victim: 'B2', victimTeam: '1', weapon: 'sniper' }),
    kill({ round: 2, time: '01:00', killer: 'B1', killerTeam: '1', victim: 'A1', victimTeam: '0' }),
    kill({ round: 2, time: '01:30', killer: 'A2', killerTeam: '0', victim: 'B1', victimTeam: '1', weapon: 'sniper' }),
  ]
}

const base = {
  teamList: TEAM_LIST,
  resolveClanNo,
  redClanId: RED_CLAN,
  blueClanId: BLUE_CLAN,
  teamSize: 2,
}

describe('teamClanMapOf', () => {
  it('팀번호와 클랜번호를 짝짓는다', () => {
    expect([...teamClanMapOf(TEAM_LIST)]).toEqual([
      ['0', '111'],
      ['1', '222'],
    ])
  })

  it('한 팀번호가 클랜 둘을 가리키면 그 줄을 버린다 — 다수결하지 않는다', () => {
    const map = teamClanMapOf([
      { team_no: '0', clan_no: '111' },
      { team_no: '0', clan_no: '999' },
      { team_no: '1', clan_no: '222' },
    ])
    expect(map.has('0')).toBe(false)
    expect(map.get('1')).toBe('222')
  })

  it('빈 칸은 무시한다', () => {
    expect(teamClanMapOf([{ team_no: null, clan_no: '111' }, { team_no: '1' }]).size).toBe(0)
  })
})

describe('accountsOf', () => {
  it('주체 줄과 상대 줄 양쪽에서 닉을 모은다', () => {
    const accounts = accountsOf([
      kill({
        round: 1,
        time: '00:10',
        killer: 'A1',
        killerTeam: '0',
        victim: 'B1',
        victimTeam: '1',
        killerNick: '가',
        victimNick: '나',
      }),
    ])
    expect(accounts.get('A1')?.nickname).toBe('가')
    expect(accounts.get('B1')?.nickname).toBe('나')
  })

  it('빈 칸이 아는 닉을 지우지 않는다', () => {
    const accounts = accountsOf([
      kill({ round: 1, time: '00:10', killer: 'A1', killerTeam: '0', victim: 'B1', victimTeam: '1', killerNick: '가' }),
      kill({ round: 2, time: '01:10', killer: 'A1', killerTeam: '0', victim: 'B1', victimTeam: '1' }),
    ])
    expect(accounts.get('A1')?.nickname).toBe('가')
  })
})

describe('planLineup', () => {
  it('양 팀이 꽉 차면 킬·데스·무기·진영을 만든다', () => {
    const plan = planLineup({ ...base, events: fullMatchEvents() })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return

    expect(plan.players).toHaveLength(4)
    const byUsn = new Map(plan.players.map((p) => [p.usn, p]))

    /* 팀 0 은 red 클랜(111)이다 */
    expect(byUsn.get('A1')?.side).toBe('red')
    expect(byUsn.get('B1')?.side).toBe('blue')

    /* A2 는 2킬 0데스 · 둘 다 스나 */
    expect(byUsn.get('A2')).toMatchObject({ kill: 2, death: 0, weapon: 1 })
    /* A1 은 1킬 1데스 · 라플 */
    expect(byUsn.get('A1')).toMatchObject({ kill: 1, death: 1, weapon: 0 })
    /* B1 은 1킬 2데스 */
    expect(byUsn.get('B1')).toMatchObject({ kill: 1, death: 2 })
    /* B2 는 킬이 없어 무기를 모른다 — 라플로 밀지 않는다 */
    expect(byUsn.get('B2')).toMatchObject({ kill: 0, death: 1, weapon: null })
  })

  it('한 경기의 킬 합과 데스 합이 같다', () => {
    const plan = planLineup({ ...base, events: fullMatchEvents() })
    if (!plan.ok) throw new Error('계획이 나와야 한다')
    const kills = plan.players.reduce((sum, p) => sum + p.kill, 0)
    const deaths = plan.players.reduce((sum, p) => sum + p.death, 0)
    expect(kills).toBe(deaths)
    expect(kills).toBe(4)
  })

  it('명단이 모자라면 넣지 않는다 — 9명짜리 경기가 분모를 깎는다', () => {
    /* B2 가 한 번도 안 나오는 경기 */
    const events = fullMatchEvents().filter((e) => e.target_str_usn !== 'B2')
    const plan = planLineup({ ...base, events })
    expect(plan).toEqual({ ok: false, reason: 'roster_incomplete' })
  })

  it('이벤트가 없으면 no_events', () => {
    expect(planLineup({ ...base, events: [] })).toEqual({ ok: false, reason: 'no_events' })
  })

  it('클랜번호를 못 이으면 clan_unmapped — 추측해서 잇지 않는다', () => {
    const plan = planLineup({ ...base, events: fullMatchEvents(), resolveClanNo: () => null })
    expect(plan).toEqual({ ok: false, reason: 'clan_unmapped' })
  })

  it('이은 클랜이 그 경기의 진영이 아니면 side_mismatch', () => {
    const plan = planLineup({
      ...base,
      events: fullMatchEvents(),
      resolveClanNo: (no) => (no === '111' ? RED_CLAN : 'clan-남'),
    })
    expect(plan).toEqual({ ok: false, reason: 'side_mismatch' })
  })

  it('양 팀이 같은 클랜으로 풀리면 side_mismatch', () => {
    const plan = planLineup({ ...base, events: fullMatchEvents(), resolveClanNo: () => RED_CLAN })
    expect(plan).toEqual({ ok: false, reason: 'side_mismatch' })
  })

  it('teamList 가 두 팀을 다 알려 주지 않으면 no_team_list', () => {
    const plan = planLineup({ ...base, events: fullMatchEvents(), teamList: [TEAM_LIST[0]!] })
    expect(plan).toEqual({ ok: false, reason: 'no_team_list' })
  })

  it('teamList 의 팀번호가 이벤트와 다른 세계면 team_no_mismatch', () => {
    const plan = planLineup({
      ...base,
      events: fullMatchEvents(),
      teamList: [
        { team_no: '7', clan_no: '111' },
        { team_no: '8', clan_no: '222' },
      ],
    })
    expect(plan).toEqual({ ok: false, reason: 'team_no_mismatch' })
  })

  it('같은 킬이 두 줄로 와도 한 번만 센다', () => {
    const events = [...fullMatchEvents(), fullMatchEvents()[0] as LineupEvent]
    const plan = planLineup({ ...base, events })
    if (!plan.ok) throw new Error('계획이 나와야 한다')
    const a1 = plan.players.find((p) => p.usn === 'A1')
    expect(a1?.kill).toBe(1)
  })

  it('결과 순서가 입력 순서에 흔들리지 않는다 (멱등한 보고)', () => {
    const forward = planLineup({ ...base, events: fullMatchEvents() })
    const backward = planLineup({ ...base, events: [...fullMatchEvents()].reverse() })
    if (!forward.ok || !backward.ok) throw new Error('둘 다 계획이 나와야 한다')
    expect(forward.players.map((p) => p.usn)).toEqual(backward.players.map((p) => p.usn))
  })
})

/** 자살 — **주체형.** 죽은 사람이 `str_usn` 에 있다 */
function suicide(input: { round: number; time: string; usn: string; team: string; eventKey: number }): LineupEvent {
  return {
    round: String(input.round),
    event_time: input.time,
    event_key: input.eventKey,
    event_type: 'g_death',
    target_event_type: null,
    str_usn: input.usn,
    team_no: input.team,
    user_nexon_sn: null,
    /* 실측: 주체형 자살 줄의 `target_str_usn` 은 **사람이 아니라 자리표시자**이고
       `target_team_no` 가 null 이라 명단에 들어가지 않는다 */
    target_str_usn: 'PLACEHOLDER',
    target_team_no: null,
  }
}

/** 낙사 — **상대형.** `target_str_usn` 이 비어 있고 숫자 계정값만 있다 (실측) */
function fallDeathOfOpponent(input: {
  round: number
  time: string
  nexonSn: string
  team: string
  eventKey: number
}): LineupEvent {
  return {
    round: String(input.round),
    event_time: input.time,
    event_key: input.eventKey,
    event_type: '',
    target_event_type: 'f_death',
    str_usn: '',
    team_no: '',
    target_str_usn: '',
    target_team_no: input.team,
    target_user_nexon_sn: input.nexonSn,
  }
}

describe('죽음 세기 — 자살은 데스가 아니고 낙사는 데스다 (2026-09-01 실측)', () => {
  it('자살(g_death)은 데스로 세지 않는다 — 3rd.supply 도 안 센다', () => {
    const events = [
      ...fullMatchEvents(),
      suicide({ round: 3, time: '02:00', usn: 'B2', team: '1', eventKey: 900 }),
    ]
    const plan = planLineup({ ...base, events })
    if (!plan.ok) throw new Error('계획이 나와야 한다')
    /* B2 는 킬 이벤트에서 이미 1데스다. 자살을 세면 2가 된다 */
    expect(plan.players.find((p) => p.usn === 'B2')?.death).toBe(1)
  })

  it('자살 줄의 자리표시자를 명단에 넣지 않는다 — 11명이 되면 안 된다', () => {
    const events = [
      ...fullMatchEvents(),
      suicide({ round: 3, time: '02:00', usn: 'B2', team: '1', eventKey: 900 }),
    ]
    const plan = planLineup({ ...base, events })
    if (!plan.ok) throw new Error('계획이 나와야 한다')
    expect(plan.players).toHaveLength(4)
    expect(plan.players.map((p) => p.usn)).not.toContain('PLACEHOLDER')
  })

  it('낙사(f_death)는 데스로 센다 — 죽인 사람이 없어도 죽음이다', () => {
    const events: LineupEvent[] = [
      /* A1 에게 숫자 계정값을 달아 둔다 — 상대형 낙사는 그것으로만 사람을 안다 */
      { ...(fullMatchEvents()[0] as LineupEvent), user_nexon_sn: '111' },
      ...fullMatchEvents().slice(1),
      fallDeathOfOpponent({ round: 3, time: '02:30', nexonSn: '111', team: '0', eventKey: 901 }),
    ]
    const plan = planLineup({ ...base, events })
    if (!plan.ok) throw new Error('계획이 나와야 한다')
    /* A1 은 킬 이벤트로 1데스 + 낙사 1 = 2 */
    expect(plan.players.find((p) => p.usn === 'A1')?.death).toBe(2)
  })

  it('누구인지 못 이으면 세지 않는다 — 지어내지 않는다', () => {
    const events = [
      ...fullMatchEvents(),
      fallDeathOfOpponent({ round: 3, time: '02:30', nexonSn: '없는사람', team: '0', eventKey: 902 }),
    ]
    const plan = planLineup({ ...base, events })
    if (!plan.ok) throw new Error('계획이 나와야 한다')
    const total = plan.players.reduce((sum, p) => sum + p.death, 0)
    expect(total).toBe(4)
  })

  it('C4 설치 줄은 죽음이 아니다', () => {
    const events: LineupEvent[] = [
      ...fullMatchEvents(),
      {
        round: '3',
        event_time: '02:40',
        event_key: 903,
        event_type: '',
        target_event_type: 'bomb',
        str_usn: '',
        team_no: '',
        target_str_usn: 'B1',
        target_team_no: '1',
      },
    ]
    const plan = planLineup({ ...base, events })
    if (!plan.ok) throw new Error('계획이 나와야 한다')
    expect(plan.players.find((p) => p.usn === 'B1')?.death).toBe(2)
  })

  it('같은 죽음이 두 줄로 와도 한 번만 센다 (event_key + 죽은 사람)', () => {
    const one = suicide({ round: 3, time: '02:00', usn: 'B2', team: '1', eventKey: 900 })
    const events: LineupEvent[] = [
      ...fullMatchEvents(),
      { ...one, event_type: 'f_death' },
      { ...one, event_type: 'f_death' },
    ]
    const plan = planLineup({ ...base, events })
    if (!plan.ok) throw new Error('계획이 나와야 한다')
    /* 킬로 1 + 낙사 1 = 2. 두 줄이어도 3 이 되면 안 된다 */
    expect(plan.players.find((p) => p.usn === 'B2')?.death).toBe(2)
  })

  it("옛 방식(deathSource:'kills')을 지우지 않았다 — 낙사를 안 센다", () => {
    const events: LineupEvent[] = [
      { ...(fullMatchEvents()[0] as LineupEvent), user_nexon_sn: '111' },
      ...fullMatchEvents().slice(1),
      fallDeathOfOpponent({ round: 3, time: '02:30', nexonSn: '111', team: '0', eventKey: 901 }),
    ]
    const plan = planLineup({ ...base, events, deathSource: 'kills' })
    if (!plan.ok) throw new Error('계획이 나와야 한다')
    expect(plan.players.find((p) => p.usn === 'A1')?.death).toBe(1)
  })
})
