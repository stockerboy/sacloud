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

/**
 * ★IPL 티어 이름★ (2026-09-10 · 사장님 확정).
 *
 * > «티어는 네개 Spectra Astra challenger1 challenger2» → 회의 중 SPECTRA 를 없애고
 * > ★셋으로 확정★ 했다. 사장님: «ㄴ맞다» (티어 이름을 이 셋으로 쓴다)
 *
 * 값의 단일 출처는 `apps/worker/src/lib/iplTiers.ts` 의 `TIER_NAME` 이다.
 * 화면 패키지가 worker 를 import 할 수 없어 ★같은 값을 여기 한 번 더 적는다★ —
 * 어긋나면 시험(`divisionLabel.test.ts`)이 잡는다.
 *
 * ⚠ ★번호를 새로 매기지 않는다.★ `LeagueClan.division` 이 그대로 1·2·3 이다.
 * ⚠ 모르는 번호는 ★지어내지 않고★ 옛 표기(`4티어`)로 떨어진다.
 */
const IPL_TIER_NAME: Readonly<Record<number, string>> = {
  1: 'ASTRA',
  2: 'CHALLENGER1',
  3: 'CHALLENGER2',
}

/**
 * `3티어` 처럼 완성된 표기.
 *
 * IPL(`independent`)은 2026-09-10 부터 ★이름을 쓴다★ — `ASTRA` · `CHALLENGER1` · `CHALLENGER2`.
 * 옛 표기(`1티어`)로 돌아가려면 아래 `IPL_TIER_NAMES_ON` 을 `false` 로 둔다 (`CLAUDE.md` 1-4).
 */
const IPL_TIER_NAMES_ON: boolean = true

export function divisionLabel(division: number, leagueCategory?: string): string {
  if (IPL_TIER_NAMES_ON && leagueCategory === 'independent') {
    const named = IPL_TIER_NAME[division]
    if (named) return named
  }
  return `${division}${divisionUnit(leagueCategory)}`
}

/** ★짧은 표기★ — 표의 좁은 칸에 쓴다 (`ASTRA` → `AST`) */
export function divisionShort(division: number, leagueCategory?: string): string {
  if (IPL_TIER_NAMES_ON && leagueCategory === 'independent') {
    if (division === 1) return 'AST'
    if (division === 2) return 'CH1'
    if (division === 3) return 'CH2'
  }
  return `${division}T`
}
