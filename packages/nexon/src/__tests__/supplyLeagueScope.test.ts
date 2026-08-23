/**
 * 서플라이 리그 기록 대상 판정 회귀 테스트 (D-122).
 *
 * 고정하는 약속
 *  1. 제3보급창고 **5vs5만** 인정한다
 *  2. 6vs6은 비공식이 아니라 **대상 외**다
 *  3. 맵 판정은 정확 일치다 — 느슨한 매칭으로 엉뚱한 모드가 통과하면 안 된다
 */
import { describe, expect, it } from 'vitest'
import {
  evaluateLeagueScope,
  isProjectable,
  isSupplyLeagueMap,
  SUPPLY_LEAGUE_MAP,
  SUPPLY_TEAM_SIZE,
} from '../supplyLeagueScope'

const scope = (over: Partial<Parameters<typeof evaluateLeagueScope>[0]> = {}) =>
  evaluateLeagueScope({ mapName: SUPPLY_LEAGUE_MAP, teamASize: 5, teamBSize: 5, ...over })

describe('맵 판정 — 정확 일치만', () => {
  it('제3보급창고를 인정한다', () => {
    expect(isSupplyLeagueMap('제3보급창고')).toBe(true)
    expect(isSupplyLeagueMap('  제3보급창고  ')).toBe(true)
  })

  it('실제로 수집된 다른 클랜전 맵은 전부 대상이 아니다', () => {
    for (const name of ['올드타운', '데저트2', '드래곤로드', '크로스포트', '시티캣', '프로방스']) {
      expect(isSupplyLeagueMap(name), name).toBe(false)
    }
  })

  it('"보급"이 들어갔다고 통과시키지 않는다', () => {
    // 실제 스테이징에 있던 값이다. 일반전이라 리그와 무관하다
    expect(isSupplyLeagueMap('3보급-개인전')).toBe(false)
    expect(isSupplyLeagueMap('보급창고')).toBe(false)
    expect(isSupplyLeagueMap('제3보급창고2')).toBe(false)
  })

  it('빈 값·null은 대상이 아니다', () => {
    expect(isSupplyLeagueMap(null)).toBe(false)
    expect(isSupplyLeagueMap(undefined)).toBe(false)
    expect(isSupplyLeagueMap('')).toBe(false)
  })
})

describe('대상 판정', () => {
  it('제3보급창고 5vs5는 기록 대상이다', () => {
    const verdict = scope()
    expect(verdict.scope).toBe('eligible')
    expect(isProjectable(verdict)).toBe(true)
  })

  it('다른 맵은 인원이 맞아도 대상이 아니다', () => {
    const verdict = scope({ mapName: '올드타운' })
    expect(verdict.scope).toBe('out_of_scope')
    expect(verdict.code).toBe('map_not_in_scope')
    expect(isProjectable(verdict)).toBe(false)
  })

  it('맵을 먼저 본다 — 대상 외 맵이면 인원 사유가 아니라 맵 사유다', () => {
    expect(scope({ mapName: '프로방스', teamASize: 6, teamBSize: 6 }).code).toBe('map_not_in_scope')
  })
})

describe('6vs6 — 비공식이 아니라 대상 외', () => {
  it('6vs6은 out_of_scope다', () => {
    const verdict = scope({ teamASize: 6, teamBSize: 6, sourceParticipantCount: 12 })
    expect(verdict.scope).toBe('out_of_scope')
    expect(verdict.code).toBe('team_size_not_in_scope')
  })

  it('6vs6을 unofficial로 분류하지 않는다', () => {
    const verdict = scope({ teamASize: 6, teamBSize: 6, sourceParticipantCount: 12 })
    // 'unofficial'/'incomplete' 어느 쪽으로도 새면 안 된다
    expect(verdict.scope).not.toBe('incomplete')
    expect(verdict.scope).not.toBe('eligible')
  })

  it('한쪽만 6명이어도 대상 외다', () => {
    expect(scope({ teamASize: 6, teamBSize: 5 }).code).toBe('team_size_not_in_scope')
  })

  it('원본 참가자가 10명을 넘으면 복원 전이라도 대상 외로 본다', () => {
    // 아직 5vs5까지만 붙였어도, 원본이 12명이면 그 경기는 6인전이다
    const verdict = scope({ teamASize: 5, teamBSize: 5, sourceParticipantCount: 12 })
    expect(verdict.scope).toBe('out_of_scope')
  })
})

describe('복원 미완', () => {
  it('4vs5는 보류지 대상 외가 아니다', () => {
    const verdict = scope({ teamASize: 4, teamBSize: 5, sourceParticipantCount: 10 })
    expect(verdict.scope).toBe('incomplete')
    expect(verdict.code).toBe('participant_incomplete')
    expect(isProjectable(verdict)).toBe(false)
  })

  it('5vs4도 보류다', () => {
    expect(scope({ teamASize: 5, teamBSize: 4, sourceParticipantCount: 10 }).scope).toBe('incomplete')
  })

  it('실제로 관측된 4vs1 같은 상태도 보류다 (경기가 이상한 게 아니다)', () => {
    const verdict = scope({ teamASize: 4, teamBSize: 1, sourceParticipantCount: 10 })
    expect(verdict.scope).toBe('incomplete')
    expect(verdict.reason).toContain('덜 복원')
  })

  it('보류는 투영하지 않는다', () => {
    expect(isProjectable(scope({ teamASize: 3, teamBSize: 5, sourceParticipantCount: 10 }))).toBe(
      false,
    )
  })
})

describe('상수', () => {
  it('팀 인원은 5로 고정이다', () => {
    expect(SUPPLY_TEAM_SIZE).toBe(5)
  })

  it('대상 맵은 제3보급창고 하나다', () => {
    expect(SUPPLY_LEAGUE_MAP).toBe('제3보급창고')
  })
})
