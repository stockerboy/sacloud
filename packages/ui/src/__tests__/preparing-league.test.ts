/**
 * **서비스 준비중** 리그 (D-178).
 *
 * 대룰리그(`daerule`)를 접었다. 여기서 고정하는 것 —
 *
 *   1. 준비중 판정이 **slug 배열 한 곳**에서만 나온다 (화면에 slug 를 뿌리지 않는다)
 *   2. GNB 에는 **리그 셋뿐이다** (D-251) — 아래 ⚠ 참조
 *   3. 다른 리그는 영향받지 않는다
 *
 * ── ⚠ 정정 (2026-09-01 · D-251) — 2번이 뒤집혔다
 *   원래 2번은 「GNB 링크는 **그대로 남는다** — 지우면 눌렀을 때 빈 화면이 된다.
 *   사용자가 원한 것은 링크를 누르면 **안내가 나오는 것**이다」였다.
 *   그 뒤 사용자가 *"우리는 리그 세개뿐이다"* 라고 정해 `daerule` 을 GNB 에서 뺐다.
 *   **코드가 맞고 옛 기대값이 틀린 것**이라, 그 케이스는 파일 끝의
 *   `describe.skip('LEGACY …')` 로 옮겨 두었다 (`CLAUDE.md` 10-4).
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

  it('SPL · IPL · 10mountain 리그는 그대로 열려 있다', () => {
    for (const slug of ['supply', 'nolink', 'sanply']) {
      expect(isLeaguePreparing(slug)).toBe(false)
    }
  })

  /**
   * GNB 에는 **리그 셋뿐이다** (2026-09-01 · D-251).
   *
   * 사용자 지시: *"우리는 리그 세개뿐이다 SPL IPL 10🏔️"* · *"daerule 은 어디에도 넣지 마라"*.
   * 그래서 `daerule` 은 GNB 에서 빠졌다. **라우트와 데이터는 그대로**라 주소를 직접 치면
   * 여전히 「준비중」 안내가 나온다 — 없앤 것은 링크 한 줄이다.
   */
  /**
   * ⚠ 정정 (2026-09-02 · 지시 #14 ①) — **순서가 IPL · SPL · 10mountain 이 됐다.**
   *   사장님: *"첫번째로 IPL 두번째로 SPL 을 넣어라"*. 그전(D-246)에는 SPL 이 먼저였다.
   *   셋뿐이라는 것과 `daerule` 이 없다는 것은 그대로다.
   */
  it('GNB 에는 IPL · SPL · 10mountain 셋뿐이다 (daerule 은 빠졌다 · 지시 #14 ① 순서)', () => {
    const hrefs = FEATURED_LEAGUES.map((item) => item.href)
    expect(hrefs).toEqual(['/league/nolink', '/league/supply', '/league/sanply'])
    expect(hrefs).not.toContain('/league/daerule')
  })

  it('안내 문구가 `서비스 준비중` 이다', () => {
    expect(PREPARING_HEADLINE).toBe('서비스 준비중')
    expect(PREPARING_MESSAGE.length).toBeGreaterThan(0)
  })
})

/**
 * 옛 규칙 — **지우지 않고 꺼 둔다** (`CLAUDE.md` 10-4).
 *
 * D-178 때는 「준비중이어도 GNB 링크는 남긴다」가 규칙이었다. 지우면 눌렀을 때
 * 빈 화면이 되니 안내를 보여 주자는 뜻이었고, 그때는 이 기대값이 옳았다.
 * D-251 이 그 규칙을 **리그 셋만 노출**로 바꿨다. 되돌리면 이 블록을 다시 켠다.
 */
describe.skip('LEGACY (D-178) — 준비중 리그도 GNB 에 남긴다', () => {
  it('GNB 에서 링크를 빼지 않는다 — 눌렀을 때 안내가 나와야 한다', () => {
    const hrefs = FEATURED_LEAGUES.map((item) => item.href)
    expect(hrefs).toContain('/league/daerule')
  })
})
