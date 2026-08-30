/**
 * 플레이스타일 바의 재료 (사양 8절 · D-211).
 *
 * 고정하려는 것
 *   1. **진영으로 갈라서** 센다 — 수비 라운드의 움직임이 공격 줄에 들어가지 않는다
 *   2. 상대 팀은 **반대 진영**이다 (폭파미션은 한 라운드에 공격이 한 팀뿐이다)
 *   3. 진영을 모르는 라운드는 **양쪽 어디에도** 넣지 않는다 (D-106)
 *   4. 같은 킬이 두 줄로 와도 **한 번**만 센다
 *   5. 좌표는 행위 기준이다 — `kill_*` 은 죽인 사람, `death_*` 는 죽은 사람 자리
 */
import { describe, expect, it } from 'vitest'
import {
  addSideTally,
  emptySideTally,
  entryDelay,
  openingRate,
  playstyleKillsOf,
  playstyleTallyOf,
  positionSpread,
  type PlaystyleEvent,
} from '../playstyle'

/** 킬 한 줄 — 주체가 죽인 모양 */
function kill(input: {
  round: number
  at: string
  killer: string
  victim: string
  killerTeam: string
  victimTeam: string
  kx?: number
  ky?: number
  dx?: number
  dy?: number
}): PlaystyleEvent {
  return {
    round: String(input.round),
    event_time: input.at,
    event_type: 'kill',
    target_event_type: 'death',
    str_usn: input.killer,
    target_str_usn: input.victim,
    team_no: input.killerTeam,
    target_team_no: input.victimTeam,
    kill_x: input.kx ?? null,
    kill_y: input.ky ?? null,
    death_x: input.dx ?? null,
    death_y: input.dy ?? null,
  }
}

const teamOf = new Map<string, string>([
  ['a1', '0'],
  ['b1', '1'],
])

describe('playstyleKillsOf — 킬 목록', () => {
  it('같은 죽음이 두 줄로 와도 한 번만 센다', () => {
    const events = [
      kill({ round: 1, at: '00:30', killer: 'a1', victim: 'b1', killerTeam: '0', victimTeam: '1' }),
      /* 같은 킬을 상대 쪽 응답이 뒤집어 적은 줄 */
      {
        round: '1',
        event_time: '00:30',
        event_type: 'death',
        target_event_type: 'kill',
        str_usn: 'b1',
        target_str_usn: 'a1',
        team_no: '1',
        target_team_no: '0',
      } satisfies PlaystyleEvent,
    ]
    const kills = playstyleKillsOf(events)
    expect(kills).toHaveLength(1)
    expect(kills[0]?.killer).toBe('a1')
    expect(kills[0]?.victim).toBe('b1')
  })

  it('좌표는 행위 기준이다 — kill_* 은 죽인 사람, death_* 은 죽은 사람', () => {
    const kills = playstyleKillsOf([
      kill({
        round: 1,
        at: '00:10',
        killer: 'a1',
        victim: 'b1',
        killerTeam: '0',
        victimTeam: '1',
        kx: 100,
        ky: 200,
        dx: 300,
        dy: 400,
      }),
    ])
    expect(kills[0]?.killerX).toBe(100)
    expect(kills[0]?.killerY).toBe(200)
    expect(kills[0]?.victimX).toBe(300)
    expect(kills[0]?.victimY).toBe(400)
  })

  it('라운드가 빈 문자열이면 0라운드로 만들지 않고 버린다', () => {
    const events = [
      { ...kill({ round: 1, at: '00:10', killer: 'a1', victim: 'b1', killerTeam: '0', victimTeam: '1' }), round: '' },
    ]
    expect(playstyleKillsOf(events)).toHaveLength(0)
  })
})

