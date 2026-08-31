/**
 * `static.3rd.supply` 마크 주소 → 넥슨 주소 복원.
 *
 * 여기서 고정하는 것은 둘이다.
 *
 * ```
 * ① 풀리는 것은 넥슨 주소로 정확히 복원된다
 * ② 풀리지 않는 것은 **원본 문자열이 아니라 null 이다**
 * ```
 *
 * ②가 이 시험의 진짜 목적이다. 반쯤 바뀐 주소가 DB 에 들어가면 무엇이 변환됐고
 * 무엇이 안 됐는지 나중에 가릴 수 없다.
 *
 * 아래 값들은 **지어낸 것이 아니라 로컬 DB 실측값**이다 (2026-09-01).
 * `curl` 로 양쪽 주소를 대조해 같은 그림(바이트 수 동일)임을 확인했다.
 */
import { describe, expect, it } from 'vitest'
import { restoreClanMark, restoreClanMarkUrl, supplyMarkUrlToNexon } from '../clanMarkUrl'

/** 로컬 DB 실측값 한 쌍. 아래 표와 개별 시험이 같은 값을 쓰도록 이름을 붙여 둔다 */
const BG_SUPPLY = 'https://static.3rd.supply/marks/NTEvMF8xMl8wODM.png'
const BG_NEXON = 'https://img.sa.nexon.com/sa/clan/mark/51/0_12_083.png'
const FRONT_SUPPLY = 'https://static.3rd.supply/marks/NTEvMV8yM18xODc.png'
const FRONT_NEXON = 'https://img.sa.nexon.com/sa/clan/mark/51/1_23_187.png'

/** 로컬 DB 실측 쌍. 왼쪽이 지금 저장된 값, 오른쪽이 되돌린 값 */
const REAL_PAIRS: ReadonlyArray<readonly [string, string]> = [
  [BG_SUPPLY, BG_NEXON],
  [FRONT_SUPPLY, FRONT_NEXON],
  [
    // 운영 응답 `/api/clans/search/e2stro` 에서 그대로 가져온 값
    'https://static.3rd.supply/marks/NTEvMF8xMl8wNTE.png',
    'https://img.sa.nexon.com/sa/clan/mark/51/0_12_051.png',
  ],
  [
    'https://static.3rd.supply/marks/NTEvMV8yMl8xMDQ.png',
    'https://img.sa.nexon.com/sa/clan/mark/51/1_22_104.png',
  ],
]

describe('넥슨 주소로 복원한다', () => {
  it.each(REAL_PAIRS)('%s → %s', (supply, nexon) => {
    expect(supplyMarkUrlToNexon(supply)).toBe(nexon)
  })

  it('마지막 칸이 네 자리인 것도 복원한다', () => {
    // 로컬 DB 에 실제로 있다 (`51/1_24_1030`). 세 자리로 못 박으면 이것들이 조용히 사라진다
    expect(supplyMarkUrlToNexon('https://static.3rd.supply/marks/NTEvMV8yNF8xMDMw.png')).toBe(
      'https://img.sa.nexon.com/sa/clan/mark/51/1_24_1030.png',
    )
  })

  it('디렉터리 번호를 `51` 로 못 박지 않는다', () => {
    // 지금 DB 는 전부 51 이지만 서버군 번호로 보인다. 새 번호가 나와도 조용히 사라지면 안 된다
    // `52/0_12_083` 을 base64url 로 감싼 값
    const encoded = Buffer.from('52/0_12_083').toString('base64url')
    expect(supplyMarkUrlToNexon(`https://static.3rd.supply/marks/${encoded}.png`)).toBe(
      'https://img.sa.nexon.com/sa/clan/mark/52/0_12_083.png',
    )
  })
})

describe('두 번 변환해도 같다 — 멱등', () => {
  it('이미 넥슨 주소면 그대로 둔다', () => {
    const nexon = 'https://img.sa.nexon.com/sa/clan/mark/51/0_12_083.png'
    expect(supplyMarkUrlToNexon(nexon)).toBe(nexon)
  })

  it('변환한 값을 다시 변환해도 같은 값이다', () => {
    // 치환 스크립트를 두 번 돌려도 안전해야 한다
    const once = supplyMarkUrlToNexon(BG_SUPPLY)
    expect(supplyMarkUrlToNexon(once)).toBe(once)
  })
})

