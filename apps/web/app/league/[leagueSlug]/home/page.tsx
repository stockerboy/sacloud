/**
 * ★리그 홈★ `/league/{slug}/home` — 깃발 산 + 최근 경기 (2026-09-15 사장님).
 *
 * > «각 리그 페이지에 홈(여기에 최근경기랑 깃발 그래프 다 나옴)
 * >  그리고 이제 클랜랭킹 개인랭킹 이런식으로»
 *
 * ⚠ ★옛 판은 `/home/info` 로 보내는 리다이렉트였다★ (2026-09-01 사장님이 리그홈을
 *   없애라고 하셔서). 지금은 ★보여 줄 것이 생겨서★ 되살렸다.
 *   리그정보 화면(`/home/info`)은 그대로 남아 있다 (`CLAUDE.md` 1-4).
 */
import LeagueHomeScreen from './LeagueHomeScreen'

/** 빈 배열이다 — 빌드에서 DB 를 보지 않는다 */
export function generateStaticParams(): { leagueSlug: string }[] {
  return []
}

/** 목록에 없는 리그도 열린다 */
export const dynamicParams = true

export default function LeagueHomePage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>
}) {
  return <LeagueHomeScreen params={params} />
}
