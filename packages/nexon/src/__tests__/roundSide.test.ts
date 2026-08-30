/**
 * 라운드별 진영 판정 (D-184).
 *
 * 고정하려는 것
 *   1. `team_no` 를 진영으로 읽지 않는다 — 그건 클랜 번호다
 *   2. 폭탄이 진영을 말한다 — 설치=공격 · 해체=수비
 *   3. **모르는 라운드를 채우지 않는다.** 교대 구간 안쪽은 비워 둔다
 *   4. 근거가 어긋나면 아무것도 확정하지 않는다
 */
import { describe, expect, it } from 'vitest'
import {
  bombEvidenceOf,
  clanByTeamNo,
  halfEndBoundsOf,
  roundResultsOf,
  roundSidesOf,
  type RoundSideEvent,
} from '../roundSide'

/**
 * `W`/`L`/`?` 한 글자씩 = 1라운드부터의 승패. `?` 는 **모른다** 다.
 * 문자열보다 뒤의 라운드도 모르는 것으로 답한다.
 */
const results =
  (text: string) =>
  (round: number): boolean | null => {
    const mark = text[round - 1]
    if (mark === 'W') return true
    if (mark === 'L') return false
    return null
  }

/** 실측 응답과 같은 모양 — 폭탄 줄은 행위자가 `target_*` 에 실려 온다 */
function bomb(round: number, team: string, action: 'install' | 'dismantle'): RoundSideEvent {
  return {
    round: String(round),
    event_type: '',
    weapon: '',
    team_no: '',
    target_weapon: action === 'install' ? 'c4-install' : 'c4-dismantle',
    target_team_no: team,
    target_event_type: 'bomb',
  }
}

/** 평범한 킬 줄 — 폭탄이 아니므로 근거가 되면 안 된다 */
const KILL: RoundSideEvent = {
  round: '1',
  event_type: 'kill',
  weapon: 'riple',
  team_no: '0',
  target_team_no: '1',
  target_weapon: '',
}

describe('폭탄 근거 뽑기', () => {
  it('설치와 해체만 근거로 삼는다 — 킬은 아니다', () => {
    const rows = bombEvidenceOf([KILL, bomb(4, '1', 'dismantle'), bomb(10, '1', 'install')])
    expect(rows).toEqual([
      { round: 4, team: '1', action: 'dismantle' },
      { round: 10, team: '1', action: 'install' },
    ])
  })

  it('무기 칸과 팀 칸을 짝지어 읽는다 — 엇갈려 읽으면 진영이 뒤집힌다', () => {
    /* 행위자가 `weapon`/`team_no` 쪽에 실린 형태도 받는다 */
    const rows = bombEvidenceOf([
      { round: '7', weapon: 'c4-install', team_no: '0', target_weapon: '', target_team_no: '1' },
    ])
    expect(rows).toEqual([{ round: 7, team: '0', action: 'install' }])
  })

  it('라운드를 모르는 줄은 버린다', () => {
    expect(bombEvidenceOf([{ round: null, target_weapon: 'c4-install', target_team_no: '1' }])).toEqual([])
  })
})

