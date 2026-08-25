/**
 * 공식 등록 클랜 마크 정책 (D-146).
 *
 * 여기서 고정하는 것은 하나다 —
 * **SACLOUD 공식 1/2부 등록 클랜만 실제 클랜마크를 쓴다.**
 * 외부·미등록 클랜의 emblem 을 우리 화면에 그리면 그 클랜이 등록된 것처럼 보인다.
 *
 * 판정은 `Clan.sourceClanId` 하나로 한다 — 3rd.supply 공식 레지스트리에서 이관된
 * 44개만 이 값을 가진다. 이름·slug 문자열로 추측하면 비슷한 이름의 외부 클랜이
 * 공식으로 잘못 올라간다.
 */
import { describe, expect, it } from 'vitest'
import { isOfficialLeagueClan, toClanSummary } from '../lib/server/mappers'

const REAL_MARK = {
  markBgUrl: 'https://static.3rd.supply/marks/bg.png',
  markFrontUrl: 'https://static.3rd.supply/marks/front.png',
}

describe('공식 등록 클랜 판정', () => {
  it('sourceClanId 가 있으면 공식이다', () => {
    expect(isOfficialLeagueClan({ sourceClanId: 'supply-123' })).toBe(true)
  })

  it('sourceClanId 가 없으면 공식이 아니다', () => {
    expect(isOfficialLeagueClan({ sourceClanId: null })).toBe(false)
    expect(isOfficialLeagueClan({ sourceClanId: undefined })).toBe(false)
  })

  it('개발용 real- 접두 클랜도 공식이 아니다', () => {
    // 리그에는 들어 있지만 공식 레지스트리에서 온 것이 아니다
    expect(isOfficialLeagueClan({ sourceClanId: null })).toBe(false)
  })
})

describe('마크 노출', () => {
  it('공식 등록 클랜은 실제 마크를 그대로 내보낸다', () => {
    const summary = toClanSummary({
      id: 'c1',
      slug: 'official-clan',
      name: '공식클랜',
      sourceClanId: 'supply-1',
      ...REAL_MARK,
    })
    expect(summary.is_official_clan).toBe(true)
    expect(summary.mark.bg).toBe(REAL_MARK.markBgUrl)
    expect(summary.mark.front).toBe(REAL_MARK.markFrontUrl)
  })

  it('외부/미등록 클랜은 실제 마크를 내보내지 않는다 — 화면이 fallback 을 그린다', () => {
    const summary = toClanSummary({
      id: 'c2',
      slug: 'outside-clan',
      name: 'snowball',
      sourceClanId: null,
      ...REAL_MARK,
    })
    expect(summary.is_official_clan).toBe(false)
    expect(summary.mark.bg).toBeNull()
    expect(summary.mark.front).toBeNull()
  })

  it('이름은 지우지 않는다 — raw 소속 데이터는 보존한다', () => {
    const summary = toClanSummary({
      id: 'c3',
      slug: 'outside-clan',
      name: 'snowball',
      sourceClanId: null,
      ...REAL_MARK,
    })
    expect(summary.name).toBe('snowball')
    expect(summary.slug).toBe('outside-clan')
  })

  it('마크를 설정하지 않은 공식 클랜도 fallback 으로 떨어진다 (깨진 이미지보다 낫다)', () => {
    const summary = toClanSummary({
      id: 'c4',
      slug: 'no-mark',
      name: '마크없음',
      sourceClanId: 'supply-2',
      markBgUrl: null,
      markFrontUrl: null,
    })
    expect(summary.is_official_clan).toBe(true)
    expect(summary.mark.bg).toBeNull()
  })
})
