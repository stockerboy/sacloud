import { PAGE_SIZE, parseRankWeapon } from '@sacloud/contract'
import { guardPublic, notFound, okPagePublic } from '@/lib/server/respond'
import { pageParams, query, routeParam } from '@/lib/server/request'
import { getPlayerRanks, resolveLeagueId } from '@/lib/server/queries/leagues'
import { getPlayerRanksByScore, getPlayerRanksByWeapon } from '@/lib/server/queries/rankings'

/**
 * GET /api/leagues/{leagueId}/ranks/players — 개인랭킹
 *
 * 계약은 이 자리를 **리그 ID**로 적지만 화면은 **슬러그**를 넘긴다.
 * `resolveLeagueId`가 둘 다 받는다. 랭킹은 20건 단위.
 *
 * `weapon=all|sniper|rifle` 로 무기 축을 고른다 (D-169, 원본에 없는 신규 기능).
 * 파라미터가 없거나 모르는 값이면 `all` — **기존 동작 그대로**다.
 * 통합은 기존 `getPlayerRanks`를 그대로 부른다. 무기 축을 더해도 통합 래더는 바뀌지 않는다.
 */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guardPublic(request, 600, async () => {
    const leagueId = await resolveLeagueId(await routeParam(context, 'league'))
    if (!leagueId) return notFound('리그를 찾을 수 없습니다')
    const { cursor, size } = pageParams(request, PAGE_SIZE.RANK)
    const weapon = parseRankWeapon(query(request, 'weapon'))
    /* ★통합 개인랭킹은 실력 점수 순★ (2026-09-10 · 사장님 확정). 점수 표가 비어 있으면
       (잡이 아직 안 돌았으면) 옛 래더 순으로 돌아간다 — 빈 화면을 내지 않는다 */
    /* ★무기 탭도 같은 순위(실력 점수)를 쓰고 그 무기만 거른다★ (2026-09-11 사장님).
       옛 방식(무기별 래더증감 순)은 RANK_BY_WEAPON_DELTA 로 되돌릴 수 있다 */
    const onlyWeapon = weapon === 'sniper' ? 1 : weapon === 'rifle' ? 0 : null
    /* ★구간 고르개★ (2026-09-11 사장님) — 1 ASTRA · 2 CHALLENGER1 · 3 CHALLENGER2.
       모르는 값이면 전체다 (지어내지 않는다). 옛 래더 순 길은 구간을 모르니 안 거른다 */
    const onlyTier = parseRankTier(query(request, 'tier'))
    /**
     * ★페이지 번호★ (2026-09-12 사장님: «개인랭킹은 페이지로 만들고싶어 (…) 쟤 1페야»).
     * 한 쪽에 20명(`PAGE_SIZE.RANK`). `page=1` 이 1~20위다.
     * 없거나 1보다 작으면 ★옛 커서 방식★ 으로 간다 — 다른 화면이 안 깨진다.
     */
    const offset = pageOffset(query(request, 'page'), size)
    const page =
      weapon === 'all' || !RANK_BY_WEAPON_DELTA
        ? await scoreOrLadder(leagueId, cursor, size, onlyWeapon, onlyTier, offset)
        : await getPlayerRanksByWeapon(leagueId, weapon, cursor, size)
    /* 랭킹은 로그인과 무관하다 — 엣지가 대신 답한다 (D-223) */
    return page ? okPagePublic(page) : notFound('리그를 찾을 수 없습니다')
  })
}

/** true 로 두면 옛 방식(무기 탭 = 무기별 래더증감 순)으로 돌아간다 (`CLAUDE.md` 1-4) */
const RANK_BY_WEAPON_DELTA = false

/** `page=1` → 0 · `page=3` → 40. 숫자가 아니거나 1보다 작으면 null (커서 방식) */
function pageOffset(raw: string | null, size: number): number | null {
  if (raw === null) return null
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) return null
  return (n - 1) * size
}

/** `tier=1|2|3` 만 받는다. 그 밖은 ★전체★ */
function parseRankTier(raw: string | null): 1 | 2 | 3 | null {
  return raw === '1' ? 1 : raw === '2' ? 2 : raw === '3' ? 3 : null
}

async function scoreOrLadder(
  leagueId: string,
  cursor: string | null,
  size: number,
  onlyWeapon: 0 | 1 | null = null,
  onlyTier: 1 | 2 | 3 | null = null,
  offset: number | null = null,
) {
  const scored = await getPlayerRanksByScore(leagueId, cursor, size, onlyWeapon, onlyTier, offset)
  /**
   * ★쪽 번호로 왔을 때는 「그 쪽이 비었나」가 아니라 「모두 몇 줄인가」로 고른다★
   * (2026-09-12).
   *
   * ⚠ 처음엔 «offset 이 있으면 무조건 점수 목록» 으로 뒀다가 ★10🏔 개인랭킹을 통째로
   *   비웠다.★ 10 은 실력 점수를 안 매기는 리그라 점수 표가 늘 비어 있고, 옛 래더로
   *   떨어져야 목록이 나온다. 3쪽이 비었다고 떨어뜨리면 1쪽과 3쪽이 딴 목록이 되니
   *   ★모집단 수★ 로 판단한다.
   */
  if (scored && offset !== null) {
    if (onlyTier !== null || (scored.total ?? 0) > 0) return scored
    return getPlayerRanks(leagueId, cursor, size, offset)
  }
  /* 구간을 골라서 비었으면 ★그게 답★ 이다 — 옛 래더 순으로 떨어지면 «전체» 가 튀어나온다 */
  if (scored && (scored.items.length > 0 || cursor !== null || onlyTier !== null)) return scored
  return getPlayerRanks(leagueId, cursor, size, offset)
}
