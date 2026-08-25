/**
 * D-148 — 3rd.supply 라인업으로 10명 명단을 완성하는 규칙.
 *
 * 여기서 고정하는 것은 **신원 해석 순서**다. 1차 시도에서 이 순서를 틀려
 * 한 사람이 두 줄이 됐고 경기당 11~16명이 됐다. 그 재발을 막는 것이 목적이다.
 *
 * DB 를 띄우지 않고 검증할 수 있도록, 실제 op 이 쓰는 것과 **같은 규칙**을
 * 순수 함수로 다시 표현해 검증한다. op 자체는 Prisma 를 직접 쓰므로
 * 통합 검증은 `pnpm nexon:check` 쪽 숫자 대조가 맡는다.
 */
import { describe, expect, it } from 'vitest'

/** 그 경기 안에서 **유일한** 이름만 근거로 쓴다 */
function uniqueByName<T>(rows: T[], nameOf: (row: T) => string | null): Map<string, T> {
  const seen = new Map<string, T | null>()
  for (const row of rows) {
    const name = nameOf(row)
    if (!name) continue
    seen.set(name, seen.has(name) ? null : row)
  }
  const out = new Map<string, T>()
  for (const [name, row] of seen) if (row) out.set(name, row)
  return out
}

interface Seat {
  playerId: string
  name: string
  sourcePlayerId: string | null
}
interface Row {
  supplyPlayerId: string
  nickname: string
}

/** op 의 2차 pass 해석 순서 그대로 */
function resolve(
  entry: Row,
  seats: Seat[],
  globalIdentity: Map<string, string>,
  storedLinks: Map<string, string>,
): { playerId: string; create: boolean } {
  const byName = uniqueByName(seats, (seat) => seat.name)
  const bySupplyId = new Map<string, string>()
  for (const seat of seats) if (seat.sourcePlayerId) bySupplyId.set(seat.sourcePlayerId, seat.playerId)

  const found =
    bySupplyId.get(entry.supplyPlayerId) ??
    byName.get(entry.nickname)?.playerId ??
    globalIdentity.get(entry.supplyPlayerId) ??
    storedLinks.get(entry.supplyPlayerId)
  return found ? { playerId: found, create: false } : { playerId: `SUP-${entry.supplyPlayerId}`, create: true }
}

const NONE = new Map<string, string>()

describe('신원 해석 순서', () => {
  const seats: Seat[] = [
    { playerId: 'OBS-a', name: 'cherrybox', sourcePlayerId: null },
    { playerId: 'OBS-b', name: '흉골', sourcePlayerId: '1678106912' },
  ]

  it('같은 경기에 같은 이름이 이미 앉아 있으면 그 사람이다', () => {
    const got = resolve({ supplyPlayerId: '672005972', nickname: 'cherrybox' }, seats, NONE, NONE)
    expect(got).toEqual({ playerId: 'OBS-a', create: false })
  })

  it('전역 근거가 다른 사람을 가리켜도 같은 경기 근거가 이긴다', () => {
    // 1차 시도에서 실제로 터진 결함 — 다른 경기에서 만들어진 `SUP-` 그림자가
    // 같은 경기에 앉아 있는 진짜 선수를 가려 한 사람이 두 줄이 됐다
    const global = new Map([['672005972', 'SUP-672005972']])
    const got = resolve({ supplyPlayerId: '672005972', nickname: 'cherrybox' }, seats, global, NONE)
    expect(got).toEqual({ playerId: 'OBS-a', create: false })
  })

  it('저장된 sourcePlayerId 가 같은 경기 안에 있으면 그것이 1순위다', () => {
    const got = resolve({ supplyPlayerId: '1678106912', nickname: '이름바뀜' }, seats, NONE, NONE)
    expect(got).toEqual({ playerId: 'OBS-b', create: false })
  })

  it('같은 경기에 근거가 없으면 전역 확정 신원을 쓴다', () => {
    const global = new Map([['999', 'OBS-z']])
    const got = resolve({ supplyPlayerId: '999', nickname: '없는사람' }, seats, global, NONE)
    expect(got).toEqual({ playerId: 'OBS-z', create: false })
  })

  it('아무 근거도 없으면 새로 만든다 — 비슷한 이름에 갖다 붙이지 않는다', () => {
    const got = resolve({ supplyPlayerId: '111', nickname: 'cherrybox2' }, seats, NONE, NONE)
    expect(got).toEqual({ playerId: 'SUP-111', create: true })
  })
})

describe('같은 경기 안에서 이름이 겹치면 근거로 쓰지 않는다', () => {
  it('동명이인이 두 명이면 둘 다 버린다', () => {
    const seats: Seat[] = [
      { playerId: 'OBS-1', name: '태형', sourcePlayerId: null },
      { playerId: 'OBS-2', name: '태형', sourcePlayerId: null },
    ]
    const got = resolve({ supplyPlayerId: '500', nickname: '태형' }, seats, NONE, NONE)
    // 아무나 골라 붙이면 틀린 사람에게 전적이 붙는다. 새로 만드는 쪽이 맞다
    expect(got).toEqual({ playerId: 'SUP-500', create: true })
  })
})

describe('1차 pass — 전역 근거는 1:1 일 때만 확정한다', () => {
  /** op 의 1차 pass 규칙 그대로 */
  function confirm(
    evidence: Map<string, Set<string>>,
    reverse: Map<string, Set<string>>,
  ): Map<string, string> {
    const identity = new Map<string, string>()
    for (const [supplyId, players] of evidence) {
      if (players.size !== 1) continue
      const playerId = [...players][0]
      if (!playerId || (reverse.get(playerId)?.size ?? 0) !== 1) continue
      identity.set(supplyId, playerId)
    }
    return identity
  }

  it('한 supply id 가 두 사람을 가리키면 버린다', () => {
    const evidence = new Map([['1', new Set(['A', 'B'])]])
    const reverse = new Map([
      ['A', new Set(['1'])],
      ['B', new Set(['1'])],
    ])
    expect(confirm(evidence, reverse).size).toBe(0)
  })

  it('한 사람이 두 supply id 를 가지면 버린다', () => {
    const evidence = new Map([
      ['1', new Set(['A'])],
      ['2', new Set(['A'])],
    ])
    const reverse = new Map([['A', new Set(['1', '2'])]])
    expect(confirm(evidence, reverse).size).toBe(0)
  })

  it('1:1 이면 확정한다', () => {
    const evidence = new Map([['1', new Set(['A'])]])
    const reverse = new Map([['A', new Set(['1'])]])
    expect(confirm(evidence, reverse).get('1')).toBe('A')
  })
})
