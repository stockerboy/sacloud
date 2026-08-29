/**
 * **서비스 준비중** 리그 (D-178).
 *
 * 대룰리그(`daerule`)를 접었다. 여기서 고정하는 것 —
 *
 *   1. 준비중 판정이 **slug 배열 한 곳**에서만 나온다 (화면에 slug 를 뿌리지 않는다)
 *   2. GNB 링크는 **그대로 남는다** — 지우면 눌렀을 때 빈 화면이 된다.
 *      사용자가 원한 것은 링크를 누르면 **안내가 나오는 것**이다
 *   3. 다른 리그는 영향받지 않는다
 */
import { describe, expect, it } from 'vitest'
import {
  FEATURED_LEAGUES,
  PREPARING_LEAGUE_SLUGS,
  isLeaguePreparing,
} from '../site-config'
import { PREPARING_HEADLINE, PREPARING_MESSAGE } from '../league/preparingText'

describe('준비중 리그', () => {
  it('대룰리그는 준비중이다', () => {
    expect(isLeaguePreparing('daerule')).toBe(true)
    expect([...PREPARING_LEAGUE_SLUGS]).toContain('daerule')
  })

  it('공식·무소속·열산 리그는 그대로 열려 있다', () => {
    for (const slug of ['supply', 'nolink', 'sanply']) {
      expect(isLeaguePreparing(slug)).toBe(false)
    }
  })

  it('GNB 에서 링크를 빼지 않는다 — 눌렀을 때 안내가 나와야 한다', () => {
    const hrefs = FEATURED_LEAGUES.map((item) => item.href)
    expect(hrefs).toContain('/league/daerule')
  })

  it('안내 문구가 `서비스 준비중` 이다', () => {
    expect(PREPARING_HEADLINE).toBe('서비스 준비중')
    expect(PREPARING_MESSAGE.length).toBeGreaterThan(0)
  })
})
