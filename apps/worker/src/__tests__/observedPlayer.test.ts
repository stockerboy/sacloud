/**
 * 관측 참가자 신원 회귀 테스트 (D-123).
 *
 * 고정하는 약속
 *  1. 실제로 뛴 사람을 **버리지 않는다**
 *  2. 그렇다고 기존 Player와 **합치지도 않는다**
 *  3. 강한 근거가 있으면 그것을 먼저 쓴다
 */
import { describe, expect, it } from 'vitest'
import {
  barracksPlayerKeyFromSn,
  isObservedPlayer,
  OBSERVED_PLAYER_PREFIX,
  observedPlayerKey,
  participantIdentity,
} from '../lib/observedPlayer'

describe('관측 Player 키', () => {
  it('같은 닉네임은 항상 같은 id다 (결정적)', () => {
    expect(observedPlayerKey('덕섭')).toBe(observedPlayerKey('덕섭'))
  })

  it('앞뒤 공백은 무시한다', () => {
    expect(observedPlayerKey('  덕섭 ')).toBe(observedPlayerKey('덕섭'))
  })

  it('대소문자가 다르면 다른 사람으로 본다', () => {
    // 서든어택 닉네임은 대소문자를 구분한다. 임의로 합치지 않는다
    expect(observedPlayerKey('UlsaN')).not.toBe(observedPlayerKey('ulsan'))
  })

  it('다른 닉네임은 다른 id다', () => {
    expect(observedPlayerKey('씨야')).not.toBe(observedPlayerKey('종원'))
  })

  it('한눈에 관측 전용인 것이 보인다', () => {
    const id = observedPlayerKey('덕섭')
    expect(id.startsWith(OBSERVED_PLAYER_PREFIX)).toBe(true)
    expect(isObservedPlayer(id)).toBe(true)
  })

  it('실제 신원 id는 관측으로 오해되지 않는다', () => {
    for (const id of ['NX-abc123', 'SUPPLY-123', 'E2E-누구', 'cuid123']) {
      expect(isObservedPlayer(id), id).toBe(false)
    }
  })

  it('닉네임 원문이 id에 노출되지 않는다', () => {
    expect(observedPlayerKey('덕섭')).not.toContain('덕섭')
  })
})

describe('신원 우선순위 — 강한 근거 먼저', () => {
  it('확정된 신원이 있으면 그것을 쓴다', () => {
    const identity = participantIdentity({
      userName: '씨야',
      resolvedPlayerId: 'NX-real',
      userNexonSn: 12345,
    })
    expect(identity?.playerId).toBe('NX-real')
    expect(identity?.kind).toBe('resolved')
  })

  it('신원이 없어도 계정 번호가 있으면 강한 키를 쓴다', () => {
    const identity = participantIdentity({ userName: '씨야', resolvedPlayerId: null, userNexonSn: 772196995 })
    expect(identity?.playerId).toBe(barracksPlayerKeyFromSn(772196995))
    expect(identity?.kind).toBe('resolved')
    expect(isObservedPlayer(identity?.playerId)).toBe(false)
  })

  it('아무 근거도 없으면 관측 Player로 남긴다 — 버리지 않는다', () => {
    const identity = participantIdentity({ userName: '덕섭', resolvedPlayerId: null })
    expect(identity).not.toBeNull()
    expect(identity?.kind).toBe('observed')
    expect(isObservedPlayer(identity?.playerId)).toBe(true)
  })

  it('관측이라는 사실을 근거 문구에 남긴다 (동일인 주장이 아니다)', () => {
    const identity = participantIdentity({ userName: '덕섭', resolvedPlayerId: null })
    expect(identity?.evidence).toContain('동일인 주장 아님')
  })

  it('닉네임이 없으면 그때만 null이다', () => {
    expect(participantIdentity({ userName: null, resolvedPlayerId: null })).toBeNull()
    expect(participantIdentity({ userName: '   ', resolvedPlayerId: null })).toBeNull()
  })
})

describe('실제로 유실됐던 경기를 복원한다', () => {
  /** 260821194726124001 의 실제 상세 참가자 10명 (전원 resolvedPlayerId = null 이었다) */
  const REAL = [
    '덕섭', '울상진리', '꼬막', 'lIIllllIlIIIIl', '씨야',
    '멜리사', '옥테', 'MMA수련중', '종원', '야발',
  ]

  it('10명 전원이 Player id를 얻는다 (예전에는 4명만 남았다)', () => {
    const ids = REAL.map((name) => participantIdentity({ userName: name, resolvedPlayerId: null }))
    expect(ids.filter((x) => x !== null)).toHaveLength(10)
  })

  it('서로 다른 10개의 id가 나온다 (한 명으로 뭉치지 않는다)', () => {
    const ids = REAL.map((name) => participantIdentity({ userName: name, resolvedPlayerId: null })!.playerId)
    expect(new Set(ids).size).toBe(10)
  })

  it('이미 아는 사람은 기존 신원을 유지하고, 모르는 사람만 관측으로 간다', () => {
    const known = new Map([['씨야', 'NX-195ae584'], ['종원', 'NX-4d757279']])
    const ids = REAL.map((name) =>
      participantIdentity({ userName: name, resolvedPlayerId: known.get(name) ?? null })!,
    )
    expect(ids.filter((i) => i.kind === 'resolved')).toHaveLength(2)
    expect(ids.filter((i) => i.kind === 'observed')).toHaveLength(8)
    expect(ids).toHaveLength(10)
  })
})
