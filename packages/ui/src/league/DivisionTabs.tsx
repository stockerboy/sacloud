'use client'

import Link from 'next/link'

/**
 * 부리그 탭.
 *
 * 원본 실측 구조
 * ```
 * <div class="flex items-stretch text-lg mb-5">
 *   <a class="px-5 py-3 border rounded-l border-gray-300 item-active">1부리그</a>
 *   <a class="px-5 py-3 border-t border-r border-b rounded-r border-gray-300">2부리그</a>
 * ```
 * - 선택된 탭은 `item-active` — 배경 #374151 / 글자 #F3F4F6
 * - 첫 탭만 왼쪽 둥근 모서리, 마지막 탭만 오른쪽 둥근 모서리 (버튼 그룹)
 * - 첫 탭은 테두리 4면, 나머지는 왼쪽 테두리를 빼서 선이 겹치지 않게 한다
 * - `division_count === 1`(단일리그)이면 **탭 자체를 렌더하지 않는다**
 */
export function DivisionTabs({
  leagueSlug,
  divisionCount,
  current,
}: {
  leagueSlug: string
  divisionCount: number
  current: number
}) {
  if (divisionCount <= 1) return null

  return (
    <div className="mb-5 flex items-stretch text-lg">
      {Array.from({ length: divisionCount }, (_, index) => {
        const division = index + 1
        const first = index === 0
        const last = index === divisionCount - 1
        return (
          <Link
            key={division}
            href={`/league/${leagueSlug}/rank/clan/${division}`}
            className={[
              'px-5 py-3 border-line',
              first ? 'border rounded-l' : 'border-t border-r border-b',
              last ? 'rounded-r' : '',
              division === current ? 'bg-tab-active text-tab-active-fg' : '',
            ].join(' ')}
          >
            {division}부리그
          </Link>
        )
      })}
    </div>
  )
}
