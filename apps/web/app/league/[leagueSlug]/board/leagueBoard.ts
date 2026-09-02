import { redirect } from 'next/navigation'
import { leagueBoardCategory, leagueBoardPath, leagueLandingPath } from '@sacloud/contract'

/**
 * 리그 안 게시판 페이지들이 공통으로 쓰는 한 줄 (2026-09-02 지시 #14-2).
 *
 * 어느 카테고리인지는 계약의 `leagueScreen` 표가 정한다 (`supply → spl` · `nolink → ipl`).
 * 게시판이 없는 리그(`10mountain` 등)로 이 주소를 치고 들어오면 **죽지 않고** 그 리그의 첫 화면으로 보낸다.
 * 렌더 중에 부른다 — `redirect` 는 던지므로 아래 코드는 이어지지 않는다.
 */
export function resolveLeagueBoard(leagueSlug: string): { category: string; basePath: string } {
  const category = leagueBoardCategory(leagueSlug)
  if (category === null) redirect(leagueLandingPath(leagueSlug))
  return { category, basePath: leagueBoardPath(leagueSlug) }
}
