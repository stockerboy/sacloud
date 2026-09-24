import { use } from 'react'
import { HEX_TOP_ON, HexTopScreen } from './HexTopScreen'

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
  /* 2026-09-25 사장님 「분야별 탑5도 없애」 — 주소는 살려 두고 화면만 닫는다 (`HEX_TOP_ON`) */
  if (!HEX_TOP_ON) return <div className="py-16 text-center text-sm text-meta">분야별 TOP5 는 지금 제공하지 않습니다.</div>
  return <HexTopScreen leagueSlug={leagueSlug} />
}
