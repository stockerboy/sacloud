/**
 * 현재 소속 도출 · 선수 id 연결 회귀 (D-130 · D-132).
 *
 * DB 를 건드리지 않는 순수 함수만 검사한다. 실제 스냅샷으로도 한 번 돌려
 * "실데이터에서 근거가 갈리지 않는다"를 고정한다.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deriveCurrentMembership } from '../currentMembership'
import { buildLineupIndex } from '../supplyPlayerLink'

const SNAPSHOT_PATH = join(__dirname, '..', '..', 'data', 'supply-official-matches.json')

function loadSnapshot() {
  return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))
}

/** 손으로 만든 최소 스냅샷 — 규칙을 눈으로 확인할 수 있게 작게 유지한다 */
function tinySnapshot(matches: unknown[]) {
  return {
    capturedAt: '2026-08-24T00:00:00.000Z',
    clans: { '1': { name: '클랜A', slug: 'clan-a' }, '2': { name: '클랜B', slug: 'clan-b' } },
    matches,
  } as never
}

describe('현재 소속 도출', () => {
  it('한 클랜으로만 관측된 선수는 그 클랜이다', () => {
    const out = deriveCurrentMembership(
      tinySnapshot([
        { id: '260101000000000001', red: [[10, '가', 1, 0]], blue: [[20, '나', 2, 0]] },
        { id: '260102000000000001', red: [[10, '가', 1, 1]], blue: [] },
      ]),
    )
    expect(out.rows).toHaveLength(2)
    const row = out.rows.find((r) => r.sourcePlayerId === '10')
    expect(row?.clanSlug).toBe('clan-a')
    expect(row?.observations).toBe(2)
    expect(out.conflicts).toHaveLength(0)
  })

  it('서로 다른 클랜으로 관측되면 **고르지 않는다** — conflicts 로 뺀다', () => {
    const out = deriveCurrentMembership(
      tinySnapshot([
        { id: '260101000000000001', red: [[10, '가', 1, 0]], blue: [] },
        { id: '260102000000000001', red: [[10, '가', 2, 0]], blue: [] },
      ]),
    )
    expect(out.rows).toHaveLength(0)
    expect(out.conflicts).toEqual([{ sourcePlayerId: '10', nickname: '가', clanSlugs: ['clan-a', 'clan-b'] }])
  })

  it('클랜이 없는 관측(무소속)은 소속을 만들지 않는다', () => {
    const out = deriveCurrentMembership(
      tinySnapshot([{ id: '260101000000000001', red: [[10, '가', null, 0]], blue: [] }]),
    )
    expect(out.rows).toHaveLength(0)
    expect(out.clanless).toBe(1)
  })

  it('선수 id 가 없는 줄은 무시한다 — 지어내지 않는다', () => {
    const out = deriveCurrentMembership(
      tinySnapshot([{ id: '260101000000000001', red: [[null, null, 1, 0]], blue: [] }]),
    )
    expect(out.rows).toHaveLength(0)
  })

  it('결과 순서가 고정이다 — 같은 입력이면 같은 출력이다', () => {
    const snapshot = tinySnapshot([
      { id: '260101000000000001', red: [[30, '다', 1, 0], [10, '가', 1, 0]], blue: [[20, '나', 2, 0]] },
    ])
    const a = deriveCurrentMembership(snapshot).rows.map((r) => r.sourcePlayerId)
    const b = deriveCurrentMembership(snapshot).rows.map((r) => r.sourcePlayerId)
    expect(a).toEqual(b)
    expect(a).toEqual([...a].sort())
  })

  it('실제 스냅샷에서 근거가 갈리는 선수가 **없다** (라인업 clan 이 현재 소속이라는 근거)', () => {
    const out = deriveCurrentMembership(loadSnapshot())
    expect(out.rows.length).toBeGreaterThan(500)
    expect(out.conflicts).toHaveLength(0)
  })
})

describe('경기 단위 닉네임 색인', () => {
  it('경기별로 닉네임 → 선수 id 를 만든다', () => {
    const { index, skipped } = buildLineupIndex(
      tinySnapshot([{ id: '260101000000000001', red: [[10, '가', 1, 0]], blue: [[20, '나', 2, 0]] }]),
    )
    expect(skipped).toBe(0)
    expect(index.get('260101000000000001')?.get('가')).toBe('10')
    expect(index.get('260101000000000001')?.get('나')).toBe('20')
  })

  it('한 경기 안에 닉네임이 겹치면 그 경기를 통째로 뺀다 — 누가 누군지 모른다', () => {
    const { index, skipped } = buildLineupIndex(
      tinySnapshot([{ id: '260101000000000001', red: [[10, '가', 1, 0]], blue: [[20, '가', 2, 0]] }]),
    )
    expect(skipped).toBe(1)
    expect(index.has('260101000000000001')).toBe(false)
  })

  it('실제 스냅샷에는 닉네임이 겹치는 경기가 없다', () => {
    const { index, skipped } = buildLineupIndex(loadSnapshot())
    expect(skipped).toBe(0)
    expect(index.size).toBeGreaterThan(700)
  })
})
