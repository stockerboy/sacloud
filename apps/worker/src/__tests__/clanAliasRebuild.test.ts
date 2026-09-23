/**
 * `clan-alias-rebuild` 의 고르기 — 남의 지금 이름과 얇은 이름은 뺀다 (2026-09-23 밤).
 * 이게 틀리면 상대 이름이 「내 옛 이름」 이 되어 투영이 그 이름을 통째로 버린다 (자이언트 누락 원인).
 */
import { describe, expect, it } from 'vitest'
import { pickAliases } from '../jobs/clanAliasRebuild.js'

describe('pickAliases', () => {
  const owners = new Map<string, Set<string>>([
    ['amaryllis', new Set(['fdd8'])],
    ['deluxe', new Set(['ferwfwfwfwf'])],
  ])

  it('주인 이름은 남기고 남의 지금 이름은 뺀다', () => {
    const derived = new Map([
      ['fdd8', [
        { name: 'amaryllis', rows: 100, ratio: 1 },
        { name: 'deluxe', rows: 40, ratio: 0.4 },
      ]],
    ])
    const got = pickAliases(derived, owners)
    expect(got.rows).toEqual([{ subject: 'fdd8', name: 'amaryllis' }])
    expect(got.foreignDropped).toBe(1)
  })

  it('개명 전 이름은 남는다 (2줄 이상)', () => {
    const derived = new Map([
      ['EVOA', [
        { name: 'idylic', rows: 60, ratio: 0.6 },
        { name: 'melody', rows: 40, ratio: 0.4 },
      ]],
    ])
    expect(pickAliases(derived, owners).rows.map((r) => r.name)).toEqual(['idylic', 'melody'])
  })

  it('한 줄만 덮는 얇은 이름은 뺀다 — 첫 이름은 예외', () => {
    const derived = new Map([
      ['s', [
        { name: 'me', rows: 1, ratio: 0.5 },
        { name: 'noise', rows: 1, ratio: 0.005 },
      ]],
    ])
    const got = pickAliases(derived, owners)
    expect(got.rows.map((r) => r.name)).toEqual(['me'])
    expect(got.thinDropped).toBe(1)
  })
})
