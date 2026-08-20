import { redirect } from 'next/navigation'

/** 원본과 동일하게 `/league/{slug}` 는 리그홈으로 보낸다. */
export default async function LeagueIndex({
  params,
}: {
  params: Promise<{ leagueSlug: string }>
}) {
  const { leagueSlug } = await params
  redirect(`/league/${leagueSlug}/home/info`)
}
