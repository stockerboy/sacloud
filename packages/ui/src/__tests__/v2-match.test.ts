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

  it('이긴 면과 진 면이 ★같은 중립색★ 이다', () => {
    expect(tokens).toContain('--color-win-bg: #0f1015')
    expect(tokens).toContain('--color-lose-bg: #0f1015')
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
