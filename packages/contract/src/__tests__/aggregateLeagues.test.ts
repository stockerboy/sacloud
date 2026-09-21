import { describe, expect, it } from 'vitest'

import { AGGREGATE_LEAGUE_SLUGS } from '../aggregateLeagues'
import { HOME_LEAGUES } from '../entities/home'
import {
  FEATURED_LEAGUES,
  PREPARING_LEAGUE_SLUGS,
  UPCOMING_LEAGUE_SLUGS,
  homeLeagues,
} from '../../../ui/src/site-config'

/**
 * ★★화면에 올린 리그는 집계도 돌아야 한다★★ (2026-09-21 · 사장님 지시)
 *
 * > 「★근본적인 문제를 해결해★ 해결방법을 찾아
 * >  매번 내가 알려줄때마다 한명한명 고칠거야?」
 *
 * ── 이 시험이 막는 것
 *
 *   2026-09-20 밤에 C1 을 만들어 ★화면에는 올렸는데★, 집계 잡들이 제 리그 목록을
 *   따로 갖고 있어서 ★C1 이 그 목록에 안 들어갔다.★ 그래서 —
 *   ```
 *   애망.  병영 grave · IPL grave · PL grave · 열산 grave · ★C1 hardcores★
 *   ```
 *   사장님이 화면에서 먼저 보셨다. ★한 명씩 고치면 끝이 없다.★
 *
 *   이제 리그를 화면에 올리면서 집계에 안 넣으면 ★여기가 빨개진다.★
 *   ★다음 사람이 잊을 수 없게 만드는 것★ 이 이 시험의 전부다.
 *
 * ⚠ ★목록을 외우지 않는다★ — 「이 넷이어야 한다」 가 아니라
 *   ★「화면 목록과 집계 목록이 같은 리그를 담는가」★ 만 본다.
 *   리그를 더하든 빼든, 두 곳을 같이 고치면 통과한다.
 */
