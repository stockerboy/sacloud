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

/**
 * 저장된 마크 주소. **D-227 이후로 이 값은 「그대로 나가지」 않는다** —
 * `toClanSummary` 가 넥슨 원본 주소로 되돌려 내보낸다.
 *
 * 예전에는 `marks/bg.png` 처럼 지어낸 이름을 썼는데, 그러면 변환 규칙을 통과하지 못해
 * 이 시험이 무엇을 지키는지 알 수 없게 된다. **로컬 DB 실측값**으로 바꿨다.
 */
const REAL_MARK = {
  markBgUrl: 'https://static.3rd.supply/marks/NTEvMF8xMl8wODM.png',
  markFrontUrl: 'https://static.3rd.supply/marks/NTEvMV8yM18xODc.png',
}

/** 위 주소를 되돌린 값 (D-227) */
const NEXON_MARK = {
  bg: 'https://img.sa.nexon.com/sa/clan/mark/51/0_12_083.png',
  front: 'https://img.sa.nexon.com/sa/clan/mark/51/1_23_187.png',
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
  it('공식 등록 클랜은 마크를 내보낸다 — 주소는 넥슨으로 되돌린다 (D-227)', () => {
    const summary = toClanSummary({
      id: 'c1',
      slug: 'official-clan',
      name: '공식클랜',
      sourceClanId: 'supply-1',
      ...REAL_MARK,
    })
    expect(summary.is_official_clan).toBe(true)
    expect(summary.mark.bg).toBe(NEXON_MARK.bg)
    expect(summary.mark.front).toBe(NEXON_MARK.front)
    // 원본 사이트 주소가 화면으로 새 나가지 않는다. 그 사이트가 죽어도 마크가 산다
    expect(summary.mark.bg).not.toContain('3rd.supply')
    expect(summary.mark.front).not.toContain('3rd.supply')
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
