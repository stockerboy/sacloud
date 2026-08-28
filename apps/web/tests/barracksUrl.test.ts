/**
 * 병영수첩 주소 파서 (D-162).
 *
 * 여기서 고정하는 것은 **주소에서 무엇을 뽑는가**뿐이다. 그 값이 실제로 우리 DB 에
 * 있는지는 조회 쪽 일이라 여기서 보지 않는다.
 *
 * 선수 주소의 정확한 경로 형식은 **[미확인]** 이라 한 형식만 통과시키지 않는다.
 * 그래서 테스트도 "이 형식만 된다" 가 아니라 "이런 것들에서 후보를 뽑는다" 를 고정한다.
 */
import { describe, expect, it } from 'vitest'
import { isBarracksUrl, playerRefsFromBarracksUrl } from '@sacloud/contract'

describe('병영수첩 주소인가', () => {
  it('병영수첩·넥슨 주소를 알아본다', () => {
    expect(isBarracksUrl('https://barracks.sa.nexon.com/record/huwho')).toBe(true)
    /* 스킴 없이 붙여 넣는 사람이 많다 */
    expect(isBarracksUrl('barracks.sa.nexon.com/record/huwho')).toBe(true)
    expect(isBarracksUrl('https://sa.nexon.com/profile/huwho')).toBe(true)
  })

  it('주소가 아니면 아니라고 한다 — 그때는 평소대로 닉네임 검색을 한다', () => {
    expect(isBarracksUrl('huwho')).toBe(false)
    expect(isBarracksUrl('')).toBe(false)
    expect(isBarracksUrl('   ')).toBe(false)
    /* 넥슨이 아닌 곳은 받지 않는다 */
    expect(isBarracksUrl('https://example.com/record/huwho')).toBe(false)
  })
})

describe('주소에서 선수 후보 뽑기', () => {
  it('경로 끝의 닉네임을 뽑는다', () => {
    expect(playerRefsFromBarracksUrl('https://barracks.sa.nexon.com/record/huwho')).toEqual([
      { kind: 'nickname', value: 'huwho' },
    ])
  })

  it('한글 닉네임의 퍼센트 인코딩을 푼다', () => {
    const refs = playerRefsFromBarracksUrl('https://barracks.sa.nexon.com/record/%EA%B0%90%EC%A0%A4')
    expect(refs).toEqual([{ kind: 'nickname', value: '감젤' }])
  })

  it('계정 번호(ouid)는 닉네임보다 먼저 시도한다 — 그게 사람의 확정 키다', () => {
    const refs = playerRefsFromBarracksUrl(
      'https://barracks.sa.nexon.com/record/huwho?ouid=0123456789abcdef0123456789abcdef',
    )
    expect(refs[0]).toEqual({ kind: 'ouid', value: '0123456789abcdef0123456789abcdef' })
    expect(refs).toContainEqual({ kind: 'nickname', value: 'huwho' })
  })

  it('화면 이름 같은 경로 조각은 후보로 보지 않는다', () => {
    const refs = playerRefsFromBarracksUrl('https://barracks.sa.nexon.com/ko/user/profile/huwho')
    expect(refs).toEqual([{ kind: 'nickname', value: 'huwho' }])
  })

  it('경로 형식이 달라도 후보를 뽑는다 — 한 형식만 받지 않는다 [미확인]', () => {
    /* 실제 경로가 무엇인지 관측하지 못했다. 어떤 모양이 와도 닉네임 자리를 잡아야 한다 */
    for (const url of [
      'https://barracks.sa.nexon.com/user/huwho',
      'https://barracks.sa.nexon.com/players/huwho/match',
      'https://barracks.sa.nexon.com/#/record/huwho',
    ]) {
      expect(playerRefsFromBarracksUrl(url)).toContainEqual({ kind: 'nickname', value: 'huwho' })
    }
  })

  it('클랜 주소를 넣으면 클랜 slug 가 후보로 나온다 — 선수로는 못 찾고 끝난다', () => {
    /* 클랜 조회는 `clanSlugFromBarracksUrl` 이 따로 맡는다. 여기서는 그냥 안 맞으면 그만이다 */
    const refs = playerRefsFromBarracksUrl('https://barracks.sa.nexon.com/clan/ddorr/clanMatch')
    expect(refs).toEqual([{ kind: 'nickname', value: 'ddorr' }])
  })

  it('주소가 아니면 빈 배열이다', () => {
    expect(playerRefsFromBarracksUrl('huwho')).toEqual([])
    expect(playerRefsFromBarracksUrl('https://example.com/record/huwho')).toEqual([])
  })
})