describe('화면에 올린 리그는 집계도 돈다', () => {
  /** 화면에 실제로 걸리는 리그 — 준비중은 뺀다 */
  function shownSlugs(): string[] {
    return FEATURED_LEAGUES.map((l) => l.href.replace('/league/', '')).filter(
      (slug) => !PREPARING_LEAGUE_SLUGS.includes(slug),
    )
  }

  /**
   * 집계를 요구할 수 있는 리그 — ★모집중은 뺀다★ (2026-09-21 · CPL).
   *
   * 모집중 리그는 ★기록이 한 줄도 없다.★ 없는 기록을 집계하라고 조를 수 없다.
   * 10/1 에 첫 경기가 들어오면 `UPCOMING_LEAGUE_SLUGS` 에서 빼고
   * `AGGREGATE_LEAGUE_SLUGS` 에 넣는다 — 그때 이 시험이 그것을 확인해 준다.
   */
  function countedSlugs(): string[] {
    return shownSlugs().filter((slug) => !UPCOMING_LEAGUE_SLUGS.includes(slug))
  }

  it('★화면에 있는데 집계에 없는 리그가 없다★', () => {
    const missing = countedSlugs().filter((slug) => !AGGREGATE_LEAGUE_SLUGS.includes(slug))
    expect(
      missing,
      `\n★${missing.join(', ')} 가 화면에는 있는데 집계에는 없다★\n` +
        `그 리그는 선수 소속·육각·점수가 ★영영 안 맞춰진다.★\n` +
        `packages/contract/src/aggregateLeagues.ts 에 더하라.\n`,
    ).toEqual([])
  })

  it('★집계에 있는데 화면에 없는 리그가 없다★ — 보이지도 않는 리그를 세지 않는다', () => {
    const shown = new Set(countedSlugs())
    const extra = AGGREGATE_LEAGUE_SLUGS.filter((slug) => !shown.has(slug))
    expect(
      extra,
      `\n★${extra.join(', ')} 가 집계에는 있는데 화면에는 없다★\n` +
        `접은 리그면 집계에서도 빼라. 쓸데없이 무거워진다.\n`,
    ).toEqual([])
  })

  /**
   * ★★홈에도 같은 리그가 서야 한다★★ (2026-09-21 사장님: 「★C1은 리그에 없는문제★」)
   *
   *   C1 을 `FEATURED_LEAGUES`(상단바·서랍)와 집계에는 더했는데 ★`HOME_LEAGUES` 만
   *   빠뜨렸다.★ 그래서 홈의 리그 단추 · 랭킹 미리보기 · 최근 경기에서 C1 이
   *   통째로 안 보였다 — 사장님이 또 화면에서 먼저 보셨다.
   *
   *   ★목록이 셋이면 셋이 다 갈라진다.★ 이 시험이 그걸 막는다.
   */
  it('★상단바에 있는데 홈에 없는 리그가 없다★', () => {
    const home = new Set(HOME_LEAGUES.map((l) => l.slug))
    const missing = shownSlugs().filter((slug) => !home.has(slug))
    expect(
      missing,
      `
★${missing.join(', ')} 가 상단바에는 있는데 홈에는 없다★
` +
        `홈의 리그 단추 · 랭킹 미리보기 · 최근 경기에서 그 리그가 통째로 사라진다.
` +
        `packages/contract/src/entities/home.ts 의 HOME_LEAGUES 에 더하라.
`,
    ).toEqual([])
  })

  it('★홈에 있는데 상단바에 없는 리그가 없다★', () => {
    const shown = new Set(shownSlugs())
    const extra = HOME_LEAGUES.map((l) => l.slug).filter((slug) => !shown.has(slug))
    expect(
      extra,
      `
★${extra.join(', ')} 가 홈에는 있는데 상단바에는 없다★
` +
        `홈에서 들어간 사람이 다른 화면에서 그 리그로 못 돌아온다.
`,
    ).toEqual([])
  })

  /**
   * ★★홈이 그리는 목록도 같아야 한다★★ (2026-09-21 · 세 번째로 같은 병을 앓았다)
   *
   *   ```
   *   2026-09-20  C1 을 더하면서 `HOME_LEAGUES` 를 빠뜨렸다
   *   2026-09-21  C1 을 빼면서 `HomeLeagueButtons.HOME_ORDER` 를 빠뜨렸다 → ★홈에 CPL 단추가 없었다★
   *   ```
   *   ★목록이 다섯 군데 흩어져 있던 것이 원인★ 이라 홈 쪽은 이제 `homeLeagues()` 가 만든다.
   *   이 시험이 그것을 굳힌다 — 어느 한 곳만 고치면 여기가 빨개진다.
   */
  it('★홈이 그리는 리그가 상단바와 같다★', () => {
    const shown = shownSlugs().sort()
    const home = homeLeagues()
      .map((l) => l.href.replace('/league/', ''))
      .sort()
    expect(
      home,
      `★홈과 상단바가 다른 리그를 그린다★ — 홈 [${home.join(', ')}] · 상단바 [${shown.join(', ')}] · 홈 쪽은 homeLeagues() 가 만든다`,
    ).toEqual(shown)
  })

  it('★모집중 리그는 집계에 없다★ — 기록이 한 줄도 없다', () => {
    for (const slug of UPCOMING_LEAGUE_SLUGS) {
      expect(AGGREGATE_LEAGUE_SLUGS, `★${slug} 는 모집중인데 집계가 돈다★`).not.toContain(slug)
    }
  })

  it('★준비중 리그는 집계도 안 돈다★', () => {
    for (const slug of PREPARING_LEAGUE_SLUGS) {
      expect(AGGREGATE_LEAGUE_SLUGS, `★${slug} 는 접은 리그인데 집계가 돈다★`).not.toContain(slug)
    }
  })

  it('목록이 비면 이 시험이 아무것도 안 지킨다', () => {
    expect(AGGREGATE_LEAGUE_SLUGS.length).toBeGreaterThanOrEqual(3)
    expect(shownSlugs().length).toBeGreaterThanOrEqual(3)
  })
})
