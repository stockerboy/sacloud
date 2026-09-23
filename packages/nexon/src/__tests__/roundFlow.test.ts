import { describe, expect, it } from 'vitest'
import { roundFlowOf, type RoundFlowEvent } from '../roundFlow'

/* 죽음 한 줄 — 주체가 죽었다 (`event_type: death`). 상대가 죽인 사람 */
function death(round: number, at: string, victim: string, victimTeam: string, killer: string, killerTeam: string, winFlag: 'win' | 'lose'): RoundFlowEvent {
  return {
    round,
    event_time: at,
    event_type: 'death',
    target_event_type: 'kill',
    str_usn: victim,
    team_no: victimTeam,
    target_str_usn: killer,
    target_team_no: killerTeam,
    win_flag: winFlag,
    /* 주체가 죽은 줄 — 죽인 사람 무기는 `target_weapon` 에 온다 (DECISIONS 실측). `weapon` 은 죽은 사람 쪽 칸이라 안 읽는다 */
    weapon: 'ak47',
    target_weapon: 'riple',
    user_nick: victim + '님',
    target_user_nick: killer + '님',
  }
}
function bomb(round: number, at: string, team: string, action: 'c4-install' | 'c4-dismantle', winFlag: 'win' | 'lose'): RoundFlowEvent {
  return { round, event_time: at, event_type: 'kill', target_event_type: 'death', /* 폭탄 줄의 주체는 명단에 있는 사람이어야 한다 — 새 이름을 쓰면 여섯 명이 된다 */
    str_usn: team === '0' ? 'a1' : 'b1', team_no: team, weapon: action, win_flag: winFlag, kill_x: 165, kill_y: 438 }
}

/* 5 대 5 명단이 잡히게 — 두 팀 다섯 명씩 등장시킨다 */
function roster(): RoundFlowEvent[] {
  const out: RoundFlowEvent[] = []
  for (let i = 1; i <= 5; i += 1) out.push(death(1, '00:20', `a${i}`, '0', `b${i}`, '1', 'lose'))
  return out
}

