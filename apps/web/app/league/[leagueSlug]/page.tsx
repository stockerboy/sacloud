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
export default async function LeagueIndex({
  params,
}: {
  params: Promise<{ leagueSlug: string }>
}) {
  const { leagueSlug } = await params
  redirect(leagueLandingPath(leagueSlug))
}
