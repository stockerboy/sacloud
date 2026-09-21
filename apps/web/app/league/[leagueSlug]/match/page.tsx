import { redirect } from 'next/navigation'
import MatchListPage from './MatchListScreen'

/* ★갱신 주기 60초★ (2026-09-21) — 까닭은 `app/player/[playerId]/page.tsx` 에 한 번만 적었다 */
export const revalidate = 60


/**
 * `/league/{leagueSlug}/match` — ★홈으로 보낸다★ (2026-09-15 사장님:
 * «그리고 top5랑 경기페이지는 없애버려»).
 *
 * ⚠ ★`layout.tsx` 로 막으면 안 된다★ — 그러면 밑에 있는 경기 상세
 *   (`match/[matchId]`)까지 같이 막힌다. 같은 실수를 `home/info` 에서 한 번 했다.
 *   그래서 ★이 목록 페이지에서만★ 보낸다.
 *
 * 화면(`MatchListScreen`)은 ★지우지 않았다★ — 홈의 「최근 경기」가 같은 부품을 쓴다.
 * 되살리려면 아래 `MATCH_LIST_PAGE_ON` 을 `true` 로 되돌리고
 * `LeagueTopBar` 의 주석 두 줄을 풀면 된다 (`CLAUDE.md` 1-4).
 */
const MATCH_LIST_PAGE_ON = false

/** 빈 배열이다 — 미리 만들 목록이 없다. 빌드에서 DB 를 안 본다 */
export function generateStaticParams(): { leagueSlug: string }[] {
  return []
}

/** 목록에 없는 리그도 열린다. 첫 요청 때 만들어져 캐시된다 */
export const dynamicParams = true

export default async function Page({ params }: { params: Promise<{ leagueSlug: string }> }) {
  if (!MATCH_LIST_PAGE_ON) {
    const { leagueSlug } = await params
    redirect(`/league/${leagueSlug}/home`)
  }
  return <MatchListPage params={params} />
}
