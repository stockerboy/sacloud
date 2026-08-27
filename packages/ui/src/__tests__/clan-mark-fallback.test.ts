/**
 * 클랜마크 fallback 정책 (D-146).
 *
 * 여기서 고정하는 것은 하나다 —
 * **SACLOUD 공식 1/2부 등록 클랜만 실제 클랜마크를 쓴다. 그 외는 전부 fallback 이다.**
 *
 * 운영에서 미등록 소속 선수 닉네임 옆에 마크가 아예 붙지 않았다.
 * 호출부가 각자 `클랜이 있으면 그린다`로 판단하고 있어서, 클랜을 모르는 선수는
 * 조건에서 조용히 빠졌기 때문이다. 판정을 순수 함수 하나로 모으고 여기서 고정한다.
 */
import { describe, expect, it } from 'vitest'
import {
  clanMarkView,
  clanMarkViewFromMarkOnly,
  type ClanMarkInput,
} from '../common/clanMarkPolicy'

/** 실제로 마크 URL 이 살아 있는 상태. 외부 클랜도 이 값을 들고 올 수 있다 */
const REAL_MARK = {
  bg: 'https://static.3rd.supply/marks/bg.png',
  front: 'https://static.3rd.supply/marks/front.png',
}

const EMPTY_MARK = { bg: null, front: null }

describe('공식 등록 클랜 — 실제 마크를 쓴다', () => {
  it('1부 등록 클랜은 실제 마크를 그대로 쓴다', () => {
    const view = clanMarkView({ is_official_clan: true, mark: REAL_MARK })
    expect(view).toEqual({ kind: 'official', bg: REAL_MARK.bg, front: REAL_MARK.front })
  })

  it('2부 등록 클랜도 같다 — 부리그는 판정에 들어가지 않는다', () => {
    // 부리그(division)는 마크 정책과 무관하다. 등록 여부 하나로 가른다
    const view = clanMarkView({ is_official_clan: true, mark: REAL_MARK })
    expect(view.kind).toBe('official')
  })

  it('전경만 있는 클랜도 실제 마크다 — 두 레이어 중 하나만 설정할 수 있다', () => {
    const view = clanMarkView({ is_official_clan: true, mark: { bg: null, front: REAL_MARK.front } })
    expect(view).toEqual({ kind: 'official', bg: null, front: REAL_MARK.front })
  })
})

describe('외부 클랜 — 마크 URL 이 있어도 쓰지 않는다', () => {
  it('is_official_clan=false 면 마크 URL 이 살아 있어도 fallback 이다', () => {
    // 서버가 마크를 지우지 못한 경로가 하나라도 생기면 외부 emblem 이 그대로 나간다.
    // 화면에서 한 번 더 막는다
    const view = clanMarkView({ is_official_clan: false, mark: REAL_MARK })
    expect(view).toEqual({ kind: 'fallback' })
  })

  it('서버가 마크를 지워 보낸 외부 클랜도 물론 fallback 이다', () => {
    expect(clanMarkView({ is_official_clan: false, mark: EMPTY_MARK })).toEqual({
      kind: 'fallback',
    })
  })
})

describe('무소속 · 소속을 모르는 선수', () => {
  it('클랜이 null 이면 fallback 이다 — 아무것도 그리지 않는 것이 아니다', () => {
    expect(clanMarkView(null)).toEqual({ kind: 'fallback' })
  })

  it('클랜이 undefined 여도 fallback 이다', () => {
    expect(clanMarkView(undefined)).toEqual({ kind: 'fallback' })
  })
})

describe('마크가 없는 등록 클랜', () => {
  it('두 레이어가 모두 null 이면 fallback 이다 — 깨진 이미지보다 낫다', () => {
    expect(clanMarkView({ is_official_clan: true, mark: EMPTY_MARK })).toEqual({
      kind: 'fallback',
    })
  })

  it('mark 자체가 없어도 fallback 이다', () => {
    expect(clanMarkView({ is_official_clan: true })).toEqual({ kind: 'fallback' })
    expect(clanMarkView({ is_official_clan: true, mark: null })).toEqual({ kind: 'fallback' })
  })
})

describe('불확실하면 안전한 쪽으로 실패한다', () => {
  it('is_official_clan 이 없으면 공식으로 보지 않는다', () => {
    // 계약을 거치면 `.default(false)` 로 항상 boolean 이지만,
    // 파싱하지 않은 raw 값이 들어오는 경로가 실제로 있었다
    expect(clanMarkView({ mark: REAL_MARK })).toEqual({ kind: 'fallback' })
  })

  it('is_official_clan 이 null 이어도 공식으로 보지 않는다', () => {
    expect(clanMarkView({ is_official_clan: null, mark: REAL_MARK })).toEqual({ kind: 'fallback' })
  })

  it('truthy 한 값이라고 공식으로 올려 주지 않는다 — true 하나만 공식이다', () => {
    // 문자열 "false" 같은 값이 truthy 로 통과해 외부 클랜이 공식이 되는 것을 막는다
    const suspicious = { is_official_clan: 'false', mark: REAL_MARK } as unknown as ClanMarkInput
    expect(clanMarkView(suspicious)).toEqual({ kind: 'fallback' })
  })
})

describe('마크만 아는 예전 호출부', () => {
  it('서버가 이미 지운 마크는 fallback 으로 떨어진다', () => {
    expect(clanMarkViewFromMarkOnly(EMPTY_MARK)).toEqual({ kind: 'fallback' })
    expect(clanMarkViewFromMarkOnly(null)).toEqual({ kind: 'fallback' })
    expect(clanMarkViewFromMarkOnly(undefined)).toEqual({ kind: 'fallback' })
  })

  it('마크가 남아 있으면 그린다 — 서버가 걸렀다는 전제에서만 옳다', () => {
    expect(clanMarkViewFromMarkOnly(REAL_MARK)).toEqual({
      kind: 'official',
      bg: REAL_MARK.bg,
      front: REAL_MARK.front,
    })
  })
})
