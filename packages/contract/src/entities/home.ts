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
  /** 사용자가 정한 약칭 — `DPL` · `IPL` · `열산` (2026-08-30 이름 변경) */
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
 * 순서도 사양 원문 순서다 — `DPL / IPL / 열산`.
 * 대룰리그(`daerule`)는 서비스 준비중이라 여기 없다 (D-178).
 *
 * ── 2026-08-30 사용자 지시로 **표시 이름을 바꿨다.** slug 는 하나도 건드리지 않았다.
 *   `supply`  서플라이공식리그 · SPL → **DPL**
 *   `nolink`  무소속리그 · IPL       → **IPL** (약칭이 곧 이름이 됐다)
 *   `sanply`  열산리그 · YSL         → **열산**
 *   약칭과 이름이 같아졌지만 계약의 두 칸은 그대로 둔다 — 화면이 이미 둘을
 *   다르게 쓰고 있고(약칭은 배지, 이름은 제목), 나중에 다시 갈릴 수 있다.
 */
export const HOME_LEAGUES: readonly { slug: string; abbr: string; name: string }[] = [
  { slug: 'supply', abbr: 'DPL', name: 'DPL' },
  { slug: 'nolink', abbr: 'IPL', name: 'IPL' },
  { slug: 'sanply', abbr: '열산', name: '열산' },
]
