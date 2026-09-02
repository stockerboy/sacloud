import type { MatchListItem, PlayerRankRow } from '@sacloud/contract'

/**
 * 홈 조각들이 서버에서 받는 값의 모양.
 *
 * `homeData.ts`(서버 · DB 를 읽는다)와 `_home/*.tsx`(클라이언트 · 그리기만 한다)가
 * 같은 타입을 봐야 하는데, 클라이언트 파일이 `homeData.ts` 를 import 하면
 * Prisma 와 `next/cache` 가 클라이언트 번들로 끌려 들어간다. 그래서 타입만 여기 따로 둔다.
 *
 * 전부 **JSON 으로 그대로 넘어가는 값**이다 — 날짜도 이미 ISO 문자열이다
 * (`toMatchListItem` 이 `toKstIso` 로 만든다). 서버 → 클라이언트 경계를 그대로 건넌다.
 */

/** 리그 하나의 개인랭킹 미리보기 */
export interface HomeRankPreviewLeague {
  slug: string
  /** 화면 이름 (`SPL` · `IPL` · `10mountain`) — 계약의 `HOME_LEAGUES` 가 준다 */
  name: string
  /** 상위 N명. **리그가 없거나 비어 있으면 빈 배열이다** — 0점으로 채우지 않는다 */
  rows: PlayerRankRow[]
}

/** 리그 하나의 최근 경기 묶음 */
export interface HomeRecentLeague {
  slug: string
  name: string
  /** 최근 N경기. 리그가 없거나 경기가 없으면 빈 배열이다 */
  matches: MatchListItem[]
}
