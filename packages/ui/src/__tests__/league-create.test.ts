import { describe, expect, it } from 'vitest'
import {
  LEAGUE_AGREEMENTS,
  validateLeagueDraft,
  validateLeagueName,
  validateLeagueSlug,
} from '../league/leagueCreate'

/**
 * 리그 만들기 폼 제약 — 원본 관측 규칙을 경계값까지 고정한다.
 * 출처: docs/3rd-supply-structure.md 6장.
 */

describe('validateLeagueName — 한글/영어/숫자 2~8자, "리그"로 끝날 수 없음', () => {
  it('경계값', () => {
    expect(validateLeagueName('가')).not.toBeNull()
    expect(validateLeagueName('가나')).toBeNull()
    expect(validateLeagueName('12345678')).toBeNull()
    expect(validateLeagueName('123456789')).not.toBeNull()
  })

  it('허용 문자', () => {
    expect(validateLeagueName('공식전')).toBeNull()
    expect(validateLeagueName('Cup2026')).toBeNull()
    expect(validateLeagueName('공식 전')).not.toBeNull()
    expect(validateLeagueName('공식-전')).not.toBeNull()
    expect(validateLeagueName('공식!')).not.toBeNull()
  })

  it('"리그"로 끝나면 안 된다', () => {
    expect(validateLeagueName('공식리그')).not.toBeNull()
    expect(validateLeagueName('리그공식')).toBeNull()
  })
})

describe('validateLeagueSlug — 영숫자 4~16자', () => {
  it('경계값', () => {
    expect(validateLeagueSlug('abc')).not.toBeNull()
    expect(validateLeagueSlug('abcd')).toBeNull()
    expect(validateLeagueSlug('a'.repeat(16))).toBeNull()
    expect(validateLeagueSlug('a'.repeat(17))).not.toBeNull()
  })

  it('영문과 숫자만', () => {
    expect(validateLeagueSlug('league2026')).toBeNull()
    expect(validateLeagueSlug('league-2026')).not.toBeNull()
    expect(validateLeagueSlug('리그2026')).not.toBeNull()
  })
})

describe('validateLeagueDraft', () => {
  const base = {
    name: '공식전',
    slug: 'officialmain',
    divisionCount: 1,
    mapIds: ['m1'],
    playerLimits: [5],
    agreements: LEAGUE_AGREEMENTS.map(() => true),
  }

  it('모두 채우면 통과', () => {
    expect(validateLeagueDraft(base)).toBeNull()
  })

  it('리그맵은 최소 1개', () => {
    expect(validateLeagueDraft({ ...base, mapIds: [] })).not.toBeNull()
  })

  it('대전인원은 최소 1개', () => {
    expect(validateLeagueDraft({ ...base, playerLimits: [] })).not.toBeNull()
  })

  it('동의 3항목을 모두 체크해야 한다', () => {
    expect(validateLeagueDraft({ ...base, agreements: [true, true, false] })).not.toBeNull()
    expect(validateLeagueDraft({ ...base, agreements: [true, true] })).not.toBeNull()
  })

  it('동의 항목은 3개다 (원본 관측)', () => {
    expect(LEAGUE_AGREEMENTS).toHaveLength(3)
  })
})
