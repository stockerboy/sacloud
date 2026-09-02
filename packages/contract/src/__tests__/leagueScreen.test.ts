import { describe, expect, it } from 'vitest'
import {
  isLeagueListed,
  isOfficialLeague,
  leagueLandingPath,
  leagueScreen,
  showsDivision,
  showsTier,
} from '../leagueScreen'

/**
 * 닫힌 리그는 나열되는 화면에서 빠진다 (2026-09-02 사장님 지시 #22 · "대룰리그 뺴라").
 * 데이터·라우트는 그대로다 — 여기서 못 박는 것은 «목록에 보이는가» 하나다.
 */
describe('leagueScreen — 목록 노출 (#22)', () => {
  it('대룰리그(daerule)는 목록에 안 보인다', () => {
    expect(isLeagueListed('daerule')).toBe(false)
  })

  it('세 리그와 모르는 slug 는 보인다', () => {
    for (const slug of ['supply', 'nolink', 'sanply', 'some-new-league']) {
      expect(isLeagueListed(slug)).toBe(true)
    }
  })

  it('닫힌 리그도 직접 주소로는 열린다 — 랜딩 경로가 있다', () => {
    expect(leagueLandingPath('daerule')).toBe('/league/daerule/rank/clan')
  })
})

/**
 * 공식/비공식 **표기** (2026-09-02 사장님 정정 · 지시 #17).
 *
 * > "공식리그는 SPL과 IPL이다 열산만 비공식표시해라 잘못표기돼있다"
 *
 * 배지를 그리는 화면 전부가 이 값 하나를 본다. DB 의 `League.official` 열이나 계산용
 * `category` 와는 별개의 **표기용** 값이다 — 여기서 못 박아 둔다.
 */
describe('leagueScreen — 공식/비공식 표기 (#17)', () => {
  it('SPL · IPL 은 공식이다', () => {
    expect(isOfficialLeague('supply')).toBe(true)
    expect(isOfficialLeague('nolink')).toBe(true)
  })

  it('10mountain 만 비공식이다', () => {
    expect(isOfficialLeague('sanply')).toBe(false)
  })

  it('모르는 slug 는 기본값(공식)이다', () => {
    expect(isOfficialLeague('some-new-league')).toBe(true)
  })
})

/**
 * 리그별 화면 규칙 (`leagueScreen.ts`).
 *
 * 2026-09-02 지시 #9 — IPL 의 부리그(티어) 구분을 **화면에서만** 없앤다 (D-265 ③).
 * 규칙은 이 표 한 곳에 있고 화면은 `showsTier(slug)` 만 본다.
 * 여기서 값이 바뀌면 탭 · 티어 경계선 · `N티어` 표기 · 티어별 승률이 한꺼번에 바뀐다 —
 * 그래서 값 자체를 못 박아 둔다.
 */
/**
 * ⚠ 정정 (2026-09-02 · 지시 #23) — 같은 날 오전(#9 · D-265 ③)의 기대값은 정반대였다
 *   (nolink false · supply true). 사장님이 «티어는 IPL 만, SPL 은 등급 자체가 없다» 고 명확히 했다.
 */
describe('leagueScreen — 티어 표시 (#23)', () => {
  it('IPL(nolink) 만 티어를 화면에 표시한다', () => {
    expect(showsTier('nolink')).toBe(true)
    expect(leagueScreen('nolink').showsTier).toBe(true)
  })

  it('SPL(supply) 은 등급 개념이 없다 — 표시하지 않는다', () => {
    expect(showsTier('supply')).toBe(false)
  })

  it('10mountain(sanply) 도 단일리그 — 표시하지 않는다', () => {
    expect(showsTier('sanply')).toBe(false)
  })

  it('모르는 slug 는 기본값 — 티어 없이 그린다', () => {
    expect(showsTier('some-new-league')).toBe(false)
  })

  it('옛 이름 showsDivision 은 같은 값을 준다 (별칭)', () => {
    expect(showsDivision('nolink')).toBe(true)
    expect(showsDivision('supply')).toBe(false)
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
