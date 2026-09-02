/**
 * 등급 칸의 **표기** — 이제 「N티어」 하나뿐이다 (2026-09-02 사장님 지시 #23).
 *
 * > "1부 2부 라는 표현을 이제 아예 안 쓴다. IPL만 1,2,3,4,5,6티어 라는 단어를 쓰고
 * >  spl은 티어도 없고 1,2부도 아예 없다."
 *
 * 값은 하나다 — `LeagueClan.division`. 어느 리그가 이 표기를 **보여 주는가**는 계약의
 * `showsTier(slug)` 가 정하고(IPL 만), 여기는 보여 줄 때의 **글자**만 만든다.
 *
 * ── ⚠ 옛 규칙 (D-165 · 2026-09-02 오전까지)
 *   공식리그는 `N부리그`, 무소속리그(`category === 'independent'`)는 `N티어` 였다.
 *   그 분기는 아래 `LEGACY_DIVISION_WORDING` 에 남겨 뒀다 (`CLAUDE.md` 10-4) — 켜면 옛 글자가 돌아온다.
 *   `leagueCategory` 인자는 그때의 흔적이다. 호출부를 안 깨려고 받기만 하고, 지금은 보지 않는다.
 */

/**
 * 옛 표기 스위치. `true` 면 D-165 규칙(공식 `부리그` · 무소속 `티어`)으로 돌아간다.
 * 타입을 `boolean` 으로 넓혀 둔 이유는 리터럴로 좁히면 아래 옛 가지가 «닿을 수 없는 코드» 가 되기 때문이다.
 */
const LEGACY_DIVISION_WORDING: boolean = false

/** 등급 단위 — 지금은 언제나 `티어` */
export function divisionUnit(leagueCategory?: string): string {
  if (LEGACY_DIVISION_WORDING) return leagueCategory === 'independent' ? '티어' : '부리그'
  return '티어'
}

/** `3티어` 처럼 완성된 표기 */
export function divisionLabel(division: number, leagueCategory?: string): string {
  return `${division}${divisionUnit(leagueCategory)}`
}
