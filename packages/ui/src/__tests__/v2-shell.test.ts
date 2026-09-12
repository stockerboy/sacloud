/**
 * ★★Part 10 ③단계 — 머리띠 · 탭바 · 본문 폭★★ (2026-09-07)
 *
 * 여기서 못 박는 것
 *   1. 리그마다 ★강조색 클래스가 다르다★ — 모르는 리그는 색을 지어내지 않는다
 *   2. 탭 목록은 ★옛 판과 같은 함수★(`leagueTabs`)가 정한다. 시안에 맞춰 지우지 않았다
 *   3. 주소에서 리그를 읽는 규칙 — `/league/<slug>` 뿐이다
 *   4. 높이·폭은 ★한 곳(`styles.css`)★ 에만 있다. 화면 코드에 숫자가 없다
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { leagueAccentClass, v2Class } from '../v2/leagueAccent'
import { leagueSlugOf } from '../v2/SiteHeaderV2'
import { leagueTabs } from '../layout/LeagueTopBar'

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('리그 강조색 — 클래스 한 개로 갈아끼운다', () => {
  it('세 리그가 각자 다른 클래스를 받는다', () => {
    expect(leagueAccentClass('supply')).toBe('sac-spl')
    expect(leagueAccentClass('nolink')).toBe('sac-ipl')
    expect(leagueAccentClass('sanply')).toBe('sac-sanply')
  })

  it('모르는 리그는 색을 지어내지 않는다', () => {
    expect(leagueAccentClass('daerule')).toBe('')
    expect(leagueAccentClass(null)).toBe('')
    expect(leagueAccentClass(undefined)).toBe('')
    expect(leagueAccentClass('')).toBe('')
  })

  it('sac-v2 는 리그를 몰라도 언제나 붙는다', () => {
    expect(v2Class(null, 'v2-topbar')).toBe('sac-v2 v2-topbar')
    expect(v2Class('supply', 'v2-topbar')).toBe('sac-v2 sac-spl v2-topbar')
  })
})

describe('주소에서 리그를 읽는다', () => {
  it('리그 화면에서만 읽힌다', () => {
    expect(leagueSlugOf('/league/supply/rank/player')).toBe('supply')
    expect(leagueSlugOf('/league/nolink')).toBe('nolink')
  })

  it('리그 화면이 아니면 없다 — 아무 리그나 고르지 않는다', () => {
    expect(leagueSlugOf('/')).toBeNull()
    expect(leagueSlugOf('/rank')).toBeNull()
    expect(leagueSlugOf('/leagues')).toBeNull()
    expect(leagueSlugOf('/me')).toBeNull()
  })
})

describe('탭을 시안에 맞춘다고 지우지 않았다', () => {
  /* 2026-09-12 사장님: 리그 안 게시판을 없애고 /board 로 모았다 */
  it('SPL 은 클랜랭킹·개인랭킹·경기', () => {
    expect(leagueTabs('supply').map((t) => t.label)).toEqual([
      '클랜랭킹',
      '개인랭킹',
      '경기',
    ])
  })

  it('10 은 클랜 화면이 없다 — 없는 탭을 만들지 않는다', () => {
    expect(leagueTabs('sanply').map((t) => t.label)).toEqual(['개인랭킹', '경기'])
  })

  it('★href 는 한 글자도 안 바뀌었다★', () => {
    const byLabel = Object.fromEntries(leagueTabs('supply').map((t) => [t.label, t.href]))
    expect(byLabel['클랜랭킹']).toBe('/league/supply/rank/clan')
    expect(byLabel['개인랭킹']).toBe('/league/supply/rank/player')
  })
})

describe('치수는 한 곳에만 있다', () => {
  const styles = read('../styles.css')
  const tokens = read('../v2/tokens.css')
  const header = read('../v2/SiteHeaderV2.tsx')
  const tabbar = read('../v2/LeagueTopBarV2.tsx')

  it('시안 실측값이 styles.css 에 있다', () => {
    expect(styles).toContain('--spacing-nav: 68px')
    expect(styles).toContain('--spacing-leaguebar: 54px')
    expect(styles).toContain('--spacing-leaguebar-m: 102px')
    expect(styles).toContain('--layout-max: 1180px')
    expect(styles).toContain('--spacing-layout: 1180px')
    expect(styles).toContain('--spacing-container: 1180px')
  })

  it('v2 층은 숫자를 다시 적지 않고 빌려 온다', () => {
    expect(tokens).toContain('--v2-nav-h: var(--spacing-nav')
    expect(tokens).toContain('--v2-tab-h: var(--spacing-leaguebar')
  })

  it('화면 코드에는 띠 높이 숫자가 없다', () => {
    expect(header).not.toMatch(/h-\[68px\]|height:\s*68/)
    expect(tabbar).not.toMatch(/h-\[54px\]|height:\s*54/)
  })

  /* ★옛 값을 지우지 않았다★ (`CLAUDE.md` 1-4) — 주석으로 남아 있어야 한다 */
  it('옛 값(1120 · 4.5rem)은 정정 이력으로 남아 있다', () => {
    expect(styles).toContain('--layout-max: 1120px;')
    expect(styles).toContain('--spacing-nav: 4.5rem;')
  })

  it('★살아 있는 선언★ 은 새 값 하나뿐이다 — 주석을 걷어내고 센다', () => {
    const live = styles.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(live).toContain('--layout-max: 1180px;')
    expect(live).not.toContain('--layout-max: 1120px;')
    expect(live).toContain('--spacing-nav: 68px;')
    expect(live).not.toContain('--spacing-nav: 4.5rem;')
  })
})
