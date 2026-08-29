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
  roundResultsOf,
  roundSidesOf,
  type RoundSideEvent,
} from '../roundSide'

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

  it('다른 팀 번호를 물으면 그 팀 근거만 본다', () => {
    expect(roundSidesOf(events, '0', 14).switchRound).toBeNull()
    expect(roundSidesOf(events, '0', 14).side.size).toBe(0)
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
