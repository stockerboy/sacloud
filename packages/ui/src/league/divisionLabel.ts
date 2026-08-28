/**
 * 부리그 칸의 **표기** (D-165).
 *
 * 값은 하나다 — `LeagueClan.division`. 부르는 이름만 리그 구분에 따라 갈린다.
 *
 * ```
 * 공식리그   division 1 → 1부리그
 * 무소속리그 division 1 → 1티어
 * ```
 *
 * 새 축을 만들지 않았기 때문에 클랜랭킹·개인랭킹·탭·커서 페이지네이션이 그대로 돈다.
 * **공식리그 표기는 절대 바뀌지 않는다** — 조건은 `category === 'independent'` 하나뿐이다.
 */

/** 리그 구분에 따른 division 단위 (`부리그` | `티어`) */
export function divisionUnit(leagueCategory?: string): string {
  return leagueCategory === 'independent' ? '티어' : '부리그'
}

/** `1부리그` · `3티어` 처럼 완성된 표기 */
export function divisionLabel(division: number, leagueCategory?: string): string {
  return `${division}${divisionUnit(leagueCategory)}`
}
