/**
 * ★★Part 10 ④ — 홈 이식★★ (2026-09-07)
 *
 * 여기서 못 박는 것
 *   1. ★옮긴 화면에만★ `.sac-v2` 가 붙는다 (`isV2Route`)
 *   2. 「다리」가 옛 토큰을 v2 값으로 바꾼다 — ★조각 코드는 안 고쳤다★
 *   3. 로고의 `.my` 는 리그색을 안 따라간다 (`.v2-brand`)
 *   4. 검색창 기본 폭은 ★옛 값 560★ 그대로다 (홈만 720 을 넘긴다)
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isV2Route } from '../v2/migrated'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('옮긴 화면에만 v2 를 두른다', () => {
  it('홈은 옮겼다', () => {
    expect(isV2Route('/')).toBe(true)
  })

  /* ⚠ 화면을 하나 옮길 때마다 이 목록에서 한 줄이 빠진다.
        개인 랭킹은 ⑤(2026-09-07)에서 빠졌다 — `v2-rank.test.ts` 가 대신 지킨다 */
  it('★아직 안 옮긴 화면은 그대로다★', () => {
    for (const path of [
      '/league/supply/rank/clan',
      '/league/supply/player/abc',
      '/league/supply/clan/abc',
      '/league/supply/match',
      '/rank',
      '/me',
      '/leagues',
      '/board',
    ]) {
      expect(isV2Route(path)).toBe(false)
    }
  })
})

describe('다리 — 옛 토큰을 v2 값으로', () => {
  const tokens = read('../v2/tokens.css')

  it('`.sac-v2` 안에서만 바꾼다 — 바깥 `:root` 는 안 건드린다', () => {
    /* 파일 전체에 `:root {` 로 시작하는 블록이 없어야 한다 */
    expect(tokens).not.toMatch(/^\s*:root\s*\{/m)
    expect(tokens).toContain('.sac-v2 {')
  })

  it('바탕·선·글자·강조가 전부 v2 를 가리킨다', () => {
    expect(tokens).toContain('--color-page: var(--v2-bg)')
    expect(tokens).toContain('--color-line: var(--v2-card-border)')
    expect(tokens).toContain('--color-text-strong: var(--v2-text-strong)')
    expect(tokens).toContain('--color-accent: var(--v2-accent)')
  })

  it('★여백·크기 토큰은 안 바꾼다★ — 색만 바꾼다', () => {
    const bridge = tokens.slice(tokens.lastIndexOf('④단계'))
    expect(bridge).not.toContain('--layout-max')
    expect(bridge).not.toContain('--section-gap')
    expect(bridge).not.toContain('--spacing-')
  })

  it('로고의 `.my` 는 리그색을 안 따라간다', () => {
    expect(tokens).toContain('.sac-v2 .v2-brand')
    expect(tokens).toMatch(/\.v2-brand\s*\{\s*--color-accent:\s*var\(--v2-red\)/)
  })
})

describe('검색창 — 옛 기본값을 지키고 홈만 넓힌다', () => {
  const bar = read('../home/SearchBar.tsx')

  it('기본 폭은 560 (옛 값)', () => {
    expect(bar).toContain('maxWidth = 560')
  })

  it('빛(sweep)은 기본이 꺼짐 — 안 넘기면 지금까지와 같다', () => {
    expect(bar).toContain('sweep = false')
  })

  it('★동작은 안 건드렸다★ — 제출·후보·안내 문구가 그대로 있다', () => {
    expect(bar).toContain('onSubmit')
    expect(bar).toContain('role="listbox"')
    expect(bar).toContain('CLAN_SEARCH_HINT')
  })
})
