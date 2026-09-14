/**
 * 옛 리그 소개 화면 — ★랭킹으로 보낸다★ (2026-09-01 사장님: «리그홈은 다 없애고
 * 클랜랭킹이랑 개인랭킹만 해»).
 *
 * 화면과 라우트는 ★지우지 않았다★ (`CLAUDE.md` 1-4). 밖에서 들어오는 옛 링크와
 * 북마크가 404 가 되면 안 되므로 랭킹으로 보낸다.
 *
 * ⚠ 이 문은 ★이 경로에만★ 있다. 위(`home/layout.tsx`)에 두면 2026-09-15 에
 *   되살린 ★새 홈까지 같이 막힌다★ — 실제로 한 번 그랬다.
 */
import { redirect } from 'next/navigation'

export default async function LegacyLeagueHomeRedirect({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ leagueSlug: string }>
}) {
  void children
  const { leagueSlug } = await params
  redirect(`/league/${leagueSlug}/rank/clan`)
}
