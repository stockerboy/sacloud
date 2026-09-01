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
import {
  barracksUsnOf,
  clanSlugFromBarracksUrl,
  isBarracksUrl,
  normalizePastedQuery,
  playerRefsFromBarracksUrl,
} from '@sacloud/contract'

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

/* ══════════════════════════════════════════════════════════════════════════
 * D-254 — 실제 선수 프로필 주소는 `/{str_usn}/match` 다
 *
 * 근거는 지어낸 것이 아니라 저장소 안의 실물이다.
 *   · `docs/session-ledger/04c10ca2.md` — 사용자가 붙여 준 주소 23개
 *   · `docs/DECISIONS.md` D-221        — `str_usn D9EBC75CCBD60C12SA = sn 470379822`
 *   · `data/barracks/position-labels.json` — "barracksId 는 주소 조각(16진+SA)"
 * ══════════════════════════════════════════════════════════════════════════ */

describe('선수 프로필 주소 (D-254)', () => {
  /** 사용자가 실제로 붙여 준 주소들. 값을 바꾸지 마라 — 관측된 실물이다 */
  const REAL = [
    ['https://barracks.sa.nexon.com/D9EBC75CCBD60C12SA/match', 'D9EBC75CCBD60C12SA'],
    ['https://barracks.sa.nexon.com/BE60BA2EA16C2A94SA/match', 'BE60BA2EA16C2A94SA'],
    ['https://barracks.sa.nexon.com/02773269A8CAF900SA/match', '02773269A8CAF900SA'],
    ['https://barracks.sa.nexon.com/3F6FDE57149B54E6SA/match', '3F6FDE57149B54E6SA'],
  ] as const

  it('계정 번호를 닉네임이 아니라 `usn` 으로 알아본다', () => {
    for (const [url, usn] of REAL) {
      expect(playerRefsFromBarracksUrl(url)).toEqual([{ kind: 'usn', value: usn }])
    }
  })

  it('`match` 는 화면 이름이라 후보가 아니다', () => {
    const refs = playerRefsFromBarracksUrl(REAL[0][0])
    expect(refs).not.toContainEqual({ kind: 'nickname', value: 'match' })
  })

  it('스킴이 없어도 같다 — 사람들은 주소창에서 잘라 붙인다', () => {
    expect(playerRefsFromBarracksUrl('barracks.sa.nexon.com/D9EBC75CCBD60C12SA/match')).toEqual([
      { kind: 'usn', value: 'D9EBC75CCBD60C12SA' },
    ])
  })

  it('확정 키가 먼저다 — ouid > usn > 닉네임', () => {
    const refs = playerRefsFromBarracksUrl(
      'https://barracks.sa.nexon.com/D9EBC75CCBD60C12SA/match?nickname=pom&ouid=0123456789abcdef0123456789abcdef',
    )
    expect(refs.map((r) => r.kind)).toEqual(['ouid', 'usn', 'nickname'])
  })

  it('닉네임 주소는 예전 그대로 동작한다 — D-162 를 깨지 않는다', () => {
    expect(playerRefsFromBarracksUrl('https://barracks.sa.nexon.com/record/huwho')).toEqual([
      { kind: 'nickname', value: 'huwho' },
    ])
  })
})

describe('계정 번호만 붙여 넣기 (D-254)', () => {
  it('16진 16자리 + SA 만 계정 번호로 본다', () => {
    expect(barracksUsnOf('D9EBC75CCBD60C12SA')).toBe('D9EBC75CCBD60C12SA')
    expect(barracksUsnOf('  D9EBC75CCBD60C12SA  ')).toBe('D9EBC75CCBD60C12SA')
    /* 소문자로 복사해 와도 같은 계정이다 */
    expect(barracksUsnOf('d9ebc75ccbd60c12sa')).toBe('D9EBC75CCBD60C12SA')
  })

  it('모양이 다르면 계정 번호가 아니다 — 그때는 평소대로 닉네임으로 찾는다', () => {
    expect(barracksUsnOf('huwho')).toBeNull()
    expect(barracksUsnOf('D9EBC75CCBD60C12')).toBeNull() // SA 가 없다
    expect(barracksUsnOf('D9EBC75CCBD60C1SA')).toBeNull() // 15자리
    expect(barracksUsnOf('Z9EBC75CCBD60C12SA')).toBeNull() // 16진이 아니다
    expect(barracksUsnOf('470379822')).toBeNull() // 숫자 계정 번호는 [미확인] — 받지 않는다
  })
})

describe('클랜 주소 (D-254)', () => {
  it('관측된 두 형태에서 slug 를 뽑는다', () => {
    expect(clanSlugFromBarracksUrl('https://barracks.sa.nexon.com/clan/veritas')).toBe('veritas')
    expect(clanSlugFromBarracksUrl('https://barracks.sa.nexon.com/clan/ddorr/clanMatch')).toBe(
      'ddorr',
    )
    expect(clanSlugFromBarracksUrl('barracks.sa.nexon.com/clan/zzim1')).toBe('zzim1')
  })

  it('퍼센트 인코딩을 푼다', () => {
    expect(clanSlugFromBarracksUrl('https://barracks.sa.nexon.com/clan/%EA%B0%90%EC%A0%A4')).toBe(
      '감젤',
    )
  })

  it('클랜 주소가 아니면 null 이다 — 넓히지 않는다', () => {
    expect(clanSlugFromBarracksUrl('veritas')).toBeNull()
    expect(clanSlugFromBarracksUrl('https://example.com/clan/veritas')).toBeNull()
    expect(clanSlugFromBarracksUrl('https://barracks.sa.nexon.com/D9EBC75CCBD60C12SA/match')).toBeNull()
  })
})

describe('붙여 넣은 검색어 다듬기 (D-254)', () => {
  it('앞뒤 공백을 턴다 — 이게 없으면 ` huwho ` 가 404 다 (운영 실측)', () => {
    expect(normalizePastedQuery(' huwho ')).toBe('huwho')
    expect(normalizePastedQuery('huwho\n')).toBe('huwho')
    expect(normalizePastedQuery('\u00A0huwho\u3000')).toBe('huwho')
  })

  it('폭 없는 문자를 지운다 — 화면에 안 보여서 원인을 알 수 없다', () => {
    expect(normalizePastedQuery('hu\u200Bwho')).toBe('huwho')
    expect(normalizePastedQuery('\uFEFFhuwho')).toBe('huwho')
  })

  it('가운데 공백은 **살린다** — 닉네임의 일부일 수 있다', () => {
    expect(normalizePastedQuery('  깜 지  ')).toBe('깜 지')
  })

  it('대소문자·전각은 건드리지 않는다 — 접었다 남이 걸리면 조용히 틀린다', () => {
    expect(normalizePastedQuery('HuWho')).toBe('HuWho')
    expect(normalizePastedQuery('ｈｕｗｈｏ')).toBe('ｈｕｗｈｏ')
  })

  it('전부 공백이면 빈 문자열이다', () => {
    expect(normalizePastedQuery('   ')).toBe('')
    expect(normalizePastedQuery('\u200B')).toBe('')
  })
})