describe('라운드별 진영', () => {
  /* 실측 경기 260820162642124001 과 같은 모양 —
     team 1 이 4라운드 해체(수비) · 10·11라운드 설치(공격) */
  const events = [KILL, bomb(4, '1', 'dismantle'), bomb(10, '1', 'install'), bomb(11, '1', 'install')]

  it('교대 지점을 구간으로 좁힌다', () => {
    const result = roundSidesOf(events, '1', 14)
    expect(result.conflict).toBe(false)
    expect(result.switchRound).toBe(10)
    expect(result.bracket).toEqual([4, 10])
  })

  it('전반은 수비 · 후반은 공격으로 채운다', () => {
    const { side } = roundSidesOf(events, '1', 14)
    expect(side.get(1)).toBe('defense')
    expect(side.get(4)).toBe('defense')
    expect(side.get(10)).toBe('attack')
    expect(side.get(14)).toBe('attack')
  })

  it('교대 구간 안쪽은 **비워 둔다** — 어디서 바뀌었는지 모른다', () => {
    const { side } = roundSidesOf(events, '1', 14)
    for (const round of [5, 6, 7, 8, 9]) expect(side.has(round)).toBe(false)
  })

  it('상대 팀 근거를 **뒤집어서** 쓴다 — 공격은 한 라운드에 한 팀뿐이다 (D-208)', () => {
    /* 같은 근거를 팀 `0` 쪽에서 보면 정확히 반대다 */
    const result = roundSidesOf(events, '0', 14)
    expect(result.conflict).toBe(false)
    expect(result.switchRound).toBe(10)
    expect(result.side.get(4)).toBe('attack')
    expect(result.side.get(10)).toBe('defense')
  })

  it('폭탄이 하나도 없으면 아무것도 정하지 않는다', () => {
    const result = roundSidesOf([KILL], '1', 14)
    expect(result.side.size).toBe(0)
    expect(result.switchRound).toBeNull()
    expect(result.conflict).toBe(false)
  })

  it('아직 교대를 못 봤으면 아는 라운드만 돌려준다', () => {
    const result = roundSidesOf([bomb(2, '1', 'install'), bomb(5, '1', 'install')], '1', 14)
    expect(result.switchRound).toBeNull()
    expect(result.side.get(2)).toBe('attack')
    expect(result.side.get(5)).toBe('attack')
    /* 사이와 바깥을 지어내지 않는다 */
    expect(result.side.has(3)).toBe(false)
    expect(result.side.has(9)).toBe(false)
  })

  it('같은 라운드에 설치와 해체가 둘 다면 모순이다 — 다수결하지 않는다', () => {
    const result = roundSidesOf([bomb(6, '1', 'install'), bomb(6, '1', 'dismantle')], '1', 14)
    expect(result.conflict).toBe(true)
    expect(result.side.size).toBe(0)
  })

  it('바뀐 뒤에 원래 진영이 또 나오면 모순이다 — 교대는 한 번뿐이다', () => {
    /* 수비 → 공격 → 다시 수비. 전·후반 교대는 한 번뿐이므로 이런 근거는 믿을 수 없다 */
    const result = roundSidesOf(
      [bomb(2, '1', 'dismantle'), bomb(8, '1', 'install'), bomb(12, '1', 'dismantle')],
      '1',
      14,
    )
    expect(result.conflict).toBe(true)
    expect(result.switchRound).toBeNull()
  })
})

