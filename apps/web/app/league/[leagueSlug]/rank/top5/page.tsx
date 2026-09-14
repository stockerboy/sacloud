import { use } from 'react'
import { HexTopScreen } from './HexTopScreen'

/**
 * `/league/{slug}/rank/top5` — ★분야별 TOP5★ (2026-09-14 사장님:
 * «추가로 페이지 하나 더 만들자 여기서는 클랜 , 개인6각 top5 보여주자 각 분야별 top5»).
 *
 * 랭킹 탭과 나란히 서는 ★따로 있는 화면★ 이다. 랭킹은 종합 등수를,
 * 여기는 분야별 다섯 손가락을 말한다.
 */
export default function LeagueHexTopPage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>
}) {
  const { leagueSlug } = use(params)
  return <HexTopScreen leagueSlug={leagueSlug} />
}
