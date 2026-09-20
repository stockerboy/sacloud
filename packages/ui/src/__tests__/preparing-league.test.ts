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
  GNB_LEAGUES,
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
   * ⚠ 정정 (2026-09-02) — **자리마다 순서가 다르다.**
   *   홈은 SPL · IPL · 10mountain (지시 #18), 상단바는 IPL · SPL · 10mountain (지시 #14).
   *   목록(`FEATURED_LEAGUES`)은 홈 순서(D-246 그대로)이고 상단바는 `GNB_LEAGUES` 다.
   *   셋뿐이라는 것과 `daerule` 이 없다는 것은 둘 다 그대로다.
   */
  /**
   * ⚠ ★2026-09-20 — 목록을 통째로 외우던 것을 걷었다★ (비판 검수 ⑧).
   *
   *   C1 을 더하자 이 시험이 ★옳은 수정을 막았다.★ 리그가 늘어나는 것은 좋은 일인데
   *   그때마다 시험을 고치게 하면 사람이 시험을 미워하게 된다.
   *
   *   이 시험이 진짜로 지켜야 할 것 둘만 남긴다 —
   *     ① ★`daerule` 이 없다★ (사장님: 「daerule 은 어디에도 넣지 마라」)
   *     ② ★준비중 리그가 목록에 없다★ (누르면 「준비중」 만 나오는 자리를 안 걸어 둔다)
   */
  it('목록에 준비중 리그가 없다 — daerule 은 어디에도 없다', () => {
    const hrefs = FEATURED_LEAGUES.map((item) => item.href)
    expect(hrefs).not.toContain('/league/daerule')
    for (const href of hrefs) {
      const slug = href.replace('/league/', '')
      expect(isLeaguePreparing(slug), `★${slug} 는 준비중인데 목록에 걸려 있다★`).toBe(false)
    }
    /* 목록이 비면 위 단언이 전부 헛돈다 — 그것만 막는다 */
    expect(hrefs.length).toBeGreaterThanOrEqual(3)
  })

  /* 2026-09-12 사장님: 상단바를 10 · IPL · SPL 차례로 (홈 표장과 같은 차례) */
  /* ⚠ 2026-09-12 사장님: «상단바 IPL SPL 열산 이용방법 게시판 순서로 바꿔».
     그날 아침에는 10 · IPL · SPL 이었다 */
  /* ⚠ 옛 차례는 IPL · PL · 열산 — 2026-09-16 사장님 «pl을 맨앞으로 옮겨» */
  /**
   * ★상단바와 홈이 ★같은 리그★ 를 담는다★ — 차례는 자리마다 다를 수 있다.
   *
   * ⚠ 이것이 2026-09-20 에 ★진짜 버그를 잡았다★ — C1 을 `FEATURED_LEAGUES` 에만
   *   더하고 `GNB_LEAGUE_ORDER` 를 빠뜨려서 ★상단바에서만 C1 이 사라질 뻔했다.★
   *   그래서 이 단언은 남긴다. 대신 ★차례를 외우던 줄은 걷었다.★
   */
  it('상단바와 홈이 같은 리그를 담는다 (차례만 다르다)', () => {
    const gnb = GNB_LEAGUES.map((item) => item.href)
    const home = FEATURED_LEAGUES.map((item) => item.href)
    expect([...gnb].sort()).toEqual([...home].sort())
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