describe('라운드 승패 (win_flag)', () => {
  it('폭탄 줄을 빼고 본다 — 그 줄만 기준이 다르다', () => {
    /* 실측: 조회 클랜이 진 라운드인데 폭탄 줄의 win_flag 는 `win` 으로 온다 */
    const result = roundResultsOf([
      { round: '4', win_flag: 'lose', weapon: 'riple' },
      { round: '4', win_flag: 'lose', weapon: 'sniper' },
      { round: '4', win_flag: 'win', target_weapon: 'c4-dismantle', win_team_no: '1' },
    ])
    expect(result.get(4)).toBe(false)
  })

  it('이긴 라운드는 true 다', () => {
    const result = roundResultsOf([
      { round: '1', win_flag: 'win', weapon: 'riple' },
      { round: '1', win_flag: 'win', weapon: 'riple' },
    ])
    expect(result.get(1)).toBe(true)
  })

  it('폭탄을 빼고도 값이 갈리면 판정하지 않는다 — 다수결하지 않는다', () => {
    const result = roundResultsOf([
      { round: '2', win_flag: 'win', weapon: 'riple' },
      { round: '2', win_flag: 'lose', weapon: 'riple' },
    ])
    expect(result.get(2)).toBeNull()
  })

  it('win_flag 가 없는 줄은 세지 않는다', () => {
    const result = roundResultsOf([{ round: '3', win_flag: null }, { round: '3', win_flag: '' }])
    expect(result.has(3)).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* 전반 종료 — 5승 규칙 (D-208)                                                  */
/* -------------------------------------------------------------------------- */

describe('halfEndBoundsOf — 전반은 한 팀이 5승을 채우면 끝난다', () => {
  it('승패를 다 알면 딱 떨어진다 — 5승 도달 라운드가 전반 마지막이다', () => {
    /* 우리가 1·2·3·5·7 라운드 승 → 7라운드에 5승. 교대는 8라운드다 */
    expect(halfEndBoundsOf(results('WWWLWLWLWLWLWL'), 14)).toEqual({ lo: 7, hi: 7 })
  })

  it('가장 흔한 전반 스코어 5:4 는 9라운드에서 끝난다 — 교대는 10라운드', () => {
    /* 교대가 10라운드에 몰려 보이는 이유다. `9라운드 뒤 교대` 라는 규칙이 아니다 */
    expect(halfEndBoundsOf(results('LWWWLLWLLWWWWL'), 14)).toEqual({ lo: 9, hi: 9 })
  })

  it('4승 규칙도 6승 규칙도 아니다', () => {
    const won = results('WWWLWLWLWLWLWL')
    /* 4승은 5라운드 · 6승은 9라운드에 채운다. 우리가 쓰는 값은 그 사이 7이다 */
    expect(halfEndBoundsOf(won, 14).lo).not.toBe(5)
    expect(halfEndBoundsOf(won, 14).lo).not.toBe(9)
    expect(halfEndBoundsOf(won, 14).lo).toBe(7)
  })

  it('승패를 하나도 모르면 `[5, 9]` 다 — 그 밖은 어떤 경기에서도 불가능하다', () => {
    /* 5승을 채우려면 최소 5라운드, 4:4 다음에는 반드시 누군가 5가 되므로 최대 9라운드다 */
    expect(halfEndBoundsOf(results(''), 14)).toEqual({ lo: 5, hi: 9 })
  })

  it('구멍이 있으면 **구간**으로 다룬다 — 모르는 라운드를 양극단에 놓는다', () => {
    /* 1~4 는 우리 승, 5 는 모르고, 6 이 우리 승이라 늦어도 6라운드에는 5승이다.
       5라운드가 우리 승이었다면 그때 이미 끝났다 */
    expect(halfEndBoundsOf(results('WWWW?WLLLLLLLL'), 14)).toEqual({ lo: 5, hi: 6 })
  })

  it('아무도 5승에 못 닿는 짧은 경기는 구간을 좁히지 않는다', () => {
    /* 몰수·기권 등. 여기서 `e = T` 라고 단정하면 실제 교대가 모순으로 몰린다 */
    expect(halfEndBoundsOf(results('WWLL'), 4)).toEqual({ lo: 1, hi: 4 })
  })
})

describe('폭탄 × 5승 규칙 — 방향은 폭탄이, 지점은 승수가 (D-208)', () => {
  /* 우리(팀 `1`)가 4라운드 해체(수비) · 10라운드 설치(공격). 폭탄만으로는 e ∈ [4, 9] */
  const events = [KILL, bomb(4, '1', 'dismantle'), bomb(10, '1', 'install')]

  it('승패를 다 알면 브래킷 가운데를 **전부** 채운다', () => {
    /* 7라운드에 5승 → e = 7 · 교대 8라운드. [4,9] ∩ [7,7] = [7,7] */
    const result = roundSidesOf(events, '1', 14, results('WWWLWLWLWLWLWL'))
    expect(result.conflict).toBe(false)
    expect(result.switchRound).toBe(8)
    expect(result.bracket).toEqual([7, 8])
    for (const round of [1, 4, 5, 6, 7]) expect(result.side.get(round)).toBe('defense')
    for (const round of [8, 9, 10, 14]) expect(result.side.get(round)).toBe('attack')
    expect(result.side.size).toBe(14)
  })

  it('승패를 안 주면 예전 그대로 — 가운데는 비워 둔다', () => {
    const result = roundSidesOf(events, '1', 14)
    expect(result.switchRound).toBe(10)
    for (const round of [5, 6, 7, 8, 9]) expect(result.side.has(round)).toBe(false)
  })

  it('구멍이 있으면 **좁혀진 만큼만** 채운다', () => {
    /* e ∈ [5, 6] 과 폭탄 [4, 9] 의 교집합은 [5, 6] — 6라운드 하나만 비워 둔다 */
    const result = roundSidesOf(events, '1', 14, results('WWWW?WLLLLLLLL'))
    expect(result.bracket).toEqual([5, 7])
    expect(result.side.get(5)).toBe('defense')
    expect(result.side.has(6)).toBe(false)
    expect(result.side.get(7)).toBe('attack')
  })

  it('한쪽 진영 근거뿐이어도 5승 규칙이 **방향**을 골라 준다', () => {
    /* 설치(공격)만 11·12 라운드에 있다. 폭탄만으로는 그게 전반인지 후반인지 모른다.
       9라운드에 전반이 끝났으므로 11·12 는 후반 — 우리는 전반 내내 수비였다 */
    const oneSided = [bomb(11, '1', 'install'), bomb(12, '1', 'install')]
    const result = roundSidesOf(oneSided, '1', 14, results('LWWWLLWLLWWWWL'))
    expect(result.conflict).toBe(false)
    expect(result.switchRound).toBe(10)
    expect(result.side.get(1)).toBe('defense')
    expect(result.side.get(9)).toBe('defense')
    expect(result.side.get(10)).toBe('attack')
    expect(result.side.size).toBe(14)
  })

  it('방향을 못 고르면 아는 라운드만 돌려준다 — 지어내지 않는다', () => {
    const oneSided = [bomb(11, '1', 'install'), bomb(12, '1', 'install')]
    const result = roundSidesOf(oneSided, '1', 14)
    expect(result.switchRound).toBeNull()
    expect(result.side.size).toBe(2)
  })

  it('폭탄과 승수가 서로를 부정하면 **아무것도** 확정하지 않는다', () => {
    /* 폭탄은 e ∈ [6, 7] 이라 하고, 승수는 5라운드에 5승이라 e = 5 라 한다 */
    const clash = [bomb(6, '1', 'dismantle'), bomb(8, '1', 'install')]
    const result = roundSidesOf(clash, '1', 14, results('WWWWWLLLLLLLLL'))
    expect(result.conflict).toBe(true)
    expect(result.side.size).toBe(0)
    expect(result.switchRound).toBeNull()
  })

  it('폭탄이 하나도 없으면 승패를 다 알아도 **비워 둔다** — team_no 는 후퇴값이 아니다', () => {
    const result = roundSidesOf([KILL], '1', 14, results('WWWLWLWLWLWLWL'))
    expect(result.side.size).toBe(0)
    expect(result.switchRound).toBeNull()
    expect(result.conflict).toBe(false)
  })

  it('상대 근거를 뒤집어 써도 교대는 한 번뿐이라는 검사가 살아 있다', () => {
    /* 우리 수비(2) → 상대 해체 = 우리 공격(8) → 다시 우리 수비(12) */
    const result = roundSidesOf(
      [bomb(2, '1', 'dismantle'), bomb(8, '0', 'dismantle'), bomb(12, '1', 'dismantle')],
      '1',
      14,
    )
    expect(result.conflict).toBe(true)
  })

  it('같은 라운드에서 양 팀이 다 설치했다면 모순이다 — 공격은 한 팀뿐이다', () => {
    const result = roundSidesOf([bomb(6, '1', 'install'), bomb(6, '0', 'install')], '1', 14)
    expect(result.conflict).toBe(true)
  })
})

describe('team_no 는 진영이 아니라 클랜이다', () => {
  it('teamList 가 팀번호와 클랜번호를 짝지어 준다', () => {
    const map = clanByTeamNo([
      { team_no: '0', clan_no: '070716026783' },
      { team_no: '1', clan_no: '060503000068' },
    ])
    expect(map.get('0')).toBe('070716026783')
    expect(map.get('1')).toBe('060503000068')
  })

  it('빈 값은 담지 않는다 — 짝이 없으면 없는 것이다', () => {
    expect(clanByTeamNo([{ team_no: '0', clan_no: null }, { team_no: null, clan_no: 'x' }]).size).toBe(0)
  })
})
