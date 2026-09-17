/**
 * ★배지 여덟★ — 사장님이 정하신 짝이 코드에 그대로 있는지 (2026-09-17).
 *
 * > «왼쪽위부터 어태커 , 스나싸움마스터 , 디펜딩챔피언, 샷터 , 소수싸움 마스터, 크래커 , 세이브 머신»
 * > «스나는 뱃지를 두개 만들어 A 장악력 B 장악력»
 */
import { describe, expect, it } from 'vitest'

import { BADGES, BADGE_KEYS, badgeArtPath, badgeOfAxis, badgesOfWeapon } from '../badges'

describe('배지 여덟 · 그림 일곱', () => {
  it('★그림은 일곱 장뿐이다★ — 여덟째를 지어내지 않는다', () => {
    const arts = new Set(BADGE_KEYS.map((k) => BADGES[k].art))
    expect(arts.size).toBe(7)
  })

  it('★A장악력과 B장악력은 같은 그림(황소)을 쓴다★', () => {
    expect(BADGES.aHold.art).toBe('attacker')
    expect(BADGES.bHold.art).toBe('attacker')
    expect(BADGES.attacker.art).toBe('attacker')
  })

  it('사장님이 부르신 이름 그대로다', () => {
    expect(BADGES.attacker.label).toBe('어태커')
    expect(BADGES.snipeDuel.label).toBe('스나싸움마스터')
    expect(BADGES.defender.label).toBe('디펜딩챔피언')
    expect(BADGES.shotter.label).toBe('샷터')
    expect(BADGES.outnumber.label).toBe('소수싸움마스터')
    expect(BADGES.cracker.label).toBe('크래커')
    expect(BADGES.save.label).toBe('세이브 머신')
    expect(BADGES.aHold.label).toBe('A장악력')
    expect(BADGES.bHold.label).toBe('B장악력')
  })

  it('★무기마다 여섯 개씩★ — 육각이 여섯 축이니 배지도 여섯이다', () => {
    expect(badgesOfWeapon(1).map((b) => b.label))
      .toEqual(['A장악력', 'B장악력', '스나싸움마스터', '디펜딩챔피언', '소수싸움마스터', '세이브 머신'])
    expect(badgesOfWeapon(0).map((b) => b.label))
      .toEqual(['어태커', '디펜딩챔피언', '샷터', '소수싸움마스터', '크래커', '세이브 머신'])
  })

  it('★없는 배지를 지어내지 않는다★ — 스나에게 샷터·크래커가 없다', () => {
    const sniper = badgesOfWeapon(1).map((b) => b.key)
    expect(sniper).not.toContain('shotter')
    expect(sniper).not.toContain('cracker')
    expect(sniper).not.toContain('attacker')
  })

  it('★라플에게 스나싸움마스터·A장악력·B장악력이 없다★', () => {
    const rifle = badgesOfWeapon(0).map((b) => b.key)
    expect(rifle).not.toContain('snipeDuel')
    expect(rifle).not.toContain('aHold')
    expect(rifle).not.toContain('bHold')
  })

  it('축 → 배지 — 무기를 같이 봐야 한다', () => {
    /* `duel` 은 스나면 스나싸움마스터, 라플이면 샷터다 */
    expect(badgeOfAxis('duel', 1)?.key).toBe('snipeDuel')
    expect(badgeOfAxis('duel', 0)?.key).toBe('shotter')
    /* `safe` 는 스나면 디펜딩챔피언, 라플이면 크래커다 */
    expect(badgeOfAxis('safe', 1)?.key).toBe('defender')
    expect(badgeOfAxis('safe', 0)?.key).toBe('cracker')
    /* `gap` 은 스나면 B장악력, 라플이면 디펜딩챔피언이다 */
    expect(badgeOfAxis('gap', 1)?.key).toBe('bHold')
    expect(badgeOfAxis('gap', 0)?.key).toBe('defender')
    /* `chance` 는 스나면 A장악력, 라플이면 어태커다 */
    expect(badgeOfAxis('chance', 1)?.key).toBe('aHold')
    expect(badgeOfAxis('chance', 0)?.key).toBe('attacker')
  })

  it('여섯 축이 무기마다 빠짐없이 배지로 이어진다', () => {
    for (const weapon of [0, 1] as const) {
      const got = (['save', 'duel', 'chance', 'safe', 'gap', 'outnumbered'] as const)
        .map((axis) => badgeOfAxis(axis, weapon)?.key ?? null)
      expect(got.every((k) => k !== null)).toBe(true)
      expect(new Set(got).size).toBe(6)
    }
  })

  it('그림 경로는 한 곳에서 만든다', () => {
    expect(badgeArtPath(BADGES.save)).toBe('/badges/save.png')
    expect(badgeArtPath(BADGES.bHold)).toBe('/badges/attacker.png')
  })
})
