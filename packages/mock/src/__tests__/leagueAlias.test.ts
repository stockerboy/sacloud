import { describe, expect, it } from 'vitest'
import { HOME_LEAGUES } from '@sacloud/contract'
import { dataset } from '../dataset'
import * as store from '../store'

/**
 * Mock 모드에서 **운영 slug 로 들어와도 화면이 돈다** (O-005 · 2026-09-02).
 *
 * 이게 없던 동안 `NEXT_PUBLIC_API_MODE=mock` 으로 띄우면 홈·랭킹·선수·클랜이 전부
 * 0건이었다. 데이터가 없어서가 아니라 **픽스처 리그 slug 가 운영과 달라서**였다.
 * 그 탓에 로컬에서 화면을 볼 길이 막혔고 판마다 운영에 배포해서 확인해야 했다.
 *
 * ⚠ **픽스처 slug 를 운영과 같게 만들어 고치지 않았다.** 겹치지 않는 것은 일부러
 *   그렇게 둔 것이다 — `apps/worker/src/dev/mockLeaguePurge.ts` 가 운영 DB 에서
 *   slug 로 가짜 시드를 지운다. 이름을 맞추면 그 도구가 진짜 리그를 겨눈다.
 *   그래서 **별칭만** 얹었다. 이 테스트가 그 두 가지를 같이 지킨다.
 */
describe('Mock 리그 별칭 (O-005)', () => {
  it('운영 slug 셋으로 리그를 찾을 수 있다', () => {
    for (const entry of HOME_LEAGUES) {
      expect(store.getLeague(entry.slug), `${entry.slug} 를 못 찾는다`).not.toBeNull()
    }
  })

  it('운영 slug 로 개인랭킹이 0건이 아니다', () => {
    for (const entry of HOME_LEAGUES) {
      const id = store.getLeagueIdBySlug(entry.slug)
      expect(id, `${entry.slug} 의 id 가 없다`).not.toBeNull()
      const page = store.getPlayerRanks(id!, null, 20)
      expect(page, `${entry.slug} 랭킹이 null 이다`).not.toBeNull()
      expect(page!.items.length, `${entry.slug} 개인랭킹이 0건이다`).toBeGreaterThan(0)
    }
  })

  it('★픽스처 slug 는 운영과 겹치지 않는다 — mockLeaguePurge 가 slug 로 지운다★', () => {
    const real = new Set(HOME_LEAGUES.map((entry) => entry.slug))
    for (const league of dataset.leagues) {
      expect(real.has(league.slug), `픽스처 리그 slug 가 운영과 같다: ${league.slug}`).toBe(false)
    }
  })
})
