import { describe, expect, it } from 'vitest'
import { BETA_SEASON_NUMBER, SEASON_BASELINE, seasonLabel } from '../season'
import { LEGACY_PLAYER_PREFIX, legacyPlayerKey } from '../legacyImport'

/**
 * 시즌 격리 규칙 (Phase 11-C).
 *
 * 여기서 지키는 것은 **DB에 붙지 않고도 깨지면 바로 알 수 있는 규칙**들이다.
 * 실제 DB 동작(종료 시 카드 저장 · 시작 시 누적 0)은 오프라인 스모크가 숫자로 대조한다.
 */

describe('베타 시즌 번호 (D-098)', () => {
  it('베타는 정식 번호를 소모하지 않는다 — Season 7 다음은 그대로 8이다', () => {
    expect(BETA_SEASON_NUMBER).toBe(0)
    // 다음 번호는 max(number)+1로 뽑는다. 베타가 0이므로 7 다음은 8이 된다
    const numbers = [1, 2, 3, 4, 5, 6, 7, BETA_SEASON_NUMBER]
    expect(Math.max(...numbers) + 1).toBe(8)
  })

  it('베타를 사용자에게 "Season 0"이라고 보여 주지 않는다', () => {
    expect(seasonLabel({ number: 0, seasonType: 'beta' })).toBe('Beta Season')
    expect(seasonLabel({ number: 0, seasonType: 'beta' })).not.toContain('0')
  })

  /* 원본 지난시즌 카드 관측(2026-08-28)이 `시즌 6` 이었다. `Season N` 은 관측 전 추정이었다 (D-159) */
  it('정식·과거 시즌은 원본 표기 `시즌 N` 을 쓴다', () => {
    expect(seasonLabel({ number: 7, seasonType: 'legacy' })).toBe('시즌 7')
    expect(seasonLabel({ number: 8, seasonType: 'official' })).toBe('시즌 8')
  })
})

describe('Season 8 출발점 (정책 4)', () => {
  it('개인·클랜 모두 코드가 가진 baseline에서 시작한다', () => {
    expect(SEASON_BASELINE).toBe(1500)
  })
})

describe('과거 기록 선수 식별 (D-100)', () => {
  it('닉네임이 아니라 3rd.supply playerId로 키를 만든다', () => {
    expect(legacyPlayerKey('587873689')).toBe('SUPPLY-587873689')
    expect(legacyPlayerKey('587873689').startsWith(LEGACY_PLAYER_PREFIX)).toBe(true)
  })

  it('과거 선수 키는 mock·실수집 선수와 섞이지 않는다', () => {
    // mock 픽스처는 숫자 문자열, 실수집 E2E는 `E2E-` 접두사를 쓴다
    expect(legacyPlayerKey('500013135').startsWith(LEGACY_PLAYER_PREFIX)).toBe(true)
    expect(legacyPlayerKey('500013135')).not.toBe('500013135')
  })

  it('닉네임이 같아도 legacy id가 다르면 다른 사람이다', () => {
    expect(legacyPlayerKey('111')).not.toBe(legacyPlayerKey('222'))
  })
})
