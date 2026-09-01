import { parseRankWeapon } from '@sacloud/contract'
import { notFound, okPublic, guard } from '@/lib/server/respond'
import { query, routeParam } from '@/lib/server/request'
import { resolveLeagueId } from '@/lib/server/queries/leagues'
import { getFormTop } from '@/lib/server/queries/rankings'

/**
 * GET /api/leagues/{leagueId}/ranks/form — 폼 TOP3 (D-169)
 *
 * **원본에 없는 우리 신규 기능**이다. 사용자가 명시적으로 지시했다.
 * 그날 하루(KST 자정 기준) 얻은 래더 증감의 합 상위 3명.
 * `weapon=all|sniper|rifle` 로 랭킹 탭과 같은 무기 축을 따라간다.
 */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const leagueId = await resolveLeagueId(await routeParam(context, 'league'))
    if (!leagueId) return notFound('리그를 찾을 수 없습니다')
    const form = await getFormTop(leagueId, parseRankWeapon(query(request, 'weapon')))
    /* 기록 등급(기본 300초) — 오늘자 폼이라 자주 변하지만 로그인과는 무관하다 (D-240) */
    return form ? okPublic(form) : notFound('리그를 찾을 수 없습니다')
  })
}
