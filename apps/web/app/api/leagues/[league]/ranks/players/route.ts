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
    const page =
      weapon === 'all'
        ? await scoreOrLadder(leagueId, cursor, size)
        : await getPlayerRanksByWeapon(leagueId, weapon, cursor, size)
    /* 랭킹은 로그인과 무관하다 — 엣지가 대신 답한다 (D-223) */
    return page ? okPagePublic(page) : notFound('리그를 찾을 수 없습니다')
  })
}

async function scoreOrLadder(leagueId: string, cursor: string | null, size: number) {
  const scored = await getPlayerRanksByScore(leagueId, cursor, size)
  if (scored && (scored.items.length > 0 || cursor !== null)) return scored
  return getPlayerRanks(leagueId, cursor, size)
}
