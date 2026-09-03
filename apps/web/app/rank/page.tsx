import type { Metadata } from 'next'
import { getUnifiedRanks } from '@/lib/server/queries/unifiedRank'
import { pageMetadata } from '@/lib/server/pageMetadata'
import { UnifiedRankTable } from './UnifiedRankTable'

/**
 * **통합 랭킹** `/rank` (O-043 · 2026-09-03).
 *
 * > 사장님: «순위 자체는 만들어라 **화면도 만들어라**»
 *
 * ══ 왜 리그 탭 안이 아닌가 ══
 *
 * ★통합은 리그별이 아니다.★ 리그 탭(`/league/{slug}/...`)에 넣으면
 * 「어느 리그의 통합인가」라는 말이 안 되는 물음이 생긴다. 그래서 리그 밖에 둔다.
 *
 * ⚠ ★아직 어디서도 링크하지 않는다.★ 홈은 굳어 있고(`force-static`) 사장님 시안이
 *   따로 있다. **들어가는 길은 A 와 정한다** — 주소를 치면 열린다.
 *
 * ══ 굳힌다 ══
 *
 * 통합 순위는 사람마다 다르지 않다. ★모두에게 같은 한 장★ 이라 굳혀서 엣지가 받아 낸다.
 */
export const dynamic = 'force-static'
export const revalidate = 3600

export function generateMetadata(): Metadata {
  return pageMetadata({
    title: '통합 랭킹',
    description: '리그별 등수를 권위 무게로 합친 순위입니다.',
    path: '/rank',
  })
}

export default async function UnifiedRankPage() {
  const rows = await getUnifiedRanks(100)
  return (
    <div className="mx-auto w-full max-w-[var(--layout-max,1120px)] px-5 pb-[var(--section-gap,40px)] max-md:px-3">
      <UnifiedRankTable rows={rows} />
    </div>
  )
}
