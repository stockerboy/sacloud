import { z } from 'zod'
import { Count, Rating, Slug } from '../common'
import { ClanSummary, PlayerSummary } from './summaries'

/**
 * 메인페이지 — 리그별 개인랭킹 TOP3 (`docs/SITE_SPEC_V2.md` 3절).
 *
 * ── 왜 별도 계약인가
 *   메인은 리그 **세 개**의 TOP3 를 한 번에 그린다. 기존 개인랭킹
 *   (`GET /leagues/:id/ranks/players`)을 세 번 부르면 요청이 세 번 나가고,
 *   리그가 없을 때(무소속리그는 아직 등록 클랜이 0이다) 각각 404 를 처리해야 한다.
 *   메인 전용으로 **한 번에 묶어 주는** 응답을 둔다.
 *
 * ── 순위 계산은 새로 만들지 않는다
 *   서버는 개인랭킹 질의(`getPlayerRanks`)를 그대로 재사용하고, 앞 3줄만 잘라
 *   여기 형태로 옮긴다. 정렬 규칙이 랭킹 화면과 갈라지지 않게 하기 위해서다.
 *
 * ── 킬뎃을 아예 담지 않는다
 *   무소속리그(`nolink`)는 누적 킬뎃을 감춘다 (D-107). 메인 TOP3 는 세 리그를
 *   나란히 놓기 때문에, 리그마다 컬럼이 달라지면 표가 어긋난다.
 *   사양이 요구하는 것도 `닉네임 · 클랜마크 · 래더 점수` 뿐이라
 *   **처음부터 승패·킬뎃을 응답에 넣지 않는다.** 감출 값이 없으면 새어 나갈 수도 없다.
 */

/** 메인 TOP3 한 줄 */
export const HomeTopRow = z.object({
  rank: Count,
  player: PlayerSummary,
  /** 무소속이면 `null` — 화면은 fallback 마크를 그린다 (D-146) */
  clan: ClanSummary.nullable(),
  /** 통합 개인 래더 (`LeaguePlayer.rating`) */
  rating: Rating,
})
export type HomeTopRow = z.infer<typeof HomeTopRow>

/** 리그 하나의 TOP3 묶음 */
export const HomeLeagueTop = z.object({
  slug: Slug,
  /** 사용자가 정한 약칭 — `SPL` · `IPL` · `10mountain` (2026-09-01 이름 변경 · D-246) */
  abbr: z.string(),
  /** DB 의 리그명. 리그가 아직 없으면 약칭 표 쪽 이름으로 물러난다 */
  name: z.string(),
  /**
   * 상위 3명. **없으면 빈 배열이다.**
   * 리그가 아직 비어 있는 상태를 0으로 채우거나 지어내지 않는다 (CLAUDE.md 3장 7번).
   */
  rows: z.array(HomeTopRow),
})
export type HomeLeagueTop = z.infer<typeof HomeLeagueTop>

/** GET /home/top */
export const HomeTop = z.object({
  leagues: z.array(HomeLeagueTop),
})
export type HomeTop = z.infer<typeof HomeTop>

/** 몇 명을 보여 주는가 — 사양이 TOP3 로 못박았다 */
export const HOME_TOP_SIZE = 3

/**
 * 메인에 거는 리그와 그 이름 (SITE_SPEC_V2 1절, 사용자 확정).
 *
 * 순서도 사양 원문 순서다 — `SPL / IPL / 10mountain`.
 * 대룰리그(`daerule`)는 서비스 준비중이라 여기 없다 (D-178).
 *
 * ── 2026-09-01 사용자 지시로 **표시 이름을 다시 바꿨다** (D-246). slug 는 하나도 건드리지 않았다.
 *   `supply`  서플라이공식리그 → **SPL**  (2026-08-30 에 잠깐 `DPL` 이었다 · D-204)
 *   `nolink`  무소속리그       → **IPL**  (약칭이 곧 이름이 됐다 · 그대로)
 *   `sanply`  열산리그         → **10mountain**
 *   `10mountain` 옆의 산 표시는 **이름에 넣지 않는다** — 화면에서만 붙인다
 *   (`@sacloud/ui` 의 `LeagueLabel`). 이름은 정렬 키이자 검색 대상이라 깨끗해야 한다.
 *   약칭과 이름이 같아졌지만 계약의 두 칸은 그대로 둔다 — 화면이 이미 둘을
 *   다르게 쓰고 있고(약칭은 배지, 이름은 제목), 나중에 다시 갈릴 수 있다.
 */
export const HOME_LEAGUES: readonly { slug: string; abbr: string; name: string }[] = [
  { slug: 'supply', abbr: 'SPL', name: 'SPL' },
  { slug: 'nolink', abbr: 'IPL', name: 'IPL' },
  { slug: 'sanply', abbr: '10mountain', name: '10mountain' },
]

/**
 * 랭킹 화면을 **한 공간에 나란히** 두는 두 리그 (2026-09-01 사용자 지시).
 *
 * > "클랜랭킹 그냥 SPL이랑 IPL 한공간에 둬 SPL이 왼쪽 IPL이 오른쪽"
 * > "개인랭킹도 SPL은 왼쪽 IPL은 오른쪽"
 *
 * **`10mountain`(`sanply`)은 여기 없다.** 개인기록만 있는 비공식 리그라서
 * 지금 있는 자리를 그대로 둔다 (D-245).
 *
 * 순서가 곧 화면의 좌우다 — 0번이 왼쪽, 1번이 오른쪽.
 * slug 는 라우트 그대로다. 이름만 D-246 표기를 따른다.
 */
export const RANK_SPLIT_LEAGUES: readonly { slug: string; name: string }[] = [
  { slug: 'supply', name: 'SPL' },
  { slug: 'nolink', name: 'IPL' },
]

/** 이 리그가 좌우 합친 랭킹 화면을 쓰는가 */
export function isRankSplitLeague(slug: string): boolean {
  return RANK_SPLIT_LEAGUES.some((league) => league.slug === slug)
}
