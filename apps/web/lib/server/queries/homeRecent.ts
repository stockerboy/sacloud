import { prisma } from '@sacloud/db'
import type { MatchListItem } from '@sacloud/contract'
import {
  MATCH_ORDER,
  MATCH_SELECT,
  leagueClanIdsOf,
  loadLeagueClanContext,
  resolveLeagueId,
  toMatchListItem,
} from './matches'

/**
 * 홈 · 리그의 **최근 경기 N건** (2026-09-02 사장님 지시 — 홈 「사이트 소개」 자리에 넣는다).
 *
 * ── 카드는 기록실 것과 **같은 모양**이어야 한다
 *   `MATCH_SELECT` · `MATCH_ORDER` · `toMatchListItem` 을 그대로 쓴다. 여기서 select 나
 *   정렬을 새로 적으면 홈 카드와 기록실 카드가 조용히 갈라진다.
 *   왕복은 세 번이다 — 리그 id · 경기 N건 · 그 경기들의 리그클랜 한 묶음.
 *   `Match` 에는 `[leagueId, startAt desc]` 인덱스가 있어 N건은 인덱스로 끝난다.
 *
 * ── 누구 쪽에서 보는가
 *   경기 카드는 언제나 **보는 쪽(viewer)** 기준이다 — 승/패 · 왼쪽 클랜 · 증감이 그것으로 정해진다.
 *   기록실에서는 그 선수·그 클랜이 보는 쪽인데, 홈에는 주인이 없다.
 *   그래서 **이긴 쪽**을 보는 쪽으로 둔다. 카드가 `승리 [이긴 클랜] vs [진 클랜]` 로 읽혀
 *   누가 이겼는지가 왼쪽에 바로 선다. 레드 슬롯을 그대로 쓰면 `승리/패배` 가 뒤섞여
 *   «누구의 패배인가» 를 읽는 사람이 되짚어야 한다 — 슬롯은 내부 자리이지 진영이 아니다 (D-207).
 *   승자를 모르는 경기(`winnerSide` 가 blue 가 아님)는 레드 슬롯으로 물러난다.
 *
 * ── 증감 칸은 비어 있을 수 있다
 *   선수가 없으니(`viewerPlayerId = null`) 클랜 단위 증감을 쓰는데, 미러 경기는 그 값이
 *   **한쪽에만** 있다 (`toMatchListItem` 주석). 없으면 `null` 이고 카드는 `알수없음` 을 적는다.
 *   0 으로 채우지 않는다 (`CLAUDE.md` 3장 7번).
 *
 * ── 리그가 없으면 `null`
 *   시드 리그·없는 slug 는 `resolveLeagueId` 가 걸러 `null` 이다. 홈은 그 칸에 «기록 없음» 을 적는다.
 */
export async function getLeagueRecentMatches(
  leagueSlug: string,
  size: number,
): Promise<MatchListItem[] | null> {
  const leagueId = await resolveLeagueId(leagueSlug)
  if (!leagueId) return null

  const rows = await prisma.match.findMany({
    where: { leagueId },
    orderBy: [...MATCH_ORDER],
    take: size,
    select: MATCH_SELECT,
  })

  /* 카드에 등장하는 리그클랜을 **한 번에** 읽는다 (등록 클랜 판정 포함, D-146) */
  const clans = await loadLeagueClanContext(leagueId, leagueClanIdsOf(rows))

  return rows.flatMap((match) => {
    const viewer = match.winnerSide === 'blue' ? match.blueLeagueClanId : match.redLeagueClanId
    const item = toMatchListItem(match, viewer, null, clans)
    return item ? [item] : []
  })
}
