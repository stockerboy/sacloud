import { redirect } from 'next/navigation'

/**
 * 리그홈 진입점 `/league/{slug}/home`.
 *
 * 원본 서브내비의 `리그홈` 링크가 가리키는 곳이 바로 이 경로이고, 실제 화면은
 * `리그정보`(`/home/info`)다. 예전에는 이 경로에 아무것도 없어서 서브내비가
 * `/home/info` 를 직접 가리켰고, 그만큼 원본과 URL 이 달랐다 (UI_PARITY_AUDIT 2-9).
 */
export default async function LeagueHomeIndex({
  params,
}: {
  params: Promise<{ leagueSlug: string }>
}) {
  const { leagueSlug } = await params
  redirect(`/league/${leagueSlug}/home/info`)
}
