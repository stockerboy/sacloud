/**
 * 옛 TOP5 화면 — ★홈으로 보낸다★ (2026-09-15 사장님:
 * «각리그 홈에다가 top5를 합쳐줘 / 그리고 top5랑 경기페이지는 없애버려»).
 *
 * 화면(`HexTopScreen`)은 ★지우지 않았다★ — 홈이 `embedded` 로 그대로 쓴다.
 * 이 문은 밖에서 들어오는 옛 링크·북마크가 404 가 되지 않게 하려는 것뿐이다.
 * 되살리려면 이 파일을 지우고 `LeagueTopBar` 의 주석 두 줄을 풀면 된다.
 */
import { redirect } from 'next/navigation'

export default async function LegacyTop5Redirect({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ leagueSlug: string }>
}) {
  void children
  const { leagueSlug } = await params
  redirect(`/league/${leagueSlug}/home`)
}
