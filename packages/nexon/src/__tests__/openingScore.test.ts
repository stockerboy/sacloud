import { describe, expect, it } from 'vitest'
import { MATCH_TO_FIRST_ROUND_SECONDS, ROUND_GAP_SECONDS } from '../clanHexV2'
import {
  OPENING_PENALTY_WINDOW_SECONDS,
  openingPointsOf,
  openingTalliesOf,
  roundStartsOf,
  BLUE_RIFLE_DEATH_POINT,
  BLUE_SNIPER_DEATH_POINT,
  RED_OPENING_DEATH_POINT,
  RED_OPENING_KILL_POINT,
  type OpeningEvent,
} from '../openingScore'
import type { RoundSide } from '../roundSide'

/**
 * ★선짤 점수★ (2026-09-20 사장님)
 *
 * > 「레드는 22초 이내에 5:5에서 선짤당해서 죽은 사람만 -1점」
 * > 「블루때 스나가 가장 먼저 죽는다? 무조건 마이너스요소 -2점」
 * > 「첫사망자의 기준은 5:5일때만이다」
 *
 * ⚠ ★상수를 외우지 않는다★ — 시험이 숫자를 적어 두면 값을 바꿀 때 시험이 먼저 깨지고,
 *   그걸 고치느라 ★진짜 규칙이 깨진 것을 놓친다.★ 이 세션에서 세 번 밟았다.
 */

