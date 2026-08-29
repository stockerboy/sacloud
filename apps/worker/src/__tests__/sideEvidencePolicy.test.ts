/**
 * 진영 판정 우선순위 정책 회귀 (D-180).
 *
 * 고정하는 약속
 *   1. 미러(`3rd.supply`) 경기는 저장된 진영이 **정본**이다
 *   2. 넥슨 경기와 origin 을 모르는 경기는 예전 그대로 **보조 증거**다 (D-133)
 *   3. 승/패 이름표는 `winnerSide` 로 뒤집힌다
 */
import { describe, expect, it } from 'vitest'
import {
  MIRROR_ORIGIN,
  storedSideEvidence,
  storedSidesAreCanonical,
} from '../lib/sideEvidencePolicy'

const MATCH = {
  redLeagueClanId: 'lc-red',
  blueLeagueClanId: 'lc-blue',
  winnerSide: 'red',
}

describe('어느 경기의 저장된 진영이 정본인가', () => {
  it('미러 경기는 정본이다', () => {
    expect(storedSidesAreCanonical(MIRROR_ORIGIN)).toBe(true)
    expect(storedSideEvidence({ ...MATCH, origin: MIRROR_ORIGIN }).authority).toBe('primary')
  })

  it('넥슨 재구성 경기의 규칙은 건드리지 않는다', () => {
    expect(storedSidesAreCanonical('nexon')).toBe(false)
    expect(storedSideEvidence({ ...MATCH, origin: 'nexon' }).authority).toBe('fallback')
  })

  it('origin 을 모르면 정본으로 올리지 않는다', () => {
    expect(storedSideEvidence(MATCH).authority).toBe('fallback')
    expect(storedSideEvidence({ ...MATCH, origin: null }).authority).toBe('fallback')
  })
})

describe('승/패 이름표', () => {
  it('red 가 이기면 승자는 red 클랜이다', () => {
    const evidence = storedSideEvidence({ ...MATCH, origin: MIRROR_ORIGIN })
    expect(evidence.winnerLeagueClanId).toBe('lc-red')
    expect(evidence.loserLeagueClanId).toBe('lc-blue')
  })

  it('blue 가 이기면 뒤집힌다', () => {
    const evidence = storedSideEvidence({ ...MATCH, winnerSide: 'blue', origin: MIRROR_ORIGIN })
    expect(evidence.winnerLeagueClanId).toBe('lc-blue')
    expect(evidence.loserLeagueClanId).toBe('lc-red')
  })
})
