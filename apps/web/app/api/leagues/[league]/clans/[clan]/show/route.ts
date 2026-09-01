import { guardPublic, notFound, okPublic } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { getLeagueClanShow } from '@/lib/server/queries/records'

/**
 * GET /api/leagues/{leagueSlug}/clans/{clanSlug}/show — 리그 내 클랜 상세
 *
 * 경로 파라미터 이름
 *   `[league]`는 계약상 **리그 슬러그**, `[clan]`은 계약상 **클랜 슬러그**다.
 *   계약은 같은 자리에 `:clanSlug`(클랜 상세)와 `:leagueClanId`(리그 관리)를 섞어 쓰는데,
 *   Next는 한 세그먼트에 서로 다른 이름의 동적 라우트를 둘 수 없다.
 *   그래서 이름을 하나로 통일하고 **핸들러마다 계약대로 해석한다.**
 */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guardPublic(request, 600, async () => {
    const leagueSlug = await routeParam(context, 'league')
    const clanSlug = await routeParam(context, 'clan')
    const detail = await getLeagueClanShow(leagueSlug, clanSlug)
    /* 가장 무거운 공개 화면이다 (운영 1.2~1.7초). 엣지가 대신 답한다 (D-223) */
    return detail ? okPublic(detail) : notFound('리그 클랜을 찾을 수 없습니다')
  })
}
