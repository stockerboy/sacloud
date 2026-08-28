/**
 * Mock 개인랭킹 무기 축 · 폼 TOP3 (D-169).
 *
 * mock 모드가 깨지면 화면 전체가 죽는다. 실제 API와 **같은 규칙**인지 여기서 고정한다.
 *   · 통합 탭은 기존 개인랭킹 그대로 (무기 분리가 통합 래더를 바꾸지 않는다 — CLAUDE.md 3-B 2번)
 *   · 스나/라플은 `ratingDelta` 내림차순이고 서로 섞이지 않는다
 *   · 폼 TOP3 는 3경기 미만을 빼고, 동점이면 경기 수가 많은 쪽이 위
 */
import { describe, expect, it } from 'vitest'
import { FormTop, PlayerRankRow, PAGE_SIZE } from '@sacloud/contract'
import { dataset } from '../dataset'
import * as store from '../store'

const leagueId = dataset.leagues[0]!.id

describe('무기별 개인랭킹 (mock)', () => {
  it('통합 랭킹은 래더 내림차순이고 증감을 싣지 않는다', () => {
    const page = store.getPlayerRanks(leagueId, null, PAGE_SIZE.RANK)!
    const ratings = page.items.map((row) => row.rating)
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a))
    for (const row of page.items) {
      expect(PlayerRankRow.parse(row).rating_delta).toBeNull()
      expect(row.weapon).toBe('all')
    }
  })

  for (const weapon of ['sniper', 'rifle'] as const) {
    it(`${weapon} 랭킹은 증감 내림차순이고 계약을 통과한다`, () => {
      const page = store.getPlayerRanksByWeapon(leagueId, weapon, null, PAGE_SIZE.RANK)!
      expect(page.items.length).toBeGreaterThan(0)
      const deltas = page.items.map((row) => row.rating_delta ?? 0)
      expect(deltas).toEqual([...deltas].sort((a, b) => b - a))
      for (const row of page.items) {
        expect(PlayerRankRow.parse(row).weapon).toBe(weapon)
      }
    })
  }

  it('스나와 라플은 서로 다른 집계다', () => {
    const sniper = store.getPlayerRanksByWeapon(leagueId, 'sniper', null, PAGE_SIZE.RANK)!
    const rifle = store.getPlayerRanksByWeapon(leagueId, 'rifle', null, PAGE_SIZE.RANK)!
    // 같은 선수라도 두 축의 승수가 같을 이유가 없다
    const overlap = sniper.items.filter((s) =>
      rifle.items.some((r) => r.league_player_id === s.league_player_id && r.win === s.win && r.lose === s.lose),
    )
    expect(overlap.length).toBeLessThan(sniper.items.length)
  })

  it('커서로 다음 페이지를 이어 읽으면 순위가 이어진다', () => {
    const first = store.getPlayerRanksByWeapon(leagueId, 'rifle', null, 5)!
    expect(first.items.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5])
    if (!first.cursor.next) return
    const second = store.getPlayerRanksByWeapon(leagueId, 'rifle', first.cursor.next, 5)!
    expect(second.items[0]?.rank).toBe(6)
  })

  it('없는 리그는 null', () => {
    expect(store.getPlayerRanksByWeapon('no-such', 'sniper', null, 20)).toBeNull()
  })
})

describe('폼 TOP3 (mock)', () => {
  for (const weapon of ['all', 'sniper', 'rifle'] as const) {
    it(`${weapon} — 계약을 통과하고 3명 이하, 전원 3경기 이상`, () => {
      const form = FormTop.parse(store.getFormTop(leagueId, weapon))
      expect(form.weapon).toBe(weapon)
      expect(form.rows.length).toBeLessThanOrEqual(3)
      for (const row of form.rows) expect(row.games).toBeGreaterThanOrEqual(3)
      // 증감 내림차순, 동점이면 경기 수가 많은 쪽이 위
      for (let i = 1; i < form.rows.length; i += 1) {
        const prev = form.rows[i - 1]!
        const cur = form.rows[i]!
        expect(prev.rating_delta).toBeGreaterThanOrEqual(cur.rating_delta)
        if (prev.rating_delta === cur.rating_delta) {
          expect(prev.games).toBeGreaterThanOrEqual(cur.games)
        }
      }
    })
  }

  it('없는 리그는 null', () => {
    expect(store.getFormTop('no-such', 'all')).toBeNull()
  })
})
