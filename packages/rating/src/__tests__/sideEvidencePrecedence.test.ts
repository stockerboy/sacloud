/**
 * 팀 식별 보조 증거의 **우선순위와 한계** 회귀 (D-133).
 *
 * 래더 패키지 쪽에 두는 이유는 `evaluateEligibility` 가 공식 판정·클랜 반영률의 입구이기
 * 때문이다. 보조 증거가 그 판정을 흔들면 안 된다.
 *
 * 여기서 고정하는 약속
 *   1. 넥슨으로 정해지면 보조 증거는 **무시된다**
 *   2. 보조 증거는 참가자를 만들지 않는다 — 한쪽 팀만 있으면 여전히 기록 불가
 *   3. 보조 증거를 써도 **공식 판정 기준은 그대로**다 (본클랜원 3명 · OR 조건)
 *   4. 클랜 반영률도 그대로다 (3+ = 1.0 · 2 = 0.7 · 1 = 0.4 · 0 = 0)
 */
import { describe, expect, it } from 'vitest'
import { evaluateEligibility, type ConfirmedParticipant, type SideEvidence } from '../index'

const EVIDENCE: SideEvidence = {
  winnerLeagueClanId: 'lc-w',
  loserLeagueClanId: 'lc-l',
  source: '3rd.supply-lineup',
}

function p(
  id: string,
  outcome: 'win' | 'lose',
  over: Partial<ConfirmedParticipant> = {},
): ConfirmedParticipant {
  return {
    playerId: id,
    rosterLeagueClanId: null,
    detailLeagueClanId: null,
    outcome,
    kill: 5,
    death: 5,
    assist: 0,
    sources: ['match_detail'],
    ...over,
  }
}

describe('넥슨 우선', () => {
  it('넥슨 상세가 양 팀을 다르게 정하면 보조 증거를 쓰지 않는다', () => {
    const result = evaluateEligibility({
      participants: [
        p('a', 'win', { detailLeagueClanId: 'nexon-w' }),
        p('b', 'lose', { detailLeagueClanId: 'nexon-l' }),
      ],
      sideEvidence: EVIDENCE,
    })
    expect(result.winnerSide?.leagueClanId).toBe('nexon-w')
    expect(result.loserSide?.leagueClanId).toBe('nexon-l')
    expect(result.sideEvidenceUsed).toBeNull()
  })

  it('로스터로 정해져도 보조 증거를 쓰지 않는다', () => {
    const result = evaluateEligibility({
      participants: [
        p('a', 'win', { rosterLeagueClanId: 'roster-w' }),
        p('b', 'lose', { rosterLeagueClanId: 'roster-l' }),
      ],
      sideEvidence: EVIDENCE,
    })
    expect(result.winnerSide?.leagueClanId).toBe('roster-w')
    expect(result.sideEvidenceUsed).toBeNull()
  })

  it('보조 증거가 아예 없으면 예전과 똑같이 판정한다', () => {
    const before = evaluateEligibility({ participants: [p('a', 'win'), p('b', 'lose')] })
    expect(before.recordable).toBe(false)
    expect(before.status).toBe('unidentified_side')
    expect(before.sideEvidenceUsed).toBeNull()
  })
})

describe('보조 증거의 한계', () => {
  it('한쪽 팀만 있으면 보조 증거가 있어도 기록하지 않는다', () => {
    const result = evaluateEligibility({
      participants: [p('a', 'win'), p('b', 'win'), p('c', 'win')],
      sideEvidence: EVIDENCE,
    })
    expect(result.recordable).toBe(false)
    expect(result.status).toBe('single_clan')
  })

  it('참가자 수를 늘리지 않는다 — 확인 수준이 부풀지 않는다', () => {
    const result = evaluateEligibility({
      participants: [p('a', 'win'), p('b', 'win'), p('c', 'lose')],
      sideEvidence: EVIDENCE,
    })
    expect(result.assigned).toHaveLength(3)
    expect(result.completeness).toBe('2v1')
  })
})

describe('공식 판정·클랜 반영률은 그대로다', () => {
  it('보조 증거로 팀을 정해도 본클랜원 3명 규칙이 그대로 적용된다', () => {
    // 승리 팀 본클랜원 3명 → OR 조건으로 공식
    const result = evaluateEligibility({
      participants: [
        p('a', 'win', { rosterLeagueClanId: 'lc-w' }),
        p('b', 'win', { rosterLeagueClanId: 'lc-w' }),
        p('c', 'win', { rosterLeagueClanId: 'lc-w' }),
        p('d', 'lose'),
      ],
      sideEvidence: EVIDENCE,
    })
    expect(result.official).toBe(true)
    expect(result.winnerSide?.members).toBe(3)
    expect(result.winnerSide?.clanWeight).toBe(1)
    // 진 팀은 본클랜원 0명 → 클랜 래더에 반영되지 않는다
    expect(result.loserSide?.members).toBe(0)
    expect(result.loserSide?.clanWeight).toBe(0)
  })

  it('양 팀 모두 본클랜원 3명 미만이면 보조 증거를 써도 비공식이다', () => {
    const result = evaluateEligibility({
      participants: [
        p('a', 'win', { rosterLeagueClanId: 'lc-w' }),
        p('b', 'win', { rosterLeagueClanId: 'lc-w' }),
        p('c', 'lose', { rosterLeagueClanId: 'lc-l' }),
      ],
      sideEvidence: EVIDENCE,
    })
    expect(result.recordable).toBe(true)
    expect(result.official).toBe(false)
    expect(result.winnerSide?.clanWeight).toBe(0.7)
    expect(result.loserSide?.clanWeight).toBe(0.4)
  })

  it('용병 판정도 그대로다 — 뛴 팀과 등록 클랜이 다르면 용병', () => {
    const result = evaluateEligibility({
      participants: [
        p('a', 'win', { rosterLeagueClanId: 'lc-w' }),
        p('b', 'win', { rosterLeagueClanId: 'somewhere-else' }),
        p('c', 'lose', { rosterLeagueClanId: 'lc-l' }),
      ],
      sideEvidence: EVIDENCE,
    })
    const merc = result.assigned.find((row) => row.playerId === 'b')
    expect(merc?.role).toBe('mercenary')
    expect(merc?.leagueClanId).toBe('lc-w')
    // 용병의 원소속 클랜은 그대로 남는다 (그 클랜 래더는 이 경기로 변하지 않는다)
    expect(merc?.rosterLeagueClanId).toBe('somewhere-else')
  })
})
