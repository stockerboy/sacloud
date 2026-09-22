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

const tokensCss = read('../v2/tokens.css')

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

/*
 * ★★2026-09-22 밤 — 면을 다시 칠한다★★ (사장님: 「모든 카드 디자인, 색 전부
 *   서플라이랑 똑같이 한다는거 꼭 명심하고」).
 *
 *   위 「같은 중립색」 은 `적진`/sleeper ★시안★ 의 규칙이었다. 그런데
 *   서플라이를 ★찍어 보니 면을 칠한다★ — 이긴 판 하늘 #e0f2fe · 진 판 분홍 #fee2e2
 *   (`docs/SUPPLY_MEASURED.md` §4). 지시가 시안보다 위라 ★마지막 층★ 인
 *   `supply-skin.css` 가 그 값을 다시 씬운다.
 *
 *   ★위 시험을 지우지 않았다.★ `tokens.css` 는 여전히 「둘이 같은 중립색」 이고,
 *   껅데기를 벗기면(`globals.css` 의 @import 한 줄) 그 판이 그대로 돌아온다.
 */
describe('껅데기가 마지막에 면을 칠한다 (서플라이)', () => {
  const skin = read('../v2/supply-skin.css')

  it('★이긴 면은 하늘 · 진 면은 분홍★ — 서플라이를 재서 적은 값이다', () => {
    expect(skin).toContain('--color-win-bg: #e0f2fe')
    expect(skin).toContain('--color-win-line: #bae6fd')
    expect(skin).toContain('--color-lose-bg: #fee2e2')
    expect(skin).toContain('--color-lose-line: #fecaca')
  })

  it('★칠하는 일은 껅데기가 한다★ — `tokens.css` 는 그대로 중립이다', () => {
    /* 이 줄이 깨지면 「옛 판을 고쳤다」 는 뜻이다 — 되돌리기가 막힌다 */
    expect(tokensCss).toContain('--color-win-bg: var(--v2-panel)')
    expect(tokensCss).toContain('--color-lose-bg: var(--v2-panel)')
  })
})
