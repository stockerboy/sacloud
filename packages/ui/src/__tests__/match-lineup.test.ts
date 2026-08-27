/**
 * 라인업 표기 회귀 테스트 — 스나이퍼 `[S]` 와 닉네임 링크.
 *
 * ── 왜 있나
 *   둘 다 틀려도 화면은 멀쩡해 보인다. `[S]` 가 빠져도 그냥 이름이고,
 *   링크가 엉뚱한 선수로 가도 페이지는 정상으로 열린다. 눈으로는 못 잡는다.
 *
 * ── 여기서 고정하는 것
 *   1. `[S]` 는 **그 경기에서** 스나이퍼를 쓴 선수에게만 붙는다 (포지션과 무관)
 *   2. 무기를 모르면(`null`) 붙이지 않는다 — 모르는 것을 아는 척하지 않는다 (D-034)
 *   3. 링크는 canonical Player ID 가 있을 때만 걸리고, 경로는 리그 기록실이다
 *   4. 근거가 없으면 링크를 걸지 않는다 — 남의 기록실로 보내느니 링크가 없는 게 낫다
 */
import { describe, expect, it } from 'vitest'
import { WEAPON } from '@sacloud/contract'
import { SNIPER_MARK, lineupPlayerHref, usedSniper } from '../record/lineupCopy'
import { leaguePlayerPath } from '../common/paths'

describe('스나이퍼 [S] 는 그 경기의 무기로만 정한다', () => {
  it('weapon === 1 이면 스나이퍼다', () => {
    expect(usedSniper(1)).toBe(true)
    expect(usedSniper(WEAPON.SNIPER)).toBe(true)
  })

  it('weapon === 0 이면 라이플이라 붙이지 않는다', () => {
    expect(usedSniper(0)).toBe(false)
    expect(usedSniper(WEAPON.RIFLE)).toBe(false)
  })

  it('weapon 이 null 이면 붙이지 않는다 — 모르는 것을 아는 척하지 않는다', () => {
    expect(usedSniper(null)).toBe(false)
    expect(usedSniper(undefined)).toBe(false)
  })

  it('0 을 falsy 로 흘려 스나이퍼로 만들지 않는다', () => {
    // `!weapon` 으로 짰다면 라이플(0)이 스나이퍼가 됐을 자리다
    expect(usedSniper(0)).toBe(false)
    expect(usedSniper(1)).toBe(true)
  })

  it('표기 문구는 원본 그대로 [S] 다', () => {
    expect(SNIPER_MARK).toBe('[S]')
  })
})

describe('선수의 포지션은 [S] 판정에 끼어들지 않는다', () => {
  it('스나이퍼 포지션 선수라도 그 경기에서 라이플이면 [S] 가 없다', () => {
    expect(usedSniper(WEAPON.RIFLE)).toBe(false)
  })

  it('라이플·멀티 포지션 선수라도 그 경기에서 스나이퍼면 [S] 가 있다', () => {
    expect(usedSniper(WEAPON.SNIPER)).toBe(true)
  })
})

describe('닉네임 링크는 canonical Player ID 로만 건다', () => {
  it('playerId 가 있으면 리그 기록실 경로를 만든다', () => {
    expect(lineupPlayerHref('supply', '500013135')).toBe('/league/supply/player/500013135')
  })

  it('경로 규칙은 paths.ts 한 곳에서 나온다', () => {
    expect(lineupPlayerHref('supply', '500013135')).toBe(leaguePlayerPath('supply', '500013135'))
  })

  it('playerId 가 없으면 링크를 걸지 않는다', () => {
    expect(lineupPlayerHref('supply', null)).toBeNull()
    expect(lineupPlayerHref('supply', undefined)).toBeNull()
  })

  it('playerId 가 빈 문자열·공백이면 링크를 걸지 않는다', () => {
    // 신원이 확정되지 않은 참가자는 id 자리가 비어 온다 (D-148).
    // `/league/supply/player/` 로 보내면 빈 페이지가 된다
    expect(lineupPlayerHref('supply', '')).toBeNull()
    expect(lineupPlayerHref('supply', '   ')).toBeNull()
  })

  it('리그 slug 가 없으면 링크를 걸지 않는다', () => {
    expect(lineupPlayerHref('', '500013135')).toBeNull()
    expect(lineupPlayerHref(null, '500013135')).toBeNull()
  })
})
