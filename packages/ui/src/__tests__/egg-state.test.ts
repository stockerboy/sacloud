import { describe, expect, it } from 'vitest'
import { CLAN_EGG_THRESHOLD, clanEggState, eggRows } from '../egg/eggState'

/**
 * 「알」 규칙 (`docs/EGG_SYSTEM_SPEC.md` 3장 · 5-1).
 *
 * 여기서 지키는 것은 두 가지다 —
 * 알이 **저절로 깨지지 않는 것**, 그리고 클랜을 **한 마리도 흘리지 않는 것**.
 */

describe('clanEggState', () => {
  it('30% 는 상수로 둔다 — 화면이 숫자를 다시 적지 않는다', () => {
    expect(CLAN_EGG_THRESHOLD).toBe(0.3)
  })

  it('클랜원의 30% 이상이 깨면 클랜 알이 깨진다', () => {
    expect(clanEggState({ verifiedMembers: 3, memberCount: 10 }).state).toBe('broken')
    expect(clanEggState({ verifiedMembers: 3, memberCount: 10 }).reason).toBe('threshold')
  })

  it('30% 에 못 미치면 안 깨진다', () => {
    const result = clanEggState({ verifiedMembers: 2, memberCount: 10 })
    expect(result.state).toBe('sealed')
    expect(result.needed).toBe(1)
  })

  it('클랜마스터가 인증하면 혼자서도 깬다', () => {
    const result = clanEggState({ verifiedMembers: 0, memberCount: 40, masterVerified: true })
    expect(result.state).toBe('broken')
    expect(result.reason).toBe('master')
  })

  it('분모가 0이면 저절로 깨지지 않는다 — 0명 중 0명은 100% 가 아니다', () => {
    const result = clanEggState({ verifiedMembers: 0, memberCount: 0 })
    expect(result.state).toBe('sealed')
    expect(result.ratio).toBeNull()
  })

  it('앞으로 몇 명 더 깨야 하는지 센다', () => {
    /* 7명이면 30% = 2.1명 → 올려서 3명이 필요하다 */
    expect(clanEggState({ verifiedMembers: 0, memberCount: 7 }).needed).toBe(3)
    expect(clanEggState({ verifiedMembers: 2, memberCount: 7 }).needed).toBe(1)
  })
})

describe('eggRows', () => {
  const list = (n: number) => Array.from({ length: n }, (_, index) => index)

  it('사양의 그림대로 23개면 7 / 9 / 7 이다', () => {
    const [top, middle, bottom] = eggRows(list(23))
    expect([top.length, middle.length, bottom.length]).toEqual([7, 9, 7])
  })

  it('윗칸과 아랫칸의 길이가 같고 가운뎃칸이 더 길다', () => {
    for (let n = 2; n <= 200; n += 1) {
      const [top, middle, bottom] = eggRows(list(n))
      expect(top.length).toBe(bottom.length)
      expect(middle.length).toBeGreaterThan(top.length)
    }
  })

  it('클랜을 하나도 흘리지 않는다', () => {
    for (let n = 0; n <= 200; n += 1) {
      const rows = eggRows(list(n))
      expect(rows.flat()).toEqual(list(n))
    }
  })

  it('비어 있으면 세 칸 모두 빈다', () => {
    expect(eggRows([])).toEqual([[], [], []])
  })
})
