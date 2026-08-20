import { redirect } from 'next/navigation'

/** `/league/{slug}/home` → 리그정보 탭 */
export default async function LeagueHomeIndex({
  params,
}: {
  params: Promise<{ leagueSlug: string }>
}) {
  const { leagueSlug } = await params
  redirect(`/league/${leagueSlug}/home/info`)
}
