import { redirect } from 'next/navigation'

/** `/league/{slug}/rank/clan` → 1부리그 */
export default async function ClanRankIndex({
  params,
}: {
  params: Promise<{ leagueSlug: string }>
}) {
  const { leagueSlug } = await params
  redirect(`/league/${leagueSlug}/rank/clan/1`)
}
