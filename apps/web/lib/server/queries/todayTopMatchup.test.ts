/**
 * ★오늘의 상대전적★ — 사장님이 적어 주신 시험 그대로 (2026-09-22)
 *
 * 여기서 보는 것은 ★DB 를 안 타는 두 가지★ 다 — 하루의 경계와 고르기 규칙.
 * DB 를 타는 쪽(`todayTopMatchup`)은 화면에서 `live` 로 확인한다
 * (mock 은 `head_to_head: []` 라 이 카드가 아예 안 뜬다).
 */
import { describe, expect, it } from 'vitest'
import { DAY_BOUNDARY_HOUR_KST, todayWindow } from './todayTopMatchup'

/** KST 문자열을 Date 로 — 시험 안에서만 쓴다 */
const kst = (s: string): Date => new Date(`${s}+09:00`)
/** Date 를 KST «MM-DD HH:mm» 로 — 눈으로 읽기 위한 것 */
const show = (d: Date): string => {
  const k = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`
}

describe('하루의 경계 — 매일 15:00 KST', () => {
  it('경계 시각은 15시다', () => {
    expect(DAY_BOUNDARY_HOUR_KST).toBe(15)
  })

  it('15:00 을 지난 뒤에는 ★오늘 15:00★ 이 시작이다', () => {
    const { from, to } = todayWindow(kst('2026-09-22T15:00:00'))
    expect(show(from)).toBe('09-22 15:00')
    expect(show(to)).toBe('09-23 15:00')
  })

  it('15:00 직전에는 ★어제 15:00★ 이 시작이다', () => {
    const { from, to } = todayWindow(kst('2026-09-22T14:59:59'))
    expect(show(from)).toBe('09-21 15:00')
    expect(show(to)).toBe('09-22 15:00')
  })

  it('자정을 넘겨도 어제 15:00 창이 이어진다', () => {
    const { from } = todayWindow(kst('2026-09-22T03:20:00'))
    expect(show(from)).toBe('09-21 15:00')
  })

  it('★15:00 에 창이 갈린다★ — 1초 차이로 하루가 바뀐다', () => {
    const before = todayWindow(kst('2026-09-22T14:59:59')).from
    const after = todayWindow(kst('2026-09-22T15:00:00')).from
    expect(before.getTime()).not.toBe(after.getTime())
    expect(after.getTime() - before.getTime()).toBe(24 * 60 * 60 * 1000)
  })

  it('창은 언제나 정확히 24시간이다', () => {
    for (const t of ['2026-09-22T15:00:00', '2026-09-22T23:59:59', '2026-09-23T14:59:59']) {
      const { from, to } = todayWindow(kst(t))
      expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000)
    }
  })

  it('달이 바뀌는 자리에서도 맞다', () => {
    expect(show(todayWindow(kst('2026-10-01T02:00:00')).from)).toBe('09-30 15:00')
  })
})

/**
 * ★고르기 규칙★ — 쿼리 안의 판정과 ★같은 순서★ 로 다시 적어 시험한다.
 * (쿼리 쪽은 DB 를 타므로 여기서는 규칙만 떼어 본다 — 규칙이 바뀌면 둘 다 바뀌어야 한다)
 */
interface Pick {
  aId: string
  bId: string
  games: number
  last: number
}
function choose(list: readonly Pick[]): Pick | null {
  let best: Pick | null = null
  for (const p of list) {
    if (best === null) {
      best = p
      continue
    }
    if (p.games !== best.games) {
      if (p.games > best.games) best = p
      continue
    }
    if (p.last !== best.last) {
      if (p.last > best.last) best = p
      continue
    }
    if (`${p.aId}${p.bId}` < `${best.aId}${best.bId}`) best = p
  }
  return best
}

describe('매치업 고르기 — 사장님이 적어 주신 경우 그대로', () => {
  it('A-B 7경기 / C-D 6경기 → ★A-B★', () => {
    const got = choose([
      { aId: 'A', bId: 'B', games: 7, last: 100 },
      { aId: 'C', bId: 'D', games: 6, last: 200 },
    ])
    expect(`${got?.aId}-${got?.bId}`).toBe('A-B')
  })

  it('A-B 7경기 / C-D 8경기 → ★C-D 로 바뀐다★', () => {
    const got = choose([
      { aId: 'A', bId: 'B', games: 7, last: 100 },
      { aId: 'C', bId: 'D', games: 8, last: 50 },
    ])
    expect(`${got?.aId}-${got?.bId}`).toBe('C-D')
  })

  it('경기 수가 같으면 ★마지막 경기가 더 최근★ 인 쪽', () => {
    const got = choose([
      { aId: 'A', bId: 'B', games: 5, last: 100 },
      { aId: 'C', bId: 'D', games: 5, last: 300 },
    ])
    expect(`${got?.aId}-${got?.bId}`).toBe('C-D')
  })

  it('★둘 다 같으면 클랜 ID★ — 랜덤이 아니다. 몇 번을 돌려도 같은 답이다', () => {
    const list: Pick[] = [
      { aId: 'zz', bId: 'zz2', games: 5, last: 100 },
      { aId: 'aa', bId: 'aa2', games: 5, last: 100 },
    ]
    const first = choose(list)
    for (let i = 0; i < 50; i += 1) {
      expect(choose(list)?.aId).toBe(first?.aId)
      expect(choose([...list].reverse())?.aId).toBe(first?.aId)
    }
    expect(first?.aId).toBe('aa')
  })

  it('하나도 없으면 null 이다 — 가짜를 만들지 않는다', () => {
    expect(choose([])).toBeNull()
  })
})

/**
 * ★A vs B 와 B vs A 는 같은 매치업이다★ — 열쇠 만드는 규칙 (쿼리의 `pairKey` 와 같다)
 */
function pairKey(x: string, y: string): string {
  return x < y ? `${x}\u0000${y}` : `${y}\u0000${x}`
}
describe('A vs B = B vs A', () => {
  it('차례를 뒤집어도 같은 열쇠다', () => {
    expect(pairKey('veritas', 'vuvuzela')).toBe(pairKey('vuvuzela', 'veritas'))
  })
  it('다른 짝은 다른 열쇠다', () => {
    expect(pairKey('a', 'b')).not.toBe(pairKey('a', 'c'))
  })
  it('★이어 붙이기 사고가 안 난다★ — «ab»+«c» 와 «a»+«bc» 가 섞이지 않는다', () => {
    expect(pairKey('ab', 'c')).not.toBe(pairKey('a', 'bc'))
  })
})
