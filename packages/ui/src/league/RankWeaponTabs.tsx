'use client'

import { RANK_WEAPON_LABEL, type RankWeapon } from '@sacloud/contract'

/**
 * 개인랭킹 무기 탭 — `통합 / 스나 / 라플` (D-169).
 *
 * **원본 3rd.supply 에는 없는 우리 신규 기능**이다 (사용자 지시).
 * 그래서 **모양은 새로 만들지 않고 부리그 탭(`DivisionTabs`)의 것을 그대로 따른다.**
 * 클래스 문자열이 한 글자도 다르지 않아야 한다 — 같은 화면에 두 가지 탭 디자인이
 * 생기면 그때부터 "임의 디자인 변경"이다 (`CLAUDE.md` 3장 2번).
 *
 * 부리그 탭과 다른 점은 하나뿐이다: 부리그는 라우트가 나뉘어 `<Link>` 지만
 * 무기 축은 같은 화면 안에서 목록만 바뀌므로 `<button>` 이다.
 * (탭 이름은 사용자가 쓴 말 그대로 — 번역하거나 "개선"하지 않는다)
 */

const TABS: readonly RankWeapon[] = ['all', 'sniper', 'rifle']

export function RankWeaponTabs({
  current,
  onChange,
}: {
  current: RankWeapon
  onChange: (weapon: RankWeapon) => void
}) {
  return (
    <div className="mobile-scroll-x mb-5 flex items-stretch text-lg">
      {TABS.map((weapon, index) => {
        const first = index === 0
        const last = index === TABS.length - 1
        return (
          <button
            key={weapon}
            type="button"
            onClick={() => onChange(weapon)}
            aria-pressed={weapon === current}
            className={[
              /* 아래 값은 `DivisionTabs` 와 **완전히 같다.** 근거도 그쪽 주석에 있다 */
              'shrink-0 whitespace-nowrap px-5 py-3 border-line max-md:px-3.5 max-md:py-2 max-md:text-base',
              first ? 'border rounded-l' : 'border-t border-r border-b',
              last ? 'rounded-r' : '',
              weapon === current ? 'bg-tab-active text-tab-active-fg' : '',
            ].join(' ')}
          >
            {RANK_WEAPON_LABEL[weapon]}
          </button>
        )
      })}
    </div>
  )
}
