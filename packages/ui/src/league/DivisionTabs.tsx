'use client'

import Link from 'next/link'
import { showsDivision } from '@sacloud/contract'
import { divisionLabel } from './divisionLabel'
import { TAB, TAB_ACTIVE, TAB_IDLE, TAB_ROW } from './rankStyles'

/**
 * 부리그 탭.
 *
 * 모양은 `적진` 팔레트 규칙을 따른다 — **면을 칠하지 않고 밑줄로만 표시한다.**
 * 선택된 탭에만 빨강(`--color-accent`) 밑줄 2px 이 들어간다. 그것이 이 화면에서
 * 빨강을 쓰는 자리다. 예전에는 선택된 탭 전체를 회색으로 칠했었다.
 *
 * - `division_count === 1`(단일리그)이면 **탭 자체를 렌더하지 않는다**
 * - **이동 경로(href)는 바뀌지 않았다.** 모양만 바꿨다
 *
 * 무소속리그는 같은 탭을 `1티어 … 5티어` 로 **표기만** 바꿔 쓴다 (D-165).
 * 탭이 5개면 좁은 화면에서 한 줄에 들어가지 않으므로 **탭 줄 안에서만** 가로로 민다
 * (`.mobile-scroll-x` — 본문은 밀리지 않는다).
 */
export function DivisionTabs({
  leagueSlug,
  divisionCount,
  current,
  leagueCategory,
}: {
  leagueSlug: string
  divisionCount: number
  current: number
  /** `official` | `independent` — 표기만 바꾼다 (D-165). 없으면 공식리그 표기 */
  leagueCategory?: string
}) {
  /* 부리그를 화면에 내지 않는 리그(지시 #9 · D-265 ③)도 단일리그와 같이 탭이 없다.
     규칙은 `@sacloud/contract` 의 `leagueScreen` 한 곳에 있다 — 여기서 slug 를 비교하지 않는다 */
  if (divisionCount <= 1 || !showsDivision(leagueSlug)) return null

  return (
    <div className={TAB_ROW}>
      {Array.from({ length: divisionCount }, (_, index) => {
        const division = index + 1
        return (
          <Link
            key={division}
            href={`/league/${leagueSlug}/rank/clan/${division}`}
            className={`${TAB} ${division === current ? TAB_ACTIVE : TAB_IDLE}`}
          >
            {divisionLabel(division, leagueCategory)}
          </Link>
        )
      })}
    </div>
  )
}
