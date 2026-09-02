import MatchListPage from './MatchListScreen'

/**
 * `/league/{leagueSlug}/match` **껍데기를 굳힌다** (2026-09-03 · O-015 · O-016).
 *
 * 화면 코드는 `MatchListScreen.tsx` 에 있다. 여기는 **얇은 서버 껍데기**뿐이다.
 * 이유와 함정(재수출로는 `generateStaticParams` 가 안 불린다)은
 * `app/player/[playerId]/page.tsx` 에 한 번만 적어 두었다.
 */

/** 빈 배열이다 — 미리 만들 목록이 없다. 빌드에서 DB 를 안 본다 */
export function generateStaticParams(): { leagueSlug: string }[] {
  return []
}

/** 목록에 없는 리그도 열린다. 첫 요청 때 만들어져 캐시된다 */
export const dynamicParams = true

export default function Page({ params }: { params: Promise<{ leagueSlug: string }> }) {
  return <MatchListPage params={params} />
}
