import { describe, expect, it } from 'vitest'
import { decideIplClanNumbers, type SubjectClanNoRow } from '../lib/iplClanNumber.js'

const rows = (...pairs: Array<[string, string]>): SubjectClanNoRow[] =>
  pairs.map(([subject, clanNo]) => ({ subject, clanNo }))

/** 병영수첩 slug → 우리 클랜. 표에 없으면 모르는 클랜이다 */
const resolve = (table: Record<string, string>) => (subject: string) => table[subject] ?? null

describe('decideIplClanNumbers', () => {
  it('주체와 번호가 1:1 이면 잇는다', () => {
    const decision = decideIplClanNumbers(
      rows(['fdd8', '111'], ['fdd8', '111'], ['4473', '222']),
      resolve({ fdd8: 'clan-a', '4473': 'clan-b' }),
    )
    expect(decision.links).toEqual([
      { subject: '4473', clanNo: '222', clanId: 'clan-b' },
      { subject: 'fdd8', clanNo: '111', clanId: 'clan-a' },
    ])
    expect(decision.skipped).toEqual([])
  })

  it('한 주체가 번호를 여럿 가지면 버린다 — 다수결하지 않는다', () => {
    const decision = decideIplClanNumbers(
      rows(['fdd8', '111'], ['fdd8', '999']),
      resolve({ fdd8: 'clan-a' }),
    )
    expect(decision.links).toEqual([])
    expect(decision.counts.multiple_clan_no).toBe(1)
  })

  it('한 번호를 주체 여럿이 쓰면 둘 다 버린다', () => {
    const decision = decideIplClanNumbers(
      rows(['fdd8', '111'], ['4473', '111']),
      resolve({ fdd8: 'clan-a', '4473': 'clan-b' }),
    )
    expect(decision.links).toEqual([])
    expect(decision.counts.shared_clan_no).toBe(2)
  })

  it('우리 클랜을 모르면 잇지 않고 사유를 남긴다', () => {
    const decision = decideIplClanNumbers(rows(['수수께끼', '111']), resolve({}))
    expect(decision.links).toEqual([])
    expect(decision.counts.unresolved_subject).toBe(1)
    expect(decision.skipped[0]).toEqual({
      subject: '수수께끼',
      clanNo: '111',
      reason: 'unresolved_subject',
    })
  })

  it('빈 칸은 세지 않는다', () => {
    const decision = decideIplClanNumbers(rows(['', '111'], ['fdd8', '  ']), resolve({}))
    expect(decision.links).toEqual([])
    expect(decision.skipped).toEqual([])
  })

  it('앞뒤 공백을 다듬어 같은 짝으로 본다', () => {
    const decision = decideIplClanNumbers(
      rows([' fdd8 ', ' 111 '], ['fdd8', '111']),
      resolve({ fdd8: 'clan-a' }),
    )
    expect(decision.links).toEqual([{ subject: 'fdd8', clanNo: '111', clanId: 'clan-a' }])
  })

  it('입력 순서가 바뀌어도 같은 결과가 나온다 (멱등)', () => {
    const pairs = rows(['b', '2'], ['a', '1'], ['c', '3'])
    const table = { a: 'clan-a', b: 'clan-b', c: 'clan-c' }
    const forward = decideIplClanNumbers(pairs, resolve(table))
    const backward = decideIplClanNumbers([...pairs].reverse(), resolve(table))
    expect(forward.links).toEqual(backward.links)
    expect(forward.links.map((link) => link.subject)).toEqual(['a', 'b', 'c'])
  })
})
