import { redirect } from 'next/navigation'

/**
 * 리그홈은 **화면에서 없앴다** (2026-09-01 · D-251).
 *
 * 사용자 지시: *"리그홈은 다 없애고 클랜랭킹이랑 개인랭킹만 해"*
 *
 * ── 라우트 파일을 지우지 않았다
 *   `home/info/page.tsx` · `home/desc/page.tsx` · `home/page.tsx` 는 그대로 있고
 *   옛 레이아웃도 `LeagueHomeLayoutLegacy.tsx` 로 남아 있다 (`CLAUDE.md` 10-4).
 *   **가는 길만 막는다.** 이 레이아웃이 리그홈 하위 경로 전부를 지나므로,
 *   여기 한 곳에서 클랜랭킹으로 보내면 `/home` · `/home/info` · `/home/desc` 가
 *   한꺼번에 랭킹으로 간다 — 경로마다 리다이렉트를 뿌리면 새 경로가 생길 때 빠진다.
 *
 * ── 링크를 지우지 않는 이유
 *   리그 목록(`LeagueListTable`)이나 북마크처럼 밖에서 들어오는 `/home/info` 링크가
 *   남아 있다. 그것들이 404 가 되면 안 된다 — **랭킹으로 보낸다.**
 *
 * ── 되돌리려면
 *   이 파일을 지우고 `LeagueHomeLayoutLegacy.tsx` 를 `layout.tsx` 로 되돌린 뒤,
 *   `packages/ui/src/layout/LeagueTopBar.tsx` 의 `leagueTabs` 에 리그홈을 다시 넣는다.
 */
export default async function LeagueHomeRedirect({
  params,
}: {
  /* `children` 은 받기만 하고 그리지 않는다 — 아래 `redirect()` 가 먼저 던진다.
     타입에서 빼면 Next 의 레이아웃 타입 검사가 걸린다 */
  children: React.ReactNode
  params: Promise<{ leagueSlug: string }>
}) {
  const { leagueSlug } = await params
  redirect(`/league/${leagueSlug}/rank/clan`)
}
