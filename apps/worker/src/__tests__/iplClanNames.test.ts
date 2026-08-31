/**
 * 클랜 개명 추적 테스트.
 *
 * 이게 틀리면 **개명한 클랜의 경기가 통째로 사라진다** — 실제로 `melody` 1,901건과
 * `pIacebo` 607건이 그렇게 빠져 있었다 (2026-08-31 IPL 투영 미리보기).
 */
import { describe, expect, it } from 'vitest'
import { deriveClanNames, type SideRow } from '../lib/iplClanNames.js'

const names = (m: Map<string, ReturnType<typeof deriveClanNames> extends Map<string, infer V> ? V : never>, k: string) =>
  (m.get(k) ?? []).map((x) => x.name)

describe('deriveClanNames — slug 가 써 온 이름들을 데이터에서 뽑는다', () => {
  it('이름을 한 번도 안 바꿨으면 하나만 나온다', () => {
    const rows: SideRow[] = [
      { subject: 'fdd8', red: 'amaryllis', blue: '상대A' },
      { subject: 'fdd8', red: '상대B', blue: 'amaryllis' },
      { subject: 'fdd8', red: 'amaryllis', blue: '상대C' },
    ]
    expect(names(deriveClanNames(rows), 'fdd8')).toEqual(['amaryllis'])
  })

  it('개명하면 두 이름이 다 나온다 — 이게 핵심이다', () => {
    const rows: SideRow[] = [
      { subject: 'EVOA', red: 'melody', blue: '상대A' },
      { subject: 'EVOA', red: 'melody', blue: '상대B' },
      { subject: 'EVOA', red: 'melody', blue: '상대C' },
      { subject: 'EVOA', red: 'idylic', blue: '상대D' },
      { subject: 'EVOA', red: 'idylic', blue: '상대E' },
    ]
    const got = names(deriveClanNames(rows), 'EVOA')
    expect(got).toContain('melody')
    expect(got).toContain('idylic')
  })

  it('많이 덮은 이름이 앞에 온다', () => {
    const rows: SideRow[] = [
      { subject: 'EVOA', red: 'melody', blue: 'x' },
      { subject: 'EVOA', red: 'melody', blue: 'y' },
      { subject: 'EVOA', red: 'melody', blue: 'z' },
      { subject: 'EVOA', red: 'idylic', blue: 'w' },
    ]
    expect(names(deriveClanNames(rows), 'EVOA')[0]).toBe('melody')
  })

  it('주인 이름이 상대 이름보다 먼저 뽑힌다 — 상대는 일부 줄에만 나온다', () => {
    const rows: SideRow[] = [
      { subject: 'fdd8', red: 'amaryllis', blue: 'A' },
      { subject: 'fdd8', red: 'amaryllis', blue: 'B' },
      { subject: 'fdd8', red: 'amaryllis', blue: 'C' },
      { subject: 'fdd8', red: 'amaryllis', blue: 'D' },
    ]
    expect(names(deriveClanNames(rows), 'fdd8')[0]).toBe('amaryllis')
  })

  it('slug 가 여럿이면 각각 따로 뽑는다', () => {
    const rows: SideRow[] = [
      { subject: 'fdd8', red: 'amaryllis', blue: 'x' },
      { subject: 'EVOA', red: 'melody', blue: 'y' },
    ]
    const m = deriveClanNames(rows)
    expect(names(m, 'fdd8')).toEqual(['amaryllis'])
    expect(names(m, 'EVOA')).toEqual(['melody'])
  })

  it('이름이 비어 있는 줄은 덮이지 않는다 — 억지로 집지 않는다', () => {
    const rows: SideRow[] = [
      { subject: 'x', red: null, blue: null },
      { subject: 'x', red: '어떤클랜', blue: null },
    ]
    expect(names(deriveClanNames(rows), 'x')).toEqual(['어떤클랜'])
  })

  it('줄이 없으면 빈 결과다', () => {
    expect(deriveClanNames([]).size).toBe(0)
  })

  it('비율은 그 slug 의 전체 줄 대비다', () => {
    const rows: SideRow[] = [
      { subject: 's', red: 'A', blue: 'x' },
      { subject: 's', red: 'A', blue: 'y' },
      { subject: 's', red: 'B', blue: 'z' },
      { subject: 's', red: 'B', blue: 'w' },
    ]
    const got = deriveClanNames(rows).get('s') ?? []
    expect(got[0]?.ratio).toBeCloseTo(0.5)
  })

  it('이름이 8개를 넘어도 무한히 집지 않는다', () => {
    const rows: SideRow[] = Array.from({ length: 40 }, (_, i) => ({
      subject: 's',
      red: `이름${i}`,
      blue: `상대${i}`,
    }))
    expect((deriveClanNames(rows).get('s') ?? []).length).toBeLessThanOrEqual(8)
  })
})
