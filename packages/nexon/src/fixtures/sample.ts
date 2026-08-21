/**
 * 테스트용 응답 픽스처.
 *
 * **주의: 실제 넥슨 응답이 아니다.** 공식 OpenAPI 스펙(2026-08-21 실측)의 필드 정의로만
 * 조립한 값이다. API 키를 받아 1차 실주행을 하면 **실제 응답으로 교체한다**
 * (`docs/NEXON_INGEST_SPEC.md` 1장).
 *
 * 실제 값으로 교체하기 전에는 이 픽스처가 "넥슨이 이렇게 준다"는 증거가 될 수 없다.
 */

export const SPEC_DERIVED = true

export const SAMPLE_MATCH_LIST = {
  match: [
    {
      match_id: 'AAAA-1111',
      match_type: '클랜전',
      match_mode: '폭파미션',
      date_match: '2026-08-01T05:12:33Z',
      match_result: '1',
      kill: 14,
      death: 9,
      assist: 3,
    },
    {
      match_id: 'BBBB-2222',
      match_type: '일반전',
      match_mode: '폭파미션',
      date_match: '2026-08-02T11:40:00Z',
      match_result: '2',
      kill: 7,
      death: 12,
      assist: 1,
    },
  ],
}

/** 5 vs 5 클랜전. 레드가 승리 (team_id 값 자체의 의미는 [미확인] — 원본 문자열을 보존한다) */
export const SAMPLE_MATCH_DETAIL = {
  match_id: 'AAAA-1111',
  match_type: '클랜전',
  match_mode: '폭파미션',
  date_match: '2026-08-01T05:12:33Z',
  match_map: '제3보급창고',
  match_detail: [
    ...['가가', '나나', '다다', '라라', '마마'].map((user_name, index) => ({
      team_id: '1',
      match_result: '1',
      user_name,
      season_grade: '이등병',
      clan_name: '알파클랜',
      kill: 12 + index,
      death: 8,
      headshot: 4,
      damage: 1500.5,
      assist: 2,
    })),
    ...['바바', '사사', '아아', '자자', '차차'].map((user_name, index) => ({
      team_id: '2',
      match_result: '2',
      user_name,
      season_grade: '일병',
      clan_name: '브라보클랜',
      kill: 6 + index,
      death: 13,
      headshot: 2,
      damage: 900.25,
      assist: 1,
    })),
  ],
}