const mm = (s: number): string => {
  const m = Math.floor(s / 60)
  const ss = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

/** 한 죽음을 두 줄이 아니라 한 줄로 적는다 — 주인이 죽인 쪽이다 */
function kill(o: {
  round: number
  at: number
  killer: string
  killerTeam: string
  victim: string
  victimTeam: string
  victimWeapon?: string
}): OpeningEvent {
  return {
    round: String(o.round),
    event_time: mm(o.at),
    event_type: 'kill',
    target_event_type: 'death',
    str_usn: o.killer,
    target_str_usn: o.victim,
    team_no: o.killerTeam,
    target_team_no: o.victimTeam,
    weapon: 'riple',
    target_weapon: o.victimWeapon ?? 'riple',
  }
}

/** 5:5 를 채운다 — 명부는 이벤트에서 읽으므로 열 명이 한 번씩 얽혀야 한다 */
function fillRoster(): OpeningEvent[] {
  const out: OpeningEvent[] = []
  /* 라운드 90 은 판정 대상이 아니다 (진영을 안 준다) — 명부만 채운다 */
  for (let i = 0; i < 5; i += 1) {
    out.push(kill({ round: 90, at: 3000 + i, killer: `a${i}`, killerTeam: 'A', victim: `b${i}`, victimTeam: 'B' }))
  }
  return out
}

/** 라운드 2 를 쓰려면 라운드 1 의 마지막 이벤트가 있어야 시작을 안다 */
const ROUND1_END = 100
const ROUND2_START = ROUND1_END + ROUND_GAP_SECONDS

const endRound1: OpeningEvent = kill({
  round: 1,
  at: ROUND1_END,
  killer: 'a0',
  killerTeam: 'A',
  victim: 'b0',
  victimTeam: 'B',
})

/** A 팀이 공격(레드), B 팀이 수비(블루) 인 라운드 2 */
const sideOf = (round: number, team: string): RoundSide | null => {
  if (round !== 2) return null
  return team === 'A' ? 'attack' : 'defense'
}

describe('라운드 시작 되짚기', () => {
  it('★1라운드는 경기 시작 + 10초★ — 사장님이 재신 값', () => {
    const starts = roundStartsOf([endRound1])
    expect(starts.get(1)).toBe(MATCH_TO_FIRST_ROUND_SECONDS)
  })

  it('★2라운드부터는 앞 라운드 마지막 + 8.45초★', () => {
    const starts = roundStartsOf([
      endRound1,
      kill({ round: 2, at: 200, killer: 'a0', killerTeam: 'A', victim: 'b0', victimTeam: 'B' }),
    ])
    expect(starts.get(2)).toBe(ROUND2_START)
  })

  it('★앞 라운드를 모르면 그 라운드 시작도 모른다★ — 지어내지 않는다', () => {
    const starts = roundStartsOf([
      kill({ round: 5, at: 400, killer: 'a0', killerTeam: 'A', victim: 'b0', victimTeam: 'B' }),
    ])
    expect(starts.has(5)).toBe(false)
  })
})

describe('레드 (밀고 들어가는 쪽)', () => {
  it('★22초 안에 선짤당하면 -1★', () => {
    const events = [
      ...fillRoster(),
      endRound1,
      /* B(블루)가 A(레드)를 잡았다 — 라운드 시작 후 10초 */
      kill({ round: 2, at: ROUND2_START + 10, killer: 'b1', killerTeam: 'B', victim: 'a1', victimTeam: 'A' }),
    ]
    const tallies = openingTalliesOf({ events, sideOf })
    expect(tallies.get('a1')?.redOpeningDeaths).toBe(1)
    expect(openingPointsOf(tallies.get('a1')!)).toBe(RED_OPENING_DEATH_POINT)
  })

  it('★22초를 넘으면 안 깎는다★', () => {
    const events = [
      ...fillRoster(),
      endRound1,
      kill({
        round: 2,
        at: ROUND2_START + OPENING_PENALTY_WINDOW_SECONDS + 1,
        killer: 'b1',
        killerTeam: 'B',
        victim: 'a1',
        victimTeam: 'A',
      }),
    ]
    const tallies = openingTalliesOf({ events, sideOf })
    expect(tallies.get('a1')?.redOpeningDeaths ?? 0).toBe(0)
  })

  it('★팀이 3초 안에 그 킬러를 되잡으면 면제★', () => {
    const events = [
      ...fillRoster(),
      endRound1,
      kill({ round: 2, at: ROUND2_START + 10, killer: 'b1', killerTeam: 'B', victim: 'a1', victimTeam: 'A' }),
      /* 2초 뒤 A 팀이 b1 을 되잡았다 */
      kill({ round: 2, at: ROUND2_START + 12, killer: 'a2', killerTeam: 'A', victim: 'b1', victimTeam: 'B' }),
    ]
    const tallies = openingTalliesOf({ events, sideOf })
    expect(tallies.get('a1')?.redOpeningDeaths).toBe(0)
    expect(tallies.get('a1')?.redOpeningDeathsRevenged).toBe(1)
    expect(openingPointsOf(tallies.get('a1')!)).toBe(0)
  })

  it('★다른 적을 잡은 건 복수가 아니다★ — 그 킬러를 잡아야 한다', () => {
    const events = [
      ...fillRoster(),
      endRound1,
      kill({ round: 2, at: ROUND2_START + 10, killer: 'b1', killerTeam: 'B', victim: 'a1', victimTeam: 'A' }),
      /* b2 를 잡았다 — b1 이 아니다 */
      kill({ round: 2, at: ROUND2_START + 11, killer: 'a2', killerTeam: 'A', victim: 'b2', victimTeam: 'B' }),
    ]
    const tallies = openingTalliesOf({ events, sideOf })
    expect(tallies.get('a1')?.redOpeningDeaths).toBe(1)
  })

  it('★22초 안에 선짤하고 3초 이상 살면 +1★', () => {
    const events = [
      ...fillRoster(),
      endRound1,
      /* A(레드)가 B(블루)를 잡았다 */
      kill({ round: 2, at: ROUND2_START + 10, killer: 'a1', killerTeam: 'A', victim: 'b1', victimTeam: 'B' }),
    ]
    const tallies = openingTalliesOf({ events, sideOf })
    expect(tallies.get('a1')?.redOpeningKills).toBe(1)
    expect(openingPointsOf(tallies.get('a1')!)).toBe(RED_OPENING_KILL_POINT)
  })

  it('★맞트레이드는 상을 안 준다★ — 3초 안에 같이 죽었다', () => {
    const events = [
      ...fillRoster(),
      endRound1,
      kill({ round: 2, at: ROUND2_START + 10, killer: 'a1', killerTeam: 'A', victim: 'b1', victimTeam: 'B' }),
      kill({ round: 2, at: ROUND2_START + 11, killer: 'b2', killerTeam: 'B', victim: 'a1', victimTeam: 'A' }),
    ]
    const tallies = openingTalliesOf({ events, sideOf })
    expect(tallies.get('a1')?.redOpeningKills).toBe(0)
  })
})

describe('블루 (지키는 쪽)', () => {
  it('★스나가 첫 사망자면 -2★', () => {
    const events = [
      ...fillRoster(),
      endRound1,
      kill({
        round: 2,
        at: ROUND2_START + 10,
        killer: 'a1',
        killerTeam: 'A',
        victim: 'b1',
        victimTeam: 'B',
        victimWeapon: 'sniper',
      }),
    ]
    const tallies = openingTalliesOf({ events, sideOf })
    expect(tallies.get('b1')?.blueSniperDeaths).toBe(1)
    expect(openingPointsOf(tallies.get('b1')!)).toBe(BLUE_SNIPER_DEATH_POINT)
  })

  it('★라플이 첫 사망자면 -1★', () => {
    const events = [
      ...fillRoster(),
      endRound1,
      kill({ round: 2, at: ROUND2_START + 10, killer: 'a1', killerTeam: 'A', victim: 'b1', victimTeam: 'B' }),
    ]
    const tallies = openingTalliesOf({ events, sideOf })
    expect(tallies.get('b1')?.blueRifleDeaths).toBe(1)
    expect(openingPointsOf(tallies.get('b1')!)).toBe(BLUE_RIFLE_DEATH_POINT)
  })

  it('★22초를 넘어도 깎는다★ — 블루 벌점에는 시간 조건이 없다', () => {
    const events = [
      ...fillRoster(),
      endRound1,
      kill({
        round: 2,
        at: ROUND2_START + OPENING_PENALTY_WINDOW_SECONDS + 30,
        killer: 'a1',
        killerTeam: 'A',
        victim: 'b1',
        victimTeam: 'B',
        victimWeapon: 'sniper',
      }),
    ]
    const tallies = openingTalliesOf({ events, sideOf })
    expect(tallies.get('b1')?.blueSniperDeaths).toBe(1)
  })

  it('★되잡아도 깎는다★ — 블루에는 면제가 없다', () => {
    const events = [
      ...fillRoster(),
      endRound1,
      kill({ round: 2, at: ROUND2_START + 10, killer: 'a1', killerTeam: 'A', victim: 'b1', victimTeam: 'B' }),
      kill({ round: 2, at: ROUND2_START + 11, killer: 'b2', killerTeam: 'B', victim: 'a1', victimTeam: 'A' }),
    ]
    const tallies = openingTalliesOf({ events, sideOf })
    expect(tallies.get('b1')?.blueRifleDeaths).toBe(1)
  })

  it('★상대 스나를 22초 안에 잡으면 +1★', () => {
    const events = [
      ...fillRoster(),
      endRound1,
      /* B(블루)가 A(레드)의 스나를 잡았다 */
      kill({
        round: 2,
        at: ROUND2_START + 10,
        killer: 'b1',
        killerTeam: 'B',
        victim: 'a1',
        victimTeam: 'A',
        victimWeapon: 'sniper',
      }),
    ]
    const tallies = openingTalliesOf({ events, sideOf })
    expect(tallies.get('b1')?.blueSniperKills).toBe(1)
  })

  it('★라플을 잡은 건 상이 없다★', () => {
    const events = [
      ...fillRoster(),
      endRound1,
      kill({ round: 2, at: ROUND2_START + 10, killer: 'b1', killerTeam: 'B', victim: 'a1', victimTeam: 'A' }),
    ]
    const tallies = openingTalliesOf({ events, sideOf })
    expect(tallies.get('b1')?.blueSniperKills ?? 0).toBe(0)
  })
})

describe('모르면 세지 않는다 (D-106)', () => {
  it('★5:5 가 아니면 한 줄도 안 센다★', () => {
    /* A 가 넷뿐이다 */
    const roster: OpeningEvent[] = []
    for (let i = 0; i < 4; i += 1) {
      roster.push(kill({ round: 90, at: 3000 + i, killer: `a${i}`, killerTeam: 'A', victim: `b${i}`, victimTeam: 'B' }))
    }
    roster.push(kill({ round: 90, at: 3010, killer: 'a0', killerTeam: 'A', victim: 'b4', victimTeam: 'B' }))
    const events = [
      ...roster,
      endRound1,
      kill({ round: 2, at: ROUND2_START + 10, killer: 'b1', killerTeam: 'B', victim: 'a1', victimTeam: 'A' }),
    ]
    expect(openingTalliesOf({ events, sideOf }).size).toBe(0)
  })

  it('★진영을 모르는 라운드는 건너뛴다★', () => {
    const events = [
      ...fillRoster(),
      endRound1,
      kill({ round: 2, at: ROUND2_START + 10, killer: 'b1', killerTeam: 'B', victim: 'a1', victimTeam: 'A' }),
    ]
    const tallies = openingTalliesOf({ events, sideOf: () => null })
    expect(tallies.size).toBe(0)
  })

  it('★같은 초에 둘이 죽으면 그 라운드를 버린다★ — 누가 먼저인지 모른다', () => {
    const events = [
      ...fillRoster(),
      endRound1,
      kill({ round: 2, at: ROUND2_START + 10, killer: 'b1', killerTeam: 'B', victim: 'a1', victimTeam: 'A' }),
      kill({ round: 2, at: ROUND2_START + 10, killer: 'a2', killerTeam: 'A', victim: 'b2', victimTeam: 'B' }),
    ]
    const tallies = openingTalliesOf({ events, sideOf })
    expect(tallies.get('a1')?.redOpeningDeaths ?? 0).toBe(0)
  })
})
