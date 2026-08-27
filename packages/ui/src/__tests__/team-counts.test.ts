import { describe, expect, it } from 'vitest'
import { formatTeamCounts } from '../common/format'

/**
 * 운영에서 정상 5대5 경기가 `10 vs 10` 으로 보인 적이 있다 (D-152).
 * `player_count`(총원)를 양쪽에 그대로 썼기 때문이다. 그 회귀를 고정한다.
 */
describe('formatTeamCounts — 총원이 아니라 팀별 인원', () => {
  it('정상 5대5', () => {
    expect(formatTeamCounts(5, 5)).toBe('5 vs 5')
  })

  it('인원이 어긋나면 어긋난 대로 보여 준다 (반올림하지 않는다)', () => {
    expect(formatTeamCounts(5, 4)).toBe('5 vs 4')
    expect(formatTeamCounts(4, 5)).toBe('4 vs 5')
    expect(formatTeamCounts(6, 6)).toBe('6 vs 6')
  })

  it('총원 10을 양쪽에 쓰지 않는다', () => {
    expect(formatTeamCounts(5, 5)).not.toBe('10 vs 10')
  })

  it('비어 있어도 숫자를 지어내지 않는다', () => {
    expect(formatTeamCounts(0, 0)).toBe('0 vs 0')
  })
})
