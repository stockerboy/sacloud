/**
 * ★★Part 10 ⑧ — 경기 상세 이식★★ (2026-09-07)
 *
 * 여기서 못 박는 것
 *   1. 경기 상세가 v2 목록에 있다 (경기 목록은 아직 아니다)
 *   2. ★승패를 넓은 면에 칠하지 않는다★ — 왼쪽 막대와 글자로만 가른다
 *   3. 화면이 ★Cloud 표기★ 를 리그 API 가 아니라 공통 자리에서 가져온다
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isV2Route } from '../v2/migrated'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('경기 상세가 v2 로 옮겨졌다', () => {
  it('세 리그의 경기 상세', () => {
    expect(isV2Route('/league/nolink/match/260907051005000001')).toBe(true)
    expect(isV2Route('/league/supply/match/260907043144000001')).toBe(true)
    expect(isV2Route('/league/sanply/match/260907040257000001')).toBe(true)
  })

  it('★경기 목록은 아직 안 옮겼다★ — 상세만 물어야 한다', () => {
    expect(isV2Route('/league/supply/match')).toBe(false)
    expect(isV2Route('/league/supply/match/abc/extra')).toBe(false)
  })
})

describe('승패를 면에 칠하지 않는다 (시안)', () => {
  const tokens = read('../v2/tokens.css')

  /*
   * ⚠ ★2026-09-22 정정★ — 이 시험은 색 값을 그대로 박아 두고 있었다(`#0f1015`).
   *   그 값은 ★다크 남색 시절★ 의 것이고, 「서플라이 투톤」 으로 본문이 흰 바탕이 되면서
   *   `var(--v2-panel)` 로 바뀜다 (`v2/tokens.css` 의 ⚠ 주석에 옛 값이 남아 있다).
   *
   *   ★못 박을 것은 색 이름이 아니라 「둘이 같은 중립색」 이다.★ 바탕이 흰색이든
   *   남색이든, 이긴 면과 진 면이 같아야 ★펼친 라인업이 한 팀 색으로 안 물든다.★
   *   그래서 값을 박지 않고 ★둘이 같은가★ 와 ★팀 색이 아닌가★ 를 묻는다.
   */
  it('이긴 면과 진 면이 ★같은 중립색★ 이다', () => {
    const valueOf = (name: string) => {
      const hit = tokens.match(new RegExp(`--${name}:\\s*([^;]+);`))
      expect(hit, `${name} 이 tokens.css 에 없다`).not.toBeNull()
      return hit![1]!.trim()
    }
    const win = valueOf('color-win-bg')
    const lose = valueOf('color-lose-bg')
    expect(win).toBe(lose)
    /* 팀 색을 넣으면 다시 면이 물든다 — 파랑·빨강 토큰을 쓰면 안 된다 */
    expect(win).not.toMatch(/v2-blue|v2-red/)
  })

  it('가르는 것은 막대와 글자다 — 색은 남아 있다', () => {
    expect(tokens).toContain('--color-win: var(--v2-blue)')
    expect(tokens).toContain('--color-lose-bar: var(--v2-red)')
  })
})

describe('경기 상세 화면 — 지어내지 않는다', () => {
  const screen = read(
    '../../../../apps/web/app/league/[leagueSlug]/match/[matchId]/MatchDetailScreen.tsx',
  )
  const code = screen.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

  it('Cloud 표기는 공통 자리에서 온다 — 리그 API 를 안 본다', () => {
    expect(code).toContain('useSeasonLabel()')
    expect(code).not.toContain('season_type')
  })

  it('시즌을 모르면 리본 줄을 안 그린다', () => {
    expect(code).toContain('season?.toUpperCase() ?? null')
  })

  it('맵 이름이 없으면 설명을 안 그린다', () => {
    expect(code).toContain('detail.map?.name ?? undefined')
  })

  it('★라인업을 새로 만들지 않는다★ — 옛 `MatchCard` 를 펼친 채 세운다', () => {
    expect(code).toContain('<MatchCard')
    expect(code).toContain('defaultExpanded')
  })

  it('창 밖 경기는 왜 안 보이는지 말한다 — 「없다」로 끝내지 않는다', () => {
    expect(screen).toContain('Cloud 0(9/3 07:00 이후) 경기만 볼 수 있습니다.')
  })
})
