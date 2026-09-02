import { redirect } from 'next/navigation'

/**
 * `/league/{slug}/rank/clan/{division}` — **division 을 무시하고 「고용가능 클랜」으로 보낸다**
 * (2026-09-02 사용자 지시 · D-260).
 *
 * > "1부2부 분류 체계 아예 없애기 1,2부라는 개념x"
 *
 * ── 라우트를 **지우지 않았다**
 *   밖에서 들어오는 링크(북마크 · 검색엔진 · 예전 화면의 부리그 탭)가 남아 있다.
 *   지우면 그 링크가 404가 된다. 그래서 살려 두고 새 화면으로 보낸다.
 *
 * ── 옛 화면 코드도 남아 있다
 *   같은 폴더의 `ClanRankDivisionLegacy.tsx` 가 부리그 탭 화면 그대로다 (`CLAUDE.md` 10-4).
 *   되돌리려면 아래 redirect 를 그 컴포넌트 렌더로 바꾸면 된다.
 *
 * ── 데이터는 건드리지 않았다
 *   `LeagueClan.division` 도, 경기 당시 division 스냅샷도 그대로다.
 *   없앤 것은 **사람에게 보이는 분류**지 래더 공식의 입력이 아니다 (`CLAUDE.md` 3-B 4번).
 */
export default async function ClanRankDivisionRedirect({
  params,
}: {
  params: Promise<{ leagueSlug: string; division: string }>
}) {
  const { leagueSlug } = await params
  redirect(`/league/${leagueSlug}/rank/clan`)
}
