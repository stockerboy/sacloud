import { PAGE_SIZE } from '@sacloud/contract'
import { guardPublic, notFound, okPagePublic } from '@/lib/server/respond'
import { intQuery, pageParams, routeParam } from '@/lib/server/request'
import { getClanRanks, resolveLeagueId } from '@/lib/server/queries/leagues'

/**
 * GET /api/leagues/{leagueId}/ranks/clans?division=N — 클랜랭킹
 *
 * 계약은 이 자리를 **리그 ID**로 적지만, 화면은 **슬러그**를 넣어 호출한다.
 * `resolveLeagueId`가 둘 다 받는다 (`queries/leagues.ts` 주석 참조).
 * 랭킹은 20건 단위 (원본 관측값).
 *
 * `division` 을 **0(또는 음수)** 으로 주면 부리그를 나누지 않고 전체를 한 줄로 준다
 * (2026-09-01 사용자 지시 — SPL·IPL 합친 랭킹 화면이 쓴다).
 * 무소속리그는 그때 티어 오름차순을 유지한다. 자세한 것은 `getClanRanks` 주석.
 * **파라미터가 없으면 예전 그대로 1부리그다.** 기존 호출자를 깨지 않는다.
 */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guardPublic(request, 600, async () => {
    const leagueId = await resolveLeagueId(await routeParam(context, 'league'))
    if (!leagueId) return notFound('리그를 찾을 수 없습니다')
    const division = intQuery(request, 'division', 1)
    const { cursor, size } = pageParams(request, PAGE_SIZE.RANK)
    const page = await getClanRanks(leagueId, division, cursor, size)
    /* 랭킹은 로그인과 무관하다 — 엣지가 대신 답한다 (D-223) */
    return page ? okPagePublic(page) : notFound('리그를 찾을 수 없습니다')
  })
}
