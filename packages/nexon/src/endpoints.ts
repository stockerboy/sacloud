/**
 * 넥슨 Open API 서든어택 엔드포인트.
 *
 * 근거: 넥슨 공식 OpenAPI 스펙 파일 (2026-08-21 실측)
 *   - 계정   47_ko_script20250324012941.yaml
 *   - 매치   48_ko_script20250529012921.yaml
 *   - 메타   52_ko_script20250529004346.yaml
 *
 * **스펙에 없는 경로를 추측해서 넣지 않는다.** 키 없이 경로 존재 여부를 확인할 수 없다
 * (게이트웨이가 없는 경로에도 같은 400을 돌려준다 — `docs/NEXON_INGEST_SPEC.md` 1장).
 */

export const ENDPOINT = {
  /** 닉네임 → 계정 식별자(ouid) */
  id: '/suddenattack/v1/id',
  userBasic: '/suddenattack/v1/user/basic',
  userRank: '/suddenattack/v1/user/rank',
  userTier: '/suddenattack/v1/user/tier',
  userRecentInfo: '/suddenattack/v1/user/recent-info',
  /** 유저의 최근 매치 목록 (최대 1000건, 커서·날짜 필터 없음) */
  match: '/suddenattack/v1/match',
  matchDetail: '/suddenattack/v1/match-detail',
} as const

export type EndpointPath = (typeof ENDPOINT)[keyof typeof ENDPOINT]

/**
 * `/match`의 `match_mode`는 **필수**다. 전체 기록을 받으려면 모드별로 각각 호출해야 한다.
 * 스펙의 enum을 그대로 옮긴 값이며 번역하지 않는다.
 */
export const MATCH_MODES = ['개인전', '데스매치', '폭파미션', '진짜를 모아라'] as const
export type MatchMode = (typeof MATCH_MODES)[number]

/**
 * `match_type`은 선택 파라미터다. **수집 시 지정하지 않는다.**
 * 원본을 그대로 받아 스테이징에 보존하고, 사용할 경기는 투영 규칙에서만 고른다
 * (`docs/NEXON_INGEST_SPEC.md` 4장).
 */
export const MATCH_TYPES = [
  '일반전',
  '클랜전',
  '퀵매치 클랜전',
  '클랜 랭크전',
  '랭크전 솔로',
  '랭크전 파티',
  '토너먼트',
] as const
export type MatchType = (typeof MATCH_TYPES)[number]

/** 클랜 단위 경기로 취급하는 유형 (투영 규칙 기본값) */
export const CLAN_MATCH_TYPES: readonly MatchType[] = ['클랜전', '퀵매치 클랜전', '클랜 랭크전']

/** 매치 결과 코드 — 1 승 / 2 패 / 3 무 (스펙 원문) */
export const MATCH_RESULT = { WIN: '1', LOSE: '2', DRAW: '3' } as const

export type MatchOutcome = 'win' | 'lose' | 'draw'

/**
 * 결과 코드 해석. **모르는 값은 추측하지 않고 `null`** 을 돌려준다.
 * (개인전·`진짜를 모아라`는 승패가 아니라 순위가 담긴다고 스펙에 적혀 있다)
 */
export function toMatchOutcome(raw: string | number | null | undefined): MatchOutcome | null {
  if (raw === null || raw === undefined) return null
  const value = String(raw).trim()
  if (value === MATCH_RESULT.WIN) return 'win'
  if (value === MATCH_RESULT.LOSE) return 'lose'
  if (value === MATCH_RESULT.DRAW) return 'draw'
  return null
}

/** 쿼리스트링을 만든다. **키는 헤더로만 보내며 여기에 넣지 않는다.** */
export function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue
    search.set(key, value)
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}
