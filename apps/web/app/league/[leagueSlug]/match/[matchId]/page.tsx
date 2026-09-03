import type { Metadata } from 'next'
import { leagueMatchPath } from '@sacloud/ui'
import { fetchForMetadata, pageMetadata } from '@/lib/server/pageMetadata'
import MatchDetailPage from './MatchDetailScreen'

/**
 * `/league/{leagueSlug}/match/{matchId}` **껍데기를 굳힌다** (2026-09-03 · O-014 · O-016).
 *
 * 화면 코드는 `MatchDetailScreen.tsx` 에 있다. 여기는 **얇은 서버 껍데기**뿐이다.
 * 이유와 함정(재수출로는 `generateStaticParams` 가 안 불린다)은
 * `app/player/[playerId]/page.tsx` 에 한 번만 적어 두었다.
 */

/**
 * ★이 경기의 이름표★ (2026-09-03 · O-038 ①).
 *
 * 「이 판 봐라」 하고 링크를 보내는 게 클랜전 문화인데 **받는 쪽엔 사이트 이름만 떴다.**
 * 이제 맵 · 두 클랜 · 시각이 미리보기에 뜬다.
 *
 * ⚠ 못 가져오면 **사이트 이름으로 떨어진다.** 「알 수 없는 경기」 같은 말을 만들지 않는다.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ leagueSlug: string; matchId: string }>
}): Promise<Metadata> {
  const { leagueSlug, matchId } = await params
  const path = leagueMatchPath(leagueSlug, matchId)
  const match = await fetchForMetadata<{
    map?: { name?: string }
    league_clan?: { clan?: { name?: string } }
    opponent?: { clan?: { name?: string } }
    start_at?: string
  }>(`/leagues/${leagueSlug}/matches/${matchId}`)

  if (!match?.map?.name) return pageMetadata({ title: null, path })

  const ours = match.league_clan?.clan?.name
  const foe = match.opponent?.clan?.name
  /* 두 클랜을 다 알 때만 「A vs B」를 쓴다. 한쪽만 알면 그 줄을 만들지 않는다 */
  const versus = ours && foe ? `${ours} vs ${foe}` : null

  return pageMetadata({
    title: versus ? `${versus} · ${match.map.name}` : `${match.map.name} 경기`,
    description: versus ? `${match.map.name}에서 치른 클랜전 기록입니다.` : null,
    path,
  })
}

/** 빈 배열이다 — 경기가 수십만 건이라 미리 만들 목록이 없다. 빌드에서 DB 를 안 본다 */
export function generateStaticParams(): { leagueSlug: string; matchId: string }[] {
  return []
}

/** 목록에 없는 경기도 열린다. 첫 요청 때 만들어져 캐시된다 */
export const dynamicParams = true

export default function Page({
  params,
}: {
  params: Promise<{ leagueSlug: string; matchId: string }>
}) {
  return <MatchDetailPage params={params} />
}