describe('playstyleTallyOf — 진영별 집계', () => {
  const events: PlaystyleEvent[] = [
    /* 1라운드 — 우리(팀 0)가 수비. a1 이 첫 교전의 당사자(죽인 쪽) */
    kill({ round: 1, at: '00:20', killer: 'a1', victim: 'b1', killerTeam: '0', victimTeam: '1', kx: 10, ky: 10 }),
    /* 2라운드 — 우리가 공격. b1 이 첫 교전 당사자(죽은 쪽), a1 은 관여하지 않았다 */
    kill({ round: 2, at: '01:40', killer: 'a1', victim: 'b1', killerTeam: '0', victimTeam: '1', kx: 90, ky: 90, dx: 50, dy: 50 }),
  ]

  it('라운드마다 그 진영에만 쌓는다 — 상대 팀은 반대 진영이다', () => {
    const tally = playstyleTallyOf({
      events,
      teamNo: '0',
      teamOf,
      sideOf: new Map([
        [1, 'defense'],
        [2, 'attack'],
      ]),
    })

    /* 우리(팀 0)의 a1 — 1라운드 수비 · 2라운드 공격 */
    expect(tally.get('a1')?.defense.rounds).toBe(1)
    expect(tally.get('a1')?.attack.rounds).toBe(1)
    /* 상대(팀 1)의 b1 — 뒤집힌다 */
    expect(tally.get('b1')?.defense.rounds).toBe(1)
    expect(tally.get('b1')?.attack.rounds).toBe(1)
  })

  it('라운드 첫 교전의 당사자면 죽였든 죽었든 오프닝으로 센다', () => {
    const tally = playstyleTallyOf({
      events,
      teamNo: '0',
      teamOf,
      sideOf: new Map([
        [1, 'defense'],
        [2, 'attack'],
      ]),
    })
    /* 1라운드의 유일한 킬이라 죽인 a1 도 죽은 b1 도 당사자다 */
    expect(tally.get('a1')?.defense.opening).toBe(1)
    expect(tally.get('b1')?.attack.opening).toBe(1)
  })

  it('진영을 모르는 라운드는 양쪽 어디에도 넣지 않는다', () => {
    const tally = playstyleTallyOf({
      events,
      teamNo: '0',
      teamOf,
      /* 2라운드는 비어 있다 */
      sideOf: new Map([[1, 'defense']]),
    })
    expect(tally.get('a1')?.defense.rounds).toBe(1)
    expect(tally.get('a1')?.attack.rounds).toBe(0)
  })

  it('첫 교전 지연은 라운드 첫 이벤트 시각을 0으로 잰다', () => {
    /* 1라운드 첫 이벤트가 00:20 이므로 a1 의 지연은 0초다 */
    const tally = playstyleTallyOf({
      events,
      teamNo: '0',
      teamOf,
      sideOf: new Map([[1, 'defense']]),
    })
    expect(entryDelay(tally.get('a1')?.defense ?? emptySideTally())).toBe(0)
  })

  it('진영을 하나도 모르면 빈 결과다 — 0으로 채우지 않는다', () => {
    const tally = playstyleTallyOf({ events, teamNo: '0', teamOf, sideOf: new Map() })
    expect(tally.size).toBe(0)
  })
})

describe('재료 → 값', () => {
  it('오프닝 관여율은 분모가 0이면 null 이다', () => {
    expect(openingRate(emptySideTally())).toBeNull()
  })

  it('자리 흩어짐은 좌표가 모자라면 null 이다 — 0 이 아니다', () => {
    const tally = emptySideTally()
    tally.posN = 2
    expect(positionSpread(tally)).toBeNull()
  })

  it('한 자리만 지키면 흩어짐이 0 이다', () => {
    const tally = emptySideTally()
    for (let i = 0; i < 10; i += 1) {
      tally.posX += 100
      tally.posY += 200
      tally.posX2 += 100 * 100
      tally.posY2 += 200 * 200
      tally.posN += 1
    }
    expect(positionSpread(tally)).toBeCloseTo(0, 6)
  })

  it('두 자리를 오가면 흩어짐이 그 거리의 절반이다', () => {
    const tally = emptySideTally()
    /* x 가 0 과 100 을 반씩 — 표준편차는 50 */
    for (let i = 0; i < 10; i += 1) {
      const x = i % 2 === 0 ? 0 : 100
      tally.posX += x
      tally.posX2 += x * x
      tally.posN += 1
    }
    expect(positionSpread(tally)).toBeCloseTo(50, 6)
  })

  it('집계를 더하면 분자와 분모가 같이 더해진다', () => {
    const into = emptySideTally()
    const from = emptySideTally()
    from.rounds = 3
    from.opening = 2
    from.delaySum = 30
    from.delayN = 3
    addSideTally(into, from)
    addSideTally(into, from)
    expect(into.rounds).toBe(6)
    expect(into.opening).toBe(4)
    expect(entryDelay(into)).toBe(10)
  })
})
