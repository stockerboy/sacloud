import { describe, expect, it } from 'vitest'
import { MVP_SAVE_THRESHOLD, pickMvp } from './playerHexBuild'

/* MVP 규칙 (2026-09-11 사장님): 세이브 2회↑ 무조건 → 킬 많은 순 → 데스 적은 순 → 고정 무작위 */
describe('MVP 규칙', () => {
  it('세이브 2회 이상이면 킬이 적어도 MVP', () => {
    const pick = pickMvp('m1', [
      { playerId: 'a', saves: 0, kill: 20, death: 3 },
      { playerId: 'b', saves: MVP_SAVE_THRESHOLD, kill: 5, death: 10 },
    ])
    expect(pick).toBe('b')
  })

  it('세이브 1회는 규칙에 안 들어간다 — 킬로 정한다', () => {
    const pick = pickMvp('m1', [
      { playerId: 'a', saves: 0, kill: 20, death: 3 },
      { playerId: 'b', saves: 1, kill: 5, death: 10 },
    ])
    expect(pick).toBe('a')
  })

  it('킬이 같으면 데스 적은 쪽', () => {
    const pick = pickMvp('m1', [
      { playerId: 'a', saves: 0, kill: 10, death: 8 },
      { playerId: 'b', saves: 0, kill: 10, death: 4 },
    ])
    expect(pick).toBe('b')
  })

  it('킬·데스 다 같으면 무작위 — 그러나 같은 경기는 항상 같은 답', () => {
    const cands = [
      { playerId: 'a', saves: 0, kill: 10, death: 8 },
      { playerId: 'b', saves: 0, kill: 10, death: 8 },
    ]
    const first = pickMvp('m1', cands)
    expect(['a', 'b']).toContain(first)
    for (let i = 0; i < 20; i += 1) expect(pickMvp('m1', [...cands].reverse())).toBe(first)
  })

  it('후보가 없으면 null · 킬 모르는 선수는 뒤로', () => {
    expect(pickMvp('m1', [])).toBeNull()
    const pick = pickMvp('m1', [
      { playerId: 'a', saves: 0, kill: null, death: null },
      { playerId: 'b', saves: 0, kill: 0, death: 0 },
    ])
    expect(pick).toBe('b')
  })
})