describe('roundFlowOf', () => {
  it('라운드 시각 · 죽음 차례 · 승패 · 수비 · 전후반을 편다', () => {
    const events: RoundFlowEvent[] = [
      ...roster(),
      /* 1라운드 — 우리가 1 설치(공격) · 졌다 */
      bomb(1, '00:40', '0', 'c4-install', 'lose'),
      /* 2라운드 — 우리가 이겼다. b1 이 00:55 에 죽고 b2 가 01:02 에 죽는다 */
      death(2, '00:55', 'b1', '1', 'a1', '0', 'win'),
      death(2, '01:02', 'b2', '1', 'a1', '0', 'win'),
    ]
    const flow = roundFlowOf({ events, teamNo: '0' })
    expect(flow).not.toBeNull()
    const f = flow as NonNullable<typeof flow>
    expect(f.teamSize).toEqual({ mine: 5, foe: 5 })
    expect(f.rounds.map((r) => r.round)).toEqual([1, 2])
    const r1 = f.rounds[0] as (typeof f.rounds)[number]
    expect(r1.start).toBe(10)
    expect(r1.end).toBe(40)
    expect(r1.winner).toBe('foe')
    expect(r1.defence).toBe('foe') /* 우리가 설치 → 우리 공격 → 상대 수비 */
    expect(r1.planted).toBe('mine')
    expect(r1.deaths).toHaveLength(5)
    const r2 = f.rounds[1] as (typeof f.rounds)[number]
    expect(r2.start).toBeCloseTo(40 + 8.45, 2)
    expect(r2.winner).toBe('mine')
    expect(r2.planted).toBeNull()
    expect(r2.deaths.map((d) => d.team)).toEqual(['foe', 'foe'])
    expect(r2.deaths.map((d) => d.at)).toEqual([55, 62])
    expect(r2.deaths.map((d) => d.name)).toEqual(['b1님', 'b2님'])
    expect(r2.deaths.map((d) => d.by)).toEqual(['a1님', 'a1님'])
    /* §7-8 죽인 무기 — 죽인 쪽 칸(target_weapon)을 그대로. 죽은 쪽 칸(weapon: ak47)은 안 읽는다 */
    expect(r2.deaths.map((d) => d.weapon)).toEqual(['riple', 'riple'])
    /* §7-6 폭탄 줄 — 1라운드 우리(a1) 설치 한 줄 · 2라운드 없음 */
    expect(r1.bombs).toEqual([{ at: 40, team: 'mine', action: 'install', by: 'a1님' }]) /* a1 의 닉은 명단 줄에서 이미 안다 */
    expect(r2.bombs).toEqual([])
  })

  it('죽인 무기 — 주체가 죽인 줄(kill)이면 `weapon` 을, 빈 값이면 null', () => {
    const events: RoundFlowEvent[] = [
      ...roster(),
      /* 주체 a1 이 b1 을 sniper 로 잡음 (kill 줄) */
      { round: 2, event_time: '00:50', event_type: 'kill', target_event_type: 'death', str_usn: 'a1', team_no: '0', target_str_usn: 'b1', target_team_no: '1', win_flag: 'win', weapon: 'sniper', target_weapon: '', user_nick: 'a1님', target_user_nick: 'b1님' },
      /* 무기 칸이 비어 있는 죽음 줄 */
      { round: 2, event_time: '00:58', event_type: 'death', target_event_type: 'kill', str_usn: 'b2', team_no: '1', target_str_usn: 'a1', target_team_no: '0', win_flag: 'win', weapon: '', target_weapon: '', user_nick: 'b2님', target_user_nick: 'a1님' },
    ]
    const flow = roundFlowOf({ events, teamNo: '0' })
    const r2 = flow?.rounds[1]
    expect(r2?.deaths.map((d) => [d.name, d.weapon])).toEqual([['b1님', 'sniper'], ['b2님', null]])
  })

  it('폭탄 줄 — 설치·해체를 시각순으로 · 닉네임이 있으면 붙인다', () => {
    const events: RoundFlowEvent[] = [
      ...roster(),
      { ...bomb(1, '00:40', '0', 'c4-install', 'lose'), user_nick: 'a1님' },
      { ...bomb(1, '00:48', '1', 'c4-dismantle', 'lose'), user_nick: 'b1님' },
    ]
    const flow = roundFlowOf({ events, teamNo: '0' })
    expect(flow?.rounds[0]?.bombs).toEqual([
      { at: 40, team: 'mine', action: 'install', by: 'a1님' },
      { at: 48, team: 'foe', action: 'dismantle', by: 'b1님' },
    ])
    expect(flow?.rounds[0]?.planted).toBe('foe')
  })

  it('설점 — 설치 뒤 해체가 있으면 해체한 팀이 가져간다 (사장님 규칙)', () => {
    const events: RoundFlowEvent[] = [
      ...roster(),
      bomb(1, '00:40', '0', 'c4-install', 'lose'),
      bomb(1, '00:48', '1', 'c4-dismantle', 'lose'),
    ]
    const flow = roundFlowOf({ events, teamNo: '0' })
    expect(flow?.rounds[0]?.planted).toBe('foe')
  })

  it('두 팀이 안 갈리면 null', () => {
    expect(roundFlowOf({ events: [death(1, '00:10', 'x', '0', 'y', '0', 'win')], teamNo: '0' })).toBeNull()
  })

  it('전후반은 5승 규칙으로도 잡는다 (폭탄이 없어도)', () => {
    const events: RoundFlowEvent[] = [...roster()]
    /* 1~5라운드 우리 승 → 6라운드부터 후반 */
    for (let r = 1; r <= 6; r += 1) events.push(death(r, `0${r}:00`, 'b1', '1', 'a1', '0', r <= 5 ? 'win' : 'lose'))
    /* 1라운드 명단 줄은 lose 라 1라운드 승패가 모순 → null 이 되면 안 되므로 1라운드 명단도 win 으로 */
    const fixed = events.map((e) => (e.round === 1 ? { ...e, win_flag: 'win' } : e))
    const flow = roundFlowOf({ events: fixed, teamNo: '0' })
    expect(flow?.secondHalfFrom).toBe(6)
    expect(flow?.rounds.every((r) => r.defence === null)).toBe(true)
  })
})