describe('확실하지 않으면 null 이다 — 원본 문자열을 돌려주지 않는다', () => {
  it('원본 사이트의 대체이미지는 「마크 없음」이다', () => {
    // default.png 는 주소가 아니라 "이 클랜은 마크가 없다"는 뜻이다.
    // 남의 대체이미지를 우리 화면에 띄우는 대신 우리가 그린 구름(FallbackClanMark)이 나오게 한다
    expect(supplyMarkUrlToNexon('https://static.3rd.supply/marks/default.png')).toBeNull()
  })

  it('base64 가 아닌 이름은 null 이다', () => {
    expect(supplyMarkUrlToNexon('https://static.3rd.supply/marks/logo!.png')).toBeNull()
  })

  it('풀렸지만 넥슨 경로 모양이 아니면 null 이다', () => {
    // "hello" 를 감싼 값. 우연히 풀리는 조각을 주소로 만들지 않는다
    const encoded = Buffer.from('hello').toString('base64url')
    expect(supplyMarkUrlToNexon(`https://static.3rd.supply/marks/${encoded}.png`)).toBeNull()
  })

  it('경로가 한 겹 더 깊으면 null 이다', () => {
    const encoded = Buffer.from('51/sub/0_12_083').toString('base64url')
    expect(supplyMarkUrlToNexon(`https://static.3rd.supply/marks/${encoded}.png`)).toBeNull()
  })

  it('레이어 구분(앞자리)이 0/1 이 아니면 null 이다', () => {
    const encoded = Buffer.from('51/2_12_083').toString('base64url')
    expect(supplyMarkUrlToNexon(`https://static.3rd.supply/marks/${encoded}.png`)).toBeNull()
  })

  it('확장자가 png 가 아니면 null 이다', () => {
    expect(supplyMarkUrlToNexon('https://static.3rd.supply/marks/NTEvMF8xMl8wODM.jpg')).toBeNull()
  })

  it('모르는 호스트는 null 이다 — 그대로 통과시키지 않는다', () => {
    expect(supplyMarkUrlToNexon('https://example.invalid/marks/NTEvMF8xMl8wODM.png')).toBeNull()
    expect(supplyMarkUrlToNexon('https://static.sacloud.local/marks/x.png')).toBeNull()
  })

  it('빈 값·null·undefined 는 null 이다', () => {
    expect(supplyMarkUrlToNexon(null)).toBeNull()
    expect(supplyMarkUrlToNexon(undefined)).toBeNull()
    expect(supplyMarkUrlToNexon('')).toBeNull()
  })
})

describe('화면용은 모르는 주소를 지우지 않는다 — restoreClanMarkUrl', () => {
  /*
    DB 에 쓸 때(`supplyMarkUrlToNexon`)와 내보낼 때(`restoreClanMarkUrl`)의 규칙이 갈린다.
    쓸 때는 반쯤 바뀐 주소가 저장되는 것이 가장 나쁘므로 모르면 전부 `null` 이다.
    내보낼 때 그 규칙을 그대로 쓰면 **다른 곳에 올린 마크가 화면에서 조용히 사라진다.**
  */
  it('원본 사이트 주소는 똑같이 되돌린다', () => {
    expect(restoreClanMarkUrl(BG_SUPPLY)).toBe(BG_NEXON)
  })

  it('넥슨 주소는 그대로 둔다', () => {
    expect(restoreClanMarkUrl(BG_NEXON)).toBe(BG_NEXON)
  })

  it('모르는 호스트는 **그대로 통과시킨다** — 쓰기용과 여기가 다르다', () => {
    const other = 'https://example.invalid/marks/a-bg.png'
    expect(restoreClanMarkUrl(other)).toBe(other)
    expect(supplyMarkUrlToNexon(other)).toBeNull() // 쓰기용은 null
  })

  it('원본 사이트 주소인데 못 풀면 null 이다 — 어차피 그 사이트와 함께 죽는다', () => {
    expect(restoreClanMarkUrl('https://static.3rd.supply/marks/default.png')).toBeNull()
    expect(restoreClanMarkUrl('https://static.3rd.supply/marks/logo!.png')).toBeNull()
  })

  it('빈 값은 null 이다', () => {
    expect(restoreClanMarkUrl(null)).toBeNull()
    expect(restoreClanMarkUrl(undefined)).toBeNull()
    expect(restoreClanMarkUrl('')).toBeNull()
  })
})

describe('두 레이어를 한 번에', () => {
  it('배경·전경을 각각 변환한다', () => {
    expect(restoreClanMark({ bg: BG_SUPPLY, front: FRONT_SUPPLY })).toEqual({
      bg: BG_NEXON,
      front: FRONT_NEXON,
    })
  })

  it('한 칸이 실패해도 나머지 한 칸은 살린다', () => {
    // 두 레이어 중 하나만 있는 클랜이 실제로 있다 (clanMarkPolicy 가 그 경우를 허용한다).
    // 한쪽 실패로 둘 다 버리면 그릴 수 있는 마크까지 사라진다
    expect(
      restoreClanMark({
        bg: 'https://static.3rd.supply/marks/default.png',
        front: FRONT_SUPPLY,
      }),
    ).toEqual({ bg: null, front: FRONT_NEXON })
  })

  it('둘 다 실패하면 둘 다 null 이다 — 화면은 구름을 그린다', () => {
    expect(restoreClanMark({ bg: null, front: null })).toEqual({ bg: null, front: null })
  })
})
