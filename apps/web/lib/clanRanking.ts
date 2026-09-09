/**
 * ★클랜랭킹 순위 매기기★ — 화면에서 세운다 (2026-09-10 사장님 지시).
 *
 * > «여유되면 클랜랭킹까지 매기고 지금 클랜랭킹페이지에 클랜들이 그냥 나열만 돼있음»
 *
 * `/league/{slug}/rank/clan` 은 2026-09-02 지시(D-260)로 ★순위 없는 이름순 목록★ 이었다.
 * 사장님이 오늘 뒤집으셨다 — ★진짜 순위표★ 로 돌린다.
 *
 * ── 왜 서버가 아니라 여기서 세우나
 *   그 화면은 랭킹 API(`leagueRankClans`)가 아니라 참가 클랜 API(`leagueClans`)를 쓴다.
 *   랭킹 질의는 `placement: false` 로 걸러서 실측(2026-09-02) SPL 63곳 중 19곳,
 *   IPL 43곳 중 4곳이 ★통째로 빠진다.★ 사장님이 요구한 것은 「소속된 클랜 전부」다.
 *   그래서 ★목록은 다 받고 순위는 화면에서 매긴다.★ 계약도 API 도 건드리지 않는다.
 *
 * ── 정렬 규칙은 ★서버와 같은 것을 쓴다★
 *   `apps/web/lib/server/queries/leagues.ts` 의 `TIER_ORDER` · `RANK_ORDER` 와 같다.
 *   ```
 *   티어 리그(IPL)   division 오름차순 → rating 내림차순 → id 오름차순
 *   그 밖(SPL)       rating 내림차순 → id 오름차순
 *   ```
 *   `id` 는 언제나 마지막 타이브레이커다 — 없으면 같은 점수끼리 순서가 흔들린다.
 *
 * ── 티어 리그는 ★순위가 티어마다 1 부터★ 다
 *   > 사장님(2026-09-02 지시 #24 ⑤): "IPL 클랜 순위는 점수를 많이 받는다고 해도
 *   >  티어표를 넘나들 수는 없다. 1티어 순위가 먼저 보이고 경계 긋고 2티어 순위가 보이고 …
 *   >  ★티어별로 1,2,3,4… 등이 있는 것이다.★"
 *   그 말 그대로다. 티어를 안 쓰는 리그는 통째로 1..N 이다.
 *
 * ⚠ ★점수를 지어내지 않는다.★ 여기서 하는 일은 ★줄 세우기와 번호 붙이기★ 뿐이다.
 *   래더 값 자체는 API 가 준 것을 그대로 화면에 낸다.
 */

/** 순위를 매기는 데 실제로 읽는 값만. `LeagueClan` · `ClanRankRow` 둘 다 들어맞는다 */
export interface ClanRankInput {
  readonly id: string
  readonly division: number
  readonly rating: number
}

export interface ClanRankOptions {
  /**
   * 티어를 축으로 세울 것인가. `showsTier(slug)`(계약) 그대로 넘긴다 —
   * ★화면에서 리그 slug 를 비교하지 않는다★ (D-204).
   */
  byTier: boolean
}

/**
 * 점수순으로 세우고 순위 번호를 붙인다. ★원본 배열은 건드리지 않는다.★
 *
 * ⚠ ★목록을 다 받은 뒤에 부른다.★ 반쯤 받은 목록에 번호를 붙이면 그 번호가 거짓이 된다.
 *   화면(`ClanDirectory`)은 다 받을 때까지 표를 뼈대로 두고 있다.
 */
export function rankClans<T extends ClanRankInput>(
  clans: readonly T[],
  { byTier }: ClanRankOptions,
): (T & { rank: number })[] {
  const sorted = [...clans].sort((a, b) => {
    if (byTier && a.division !== b.division) return a.division - b.division
    if (a.rating !== b.rating) return b.rating - a.rating
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  /* 티어 리그는 티어가 바뀔 때마다 번호를 1 로 되돌린다 (지시 #24 ⑤) */
  let rank = 0
  let lastDivision: number | null = null
  return sorted.map((row) => {
    if (byTier && row.division !== lastDivision) rank = 0
    lastDivision = row.division
    rank += 1
    return { ...row, rank }
  })
}
