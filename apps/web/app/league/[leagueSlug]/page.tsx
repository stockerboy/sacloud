import { redirect } from 'next/navigation'
import { leagueLandingPath } from '@sacloud/contract'

/**
 * `/league/{slug}` → **바로 랭킹** (2026-09-01 사용자 지시).
 *
 * > "리그홈같은 쓸데없는건 없애버리고 누르면 바로 랭킹 보여줘" (D-245)
 * > "리그홈은 다 없애고 클랜랭킹이랑 개인랭킹만 해"
 *
 * 예전에는 `/home/info` 로 보냈다. 리그홈 라우트는 **지우지 않았고**
 * 들어오면 여기와 같은 곳으로 보낸다 (`CLAUDE.md` 10-4).
 * 어디로 갈지는 `leagueLandingPath()` 한 곳이 정한다 —
 * 클랜랭킹이 없는 리그(`10🏔`)는 개인랭킹으로 간다.
 */
/**
 * **껍데기를 굳힌다** (2026-09-03 · O-016).
 *
 * 이 파일은 이미 서버 컴포넌트라 가를 필요가 없었다 — 두 줄만 더한다.
 * 자세한 이유는 `app/player/[playerId]/page.tsx` 에 한 번만 적어 두었다.
 */

/** 빈 배열이다 — 미리 만들 목록이 없다. 빌드에서 DB 를 보지 않는다 */
export function generateStaticParams(): { leagueSlug: string }[] {
  return []
}

/** 목록에 없는 리그도 열린다. 첫 요청 때 만들어져 캐시된다 */
export const dynamicParams = true

export default async function LeagueIndex({
  params,
}: {
  params: Promise<{ leagueSlug: string }>
}) {
  const { leagueSlug } = await params
  redirect(leagueLandingPath(leagueSlug))
}
