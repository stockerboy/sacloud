import type { ClanSummary, MatchListItem, PlayerRankRow } from '@sacloud/contract'

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

/**
 * 최근 경기 **한 줄** (2026-09-02 사장님 지시 #11).
 *
 * 카드(`MatchListItem`)가 아니라 «이긴 팀 vs 진 팀 · 언제» 만 담는다.
 * `winner` 가 왼쪽이다. 승자를 모르는 경기는 `decided === false` 이고 그때 `winner` 는
 * **레드 슬롯일 뿐 승자가 아니다** — 화면이 `결과 알수없음` 을 적는다.
 */
export interface HomeRecentRow {
  /** 원본 경기 번호 (`MatchListItem.id` 와 같다) */
  id: string
  /** 경기 시작 (KST ISO). 화면은 상대시간으로 바꿔 적는다 */
  start_at: string
  winner: ClanSummary
  loser: ClanSummary
  /** 승자를 아는가 — `Match.winnerSide` 가 red/blue 중 하나였는가 */
  decided: boolean
}

/**
 * 최근 경기를 어떻게 그리는가.
 *
 * ```
 * 'list'   한 경기 한 줄 — 이긴 팀 vs 진 팀 · 상대시간 (사장님 지시 #11 · **지금**)
 * 'card'   기록실 경기 카드(`MatchCard`) — #3 때의 모습. 지우지 않았다 (`CLAUDE.md` 10-4)
 * ```
 * 서버(`homeData.ts`)는 이 값을 보고 **필요한 쪽만** 읽는다. 화면(`HomeRecentMatches`)도 같은 값을 본다.
 */
export const HOME_RECENT_LOOK: 'list' | 'card' = 'list'

/** 리그 하나의 최근 경기 묶음 */
export interface HomeRecentLeague {
  slug: string
  name: string
  /** `'list'` 일 때 채워진다. 리그가 없거나 경기가 없으면 빈 배열 */
  rows: HomeRecentRow[]
  /** `'card'` 일 때 채워진다 (옛 방식). `'list'` 에서는 언제나 빈 배열 */
  matches: MatchListItem[]
}
