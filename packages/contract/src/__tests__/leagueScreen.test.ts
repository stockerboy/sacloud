import { describe, expect, it } from 'vitest'
import { leagueLandingPath, leagueScreen, showsDivision } from '../leagueScreen'

/**
 * 리그별 화면 규칙 (`leagueScreen.ts`).
 *
 * 2026-09-02 지시 #9 — IPL 의 부리그(티어) 구분을 **화면에서만** 없앤다 (D-265 ③).
 * 규칙은 이 표 한 곳에 있고 화면은 `showsDivision(slug)` 만 본다.
 * 여기서 값이 바뀌면 탭 · 티어 경계선 · `N티어` 표기 · 티어별 승률이 한꺼번에 바뀐다 —
 * 그래서 값 자체를 못 박아 둔다.
 */
describe('leagueScreen — 부리그 표시', () => {
  it('IPL(nolink) 은 부리그를 화면에 표시하지 않는다 (D-265 ③)', () => {
    expect(showsDivision('nolink')).toBe(false)
    expect(leagueScreen('nolink').showsDivision).toBe(false)
  })

  it('SPL(supply) 은 그대로 표시한다', () => {
    expect(showsDivision('supply')).toBe(true)
  })

  it('모르는 slug 는 «래더 있는 리그» 기본값 — 표시한다', () => {
    expect(showsDivision('some-new-league')).toBe(true)
  })

  it('IPL 은 데이터·라우트가 그대로다 — 클랜랭킹 화면 자체는 남는다', () => {
    /* 화면에서 감추는 것은 부리그 표기뿐이다. 클랜랭킹으로 가는 길은 그대로여야 한다 */
    expect(leagueScreen('nolink').clanRank).toBe(true)
    expect(leagueLandingPath('nolink')).toBe('/league/nolink/rank/clan')
  })
})

describe('leagueScreen — 기존 규칙이 흔들리지 않는다', () => {
  it('10mountain(sanply) 은 래더도 순위도 클랜랭킹도 없다 (D-245)', () => {
    const spec = leagueScreen('sanply')
    expect(spec.clanRank).toBe(false)
    expect(spec.playerColumns).toEqual({ rank: false, winRate: true, kd: true, rating: false })
    expect(leagueLandingPath('sanply')).toBe('/league/sanply/rank/player')
  })

  it('SPL 은 다섯 칸 그대로다', () => {
    expect(leagueScreen('supply').playerColumns).toEqual({
      rank: true,
      winRate: true,
      kd: true,
      rating: true,
    })
  })
})
