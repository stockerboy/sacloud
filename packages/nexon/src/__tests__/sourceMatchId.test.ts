import { describe, expect, it } from 'vitest'
import { quoteLongIds } from '../client'
import { normalizeMatchDetail, normalizeMatchList } from '../normalize'
import { NexonMatchDetailResponse, NexonMatchListResponse } from '../schemas'

/**
 * `sourceMatchId` 원형 보존 (Phase 10 final cleanup · 정책 11).
 *
 * 지키는 것 하나
 *   넥슨 `match_id`는 우리가 만든 값이 아니라 **외부 식별자**다. 어느 단계에서도 변형되면 안 된다.
 *
 * 왜 테스트가 필요한가
 *   `match_id`는 18자리다. JavaScript `Number`의 안전 정수 한계는 9,007,199,254,740,991(16자리).
 *   숫자로 다루는 순간 **오류 없이 끝자리가 바뀐다**. 예외도, 경고도 없다.
 *   그래서 "숫자로 만들지 않았다"를 사람이 눈으로 확인하는 대신 여기서 못 박는다.
 *
 * DB 이후 단계(RawImport → NexonMatch → Match.sourceMatchId)는 Prisma 스키마가 전부 `String`이고,
 * 실제 저장분 2,414건을 `src/dev/verifySourceMatchId.ts`로 대조한다.
 */

/** 실제로 수집된 값. 18자리다 */
const REAL_ID = '260716180538124001'

describe('18자리 match_id는 숫자로 다루면 안 된다', () => {
  it('Number로 왕복하면 값이 바뀐다 — 그래서 문자열로만 다룬다', () => {
    expect(REAL_ID.length).toBe(18)
    expect(Number(REAL_ID) > Number.MAX_SAFE_INTEGER).toBe(true)
    // 이 한 줄이 이 파일 전체의 존재 이유다
    expect(String(Number(REAL_ID))).toBe('260716180538124000')
    expect(String(Number(REAL_ID))).not.toBe(REAL_ID)
  })
})

describe('목록 → 정규화', () => {
  it('exact string 그대로 나온다', () => {
    const parsed = NexonMatchListResponse.parse({
      match: [
        {
          match_id: REAL_ID,
          match_mode: '퀵매치',
          match_type: '퀵매치 클랜전',
          date_match: '2026-07-16T18:05:38.000+09:00',
          match_result: '승리',
          kill: 10,
          death: 5,
          assist: 2,
        },
      ],
    })
    const { entries } = normalizeMatchList(parsed)
    expect(entries[0]?.sourceMatchId).toBe(REAL_ID)
    expect(typeof entries[0]?.sourceMatchId).toBe('string')
  })
})

describe('상세 → 정규화', () => {
  const detail = {
    match_id: REAL_ID,
    match_mode: '퀵매치',
    match_type: '퀵매치 클랜전',
    date_match: '2026-07-16T18:05:38.000+09:00',
    match_map: '제3보급창고',
    match_detail: [
      {
        user_name: '테스트',
        team_id: 1,
        match_result: '승리',
        kill: 10,
        death: 5,
        assist: 2,
      },
    ],
  }

  it('exact string 그대로 나온다', () => {
    const result = normalizeMatchDetail(NexonMatchDetailResponse.parse(detail))
    expect(result?.sourceMatchId).toBe(REAL_ID)
  })

  it('상세에 match_id가 없으면 목록에서 받은 값을 그대로 쓴다 (다시 만들지 않는다)', () => {
    const withoutId = NexonMatchDetailResponse.parse({ ...detail, match_id: null })
    const result = normalizeMatchDetail(withoutId, REAL_ID)
    expect(result?.sourceMatchId).toBe(REAL_ID)
  })
})

describe('파싱 전 방어 — 따옴표 없는 18자리가 오면 문자열로 감싼다', () => {
  it('따옴표가 없으면 JSON.parse에서 값이 깨진다', () => {
    const body = `{"match_id":${REAL_ID}}`
    // 감싸지 않고 그냥 파싱하면 이렇게 된다
    expect(String((JSON.parse(body) as { match_id: number }).match_id)).toBe('260716180538124000')
    // 감싸면 원형이 유지된다
    expect((JSON.parse(quoteLongIds(body)) as { match_id: string }).match_id).toBe(REAL_ID)
  })

  it('이미 문자열이면 한 글자도 건드리지 않는다', () => {
    const body = `{"match_id":"${REAL_ID}","kill":10}`
    expect(quoteLongIds(body)).toBe(body)
  })

  it('짧은 숫자 필드는 그대로 둔다 (kill/death까지 문자열로 만들지 않는다)', () => {
    const body = `{"kill":10,"death":5,"team_id":1}`
    expect(quoteLongIds(body)).toBe(body)
  })

  it('목록 응답처럼 여러 건이 와도 전부 감싼다', () => {
    const body = `{"match":[{"match_id":260716180538124001},{"match_id":260716183556124001}]}`
    const parsed = JSON.parse(quoteLongIds(body)) as { match: { match_id: string }[] }
    expect(parsed.match.map((entry) => entry.match_id)).toEqual([
      '260716180538124001',
      '260716183556124001',
    ])
  })
})

describe('내부 Match.id와 sourceMatchId는 다른 값이다', () => {
  /**
   * Phase 10 완료 보고에서 이 둘을 같은 값으로 착각해 "불일치"로 보고했다.
   *
   *   sourceMatchId  260716180538124001  — 넥슨이 준 값
   *   Match.id       260716180538000001  — 우리가 만든 값 (YYMMDDHHmmss + 6자리 일련번호)
   *
   * 앞 12자리가 같은 건 양쪽 다 경기 시작 시각을 앞에 두는 관례를 쓰기 때문이다. 우연이다.
   */
  it('내부 id는 시작 시각 + 일련번호이고, 원본 id를 덮어쓰지 않는다', () => {
    const internalId = '260716180538000001'
    expect(internalId.slice(0, 12)).toBe(REAL_ID.slice(0, 12)) // 둘 다 260716180538
    expect(internalId.slice(12)).toBe('000001') // 우리 일련번호
    expect(REAL_ID.slice(12)).toBe('124001') // 넥슨 쪽 값
    expect(internalId).not.toBe(REAL_ID)
  })
})
