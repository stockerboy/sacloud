/**
 * 클랜 뱃지 규칙 (2026-09-14 사장님).
 *
 * 여기서 지키는 것은 ★규칙★ 이지 ★값★ 이 아니다 —
 * `CLAN_BADGE_ASTRA_RANK_BONUS` 는 사장님이 «더/덜» 하시면 바뀌는 숫자라
 * 그 숫자를 시험이 붙들면 손댈 때마다 시험이 깨진다. 대신 「보정을 받는 쪽이
 * 언제나 같거나 더 유리하다」 같은 ★뒤집히면 안 되는 것★ 을 지킨다.
 */
import { describe, expect, it } from 'vitest'
import {
  CLAN_BADGE_ASTRA_RANK_BONUS,
  CLAN_BADGE_BONUS_DIVISION,
  CLAN_BADGE_TOP,
  clanBadgeAxes,
} from '../clanBadge'
import { CLAN_HEX_V2_AXIS_KEYS } from '../clanTraitsV2'

const axesAt = (ranks: readonly (number | null)[]) =>
  CLAN_HEX_V2_AXIS_KEYS.map((key, i) => ({ key, rank: ranks[i] ?? null }))

/** 보정을 안 받는 구간 — ASTRA 가 1이므로 2·3 은 CHALLENGER 다 */
const PLAIN_DIVISION = CLAN_BADGE_BONUS_DIVISION + 1

describe('클랜 뱃지 — 5위 안', () => {
  it('축마다 따로 준다 — 한 클랜이 여러 개를 가질 수 있다 (사장님: «축마다 5위 안이면 전부 준다»)', () => {
    const won = clanBadgeAxes(axesAt([1, 3, 5, 6, 40, null]), PLAIN_DIVISION)
    expect(won).toEqual([
      CLAN_HEX_V2_AXIS_KEYS[0],
      CLAN_HEX_V2_AXIS_KEYS[1],
      CLAN_HEX_V2_AXIS_KEYS[2],
    ])
  })

  it('경계는 포함이다 — 딱 5위도 받는다', () => {
    expect(clanBadgeAxes(axesAt([CLAN_BADGE_TOP]), PLAIN_DIVISION)).toHaveLength(1)
    expect(clanBadgeAxes(axesAt([CLAN_BADGE_TOP + 1]), PLAIN_DIVISION)).toHaveLength(0)
  })

  it('★못 잰 축은 절대 안 준다★ — 모르는 것을 잘한다고 하지 않는다 (D-106)', () => {
    expect(clanBadgeAxes(axesAt([null, null, null, null, null, null]), CLAN_BADGE_BONUS_DIVISION)).toEqual([])
  })

  it('돌려주는 차례는 육각형이 도는 차례다 — 준 차례를 따르지 않는다', () => {
    const shuffled = [...axesAt([1, 1, 1, 1, 1, 1])].reverse()
    expect(clanBadgeAxes(shuffled, PLAIN_DIVISION)).toEqual([...CLAN_HEX_V2_AXIS_KEYS])
  })
})

describe('클랜 뱃지 — ASTRA 보정', () => {
  it('★ASTRA 는 손해 보지 않는다★ — 같은 등수면 언제나 같거나 더 받는다', () => {
    /* 값을 박지 않고 모든 등수를 훑는다. 보정값을 바꿔도 이 시험은 살아 있어야 한다 */
    for (let rank = 1; rank <= 30; rank += 1) {
      const astra = clanBadgeAxes(axesAt([rank]), CLAN_BADGE_BONUS_DIVISION).length
      const plain = clanBadgeAxes(axesAt([rank]), PLAIN_DIVISION).length
      expect(astra).toBeGreaterThanOrEqual(plain)
    }
  })

  it('ASTRA 의 경계는 5위 + 보정값이다', () => {
    const cut = CLAN_BADGE_TOP + CLAN_BADGE_ASTRA_RANK_BONUS
    expect(clanBadgeAxes(axesAt([cut]), CLAN_BADGE_BONUS_DIVISION)).toHaveLength(1)
    expect(clanBadgeAxes(axesAt([cut + 1]), CLAN_BADGE_BONUS_DIVISION)).toHaveLength(0)
  })

  it('보정은 ASTRA 구간만 받는다 — 다른 구간은 순수 5위다', () => {
    const beyond = CLAN_BADGE_TOP + 1
    expect(clanBadgeAxes(axesAt([beyond]), PLAIN_DIVISION)).toHaveLength(0)
    expect(clanBadgeAxes(axesAt([beyond]), CLAN_BADGE_BONUS_DIVISION + 2)).toHaveLength(0)
    /* 구간을 모르는 줄(0)도 보정을 안 받는다 */
    expect(clanBadgeAxes(axesAt([beyond]), 0)).toHaveLength(0)
  })

  it('보정값은 0 이상이다 — 음수면 ASTRA 가 벌을 받는다', () => {
    expect(CLAN_BADGE_ASTRA_RANK_BONUS).toBeGreaterThanOrEqual(0)
  })
})
