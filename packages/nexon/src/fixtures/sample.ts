/**
 * 조립 픽스처 — **실제 넥슨 응답이 아니다.**
 *
 * 실제 응답은 `fixtures/real/*.json`에 있다(2026-08-21 실주행, 가명화).
 * 이 파일은 그것으로 대체된 것이 아니라 **다른 목적**으로 남아 있다:
 *
 *   실제 넥슨 응답에는 **양 팀이 함께 오지 않는다**(D-044).
 *   그래서 "5 vs 5 클랜전이 온전히 왔다면" 이라는 가정 상황을 만들 수 없다.
 *   투영 규칙·멱등성 테스트에는 그런 완전한 경기가 필요하므로 여기서 조립한다.
 *
 * 필드 이름은 실제 응답에 맞췄다 (`clan_name`이 아니라 `guild_name` — D-043).
 * 이 픽스처는 "넥슨이 이렇게 준다"는 증거가 아니다. 증거는 `fixtures/real/`이다.
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

/**
 * 5 vs 5 클랜전 **가정** 데이터. 레드가 승리.
 * 실제 응답에서는 이렇게 양 팀이 온전히 오지 않는다 (D-044).
 */
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
      guild_name: '알파클랜',
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
      guild_name: '브라보클랜',
      kill: 6 + index,
      death: 13,
      headshot: 2,
      damage: 900.25,
      assist: 1,
    })),
  ],
}
