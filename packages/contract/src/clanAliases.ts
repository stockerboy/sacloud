/**
 * 클랜 별칭 — **평소 부르는 이름으로도 클랜을 찾는다.**
 *
 * 사용자가 손으로 적어 준 표다 (2026-09-01). 원본은 `data/clan/clan-aliases.json`,
 * 그것을 구워 낸 상수가 `clanAliasTable.ts` 다. 이 파일은 그 표를 **찾기 좋게** 만든다.
 *
 * ```
 * 베리타스 → 01025606089  (이름은 〃veritas)
 * 미라지   → lpcrew       (이름은 MiraGe.)
 * 원포     → Onepoint     (이름은 One.PoinT)
 * ```
 *
 * ── 왜 필요한가
 *   클랜명에는 특수문자와 장식이 많아서(`〃veritas` · `MiraGe.`) **화면에 보이는 이름과
 *   사람들이 부르는 이름이 다르다.** 로마자→한글 읽기(`clanSearch.ts`)로도 못 넘는 벽이
 *   있다 — `lpcrew` 를 「미라지」로 읽어 낼 방법은 없다. 그건 발음이 아니라 **호칭**이다.
 *
 * ── 별칭도 이름과 **똑같은 규칙**으로 대조한다
 *   `clanSearch.ts` 의 대조기를 그대로 태운다. 별칭이 로마자일 수 있기 때문이다
 *   (`rz` · `wct` 가 실제로 표에 있다). 그래서 `rz` 는 물론 「알제트」로도 걸린다.
 *
 * ── 별칭 일치는 **이름 일치보다 뒤**다
 *   `미라지` 로 쳤을 때 이름 자체가 `미라지` 인 클랜이 있으면 그쪽이 먼저 나온다.
 *   순위 값은 `clanSearch.ts` 의 `ALIAS_RANK_OFFSET` 이 만든다.
 *
 * ── 표에 없는 클랜은 **그대로다**
 *   별칭은 **더하는 것**이지 거르는 것이 아니다. 별칭이 없으면 지금까지와 똑같이
 *   이름·slug·한글 읽기로 찾는다.
 */

import { CLAN_ALIAS_ENTRIES } from './clanAliasTable'
import { searchClanNames } from './clanSearch'

export {
  CLAN_ALIAS_ENTRIES,
  CLAN_ALIAS_NOTE,
  CLAN_ALIAS_SOURCE,
  /**
   * 「활동 안 함」 표시 목록. **읽을 수만 있다 — 아무 데서도 쓰지 않는다.**
   * 무엇을 할지는 사용자가 정한다 (`clanAliasTable.ts` 주석 참조).
   */
  CLAN_INACTIVE_KEYS,
} from './clanAliasTable'

/**
 * `클랜slug` → 별칭들.
 *
 * 원본 표의 열쇠는 `리그slug/클랜slug` 인데 `Clan.slug` 는 전역 유일이라
 * **리그 앞머리는 찾기에 쓰지 않는다.** 같은 클랜이 두 리그에 적혀 있으면
 * (실제로 `friendliness1` 이 `supply` · `nolink` 양쪽에 있다) 별칭을 **합친다.**
 */
export const CLAN_ALIASES_BY_SLUG: ReadonlyMap<string, readonly string[]> = (() => {
  const map = new Map<string, string[]>()
  for (const [key, aliases] of Object.entries(CLAN_ALIAS_ENTRIES)) {
    /* `리그slug/클랜slug` — 클랜 slug 에 `/` 가 들어갈 일은 없지만, 있어도 안 깨지게 뒤를 다 붙인다 */
    const slug = key.slice(key.indexOf('/') + 1)
    if (!slug) continue
    const bucket = map.get(slug) ?? []
    for (const alias of aliases) if (!bucket.includes(alias)) bucket.push(alias)
    map.set(slug, bucket)
  }
  return map
})()

/** 이 클랜의 별칭들. 없으면 **빈 배열** (`undefined` 를 흘리지 않는다) */
export function clanAliasesOf(clanSlug: string | null | undefined): readonly string[] {
  if (!clanSlug) return EMPTY
  return CLAN_ALIASES_BY_SLUG.get(clanSlug) ?? EMPTY
}

const EMPTY: readonly string[] = []

/**
 * 표의 크기 — 숫자로 보고할 때 쓴다.
 *
 * `aliases`(120) 와 `aliasesBySlug`(119) 가 하나 다르다. 틀린 게 아니라
 * **`friendliness1` 이 두 리그에 같은 별칭(`리센트`)으로 적혀 있어서** 합칠 때 하나가 준 것이다.
 * 둘 다 남겨 둔다 — 「사용자가 적은 개수」와 「찾기에 쓰이는 개수」는 서로 다른 숫자다.
 */
export const CLAN_ALIAS_COUNTS = {
  /** 원본 표의 줄 수 (`리그slug/클랜slug` 기준) */
  entries: Object.keys(CLAN_ALIAS_ENTRIES).length,
  /** 사용자가 적은 별칭의 총 개수 (합치기 전) */
  aliases: Object.values(CLAN_ALIAS_ENTRIES).reduce((sum, list) => sum + list.length, 0),
  /** 클랜 수 (같은 클랜이 두 리그에 있으면 하나로 센다) */
  clans: CLAN_ALIASES_BY_SLUG.size,
  /** 합친 뒤의 별칭 개수 */
  aliasesBySlug: [...CLAN_ALIASES_BY_SLUG.values()].reduce((sum, list) => sum + list.length, 0),
} as const

interface AliasRow {
  slug: string
  aliases: readonly string[]
}

/** 별칭 표를 목록 꼴로 한 번만 펴 둔다 (검색마다 다시 만들지 않는다) */
const ALIAS_ROWS: readonly AliasRow[] = [...CLAN_ALIASES_BY_SLUG].map(([slug, aliases]) => ({
  slug,
  aliases,
}))

/**
 * 검색어에 **별칭이 걸리는 클랜 slug 들**. 잘 맞는 순서다.
 *
 * DB 는 별칭을 모른다(별칭 표는 코드 안에 있다). 그래서 서버 검색은
 *   ① 지금까지 하던 이름·slug 부분일치를 그대로 하고
 *   ② 여기서 나온 slug 들을 **덧붙인다**
 * 는 두 단계로 만든다. 기존 결과는 하나도 사라지지 않는다.
 *
 * 이름은 대조에 넣지 않는다 — 이름은 DB 가 이미 보고 있고, 여기서는 **별칭만** 본다.
 */
export function clanSlugsByAlias(query: string, limit = 20): string[] {
  if (!query.trim()) return []
  /*
   * `nameOf` 에 빈 문자열을 주면 «이름은 아무것도 아니다» 가 되어 별칭만 남는다.
   * (빈 이름은 어떤 검색어와도 안 맞는다 — `rankOf` 가 NONE 을 낸다)
   */
  return searchClanNames(
    [...ALIAS_ROWS],
    query,
    () => '',
    (row) => row.aliases,
  )
    .slice(0, limit)
    .map((row) => row.slug)
}
