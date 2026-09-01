import { PAGE_SIZE } from '@sacloud/contract'
import { guardPublic, notFound, okPagePublic } from '@/lib/server/respond'
import { pageParams, routeParam } from '@/lib/server/request'
import { getLeagueClanPlayers } from '@/lib/server/queries/records'

/**
 * GET /api/leagues/{leagueSlug}/clans/{clanSlug}/players — 리그 참여 클랜원 목록 (커서, 20건)
 *
 * `[league]`는 계약상 **리그 슬러그**, `[clan]`은 계약상 **클랜 슬러그**다.
 * (같은 세그먼트를 리그 관리 API가 `:leagueClanId`로도 쓰므로 이름을 `[clan]`으로 통일했다.)
 */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guardPublic(request, 600, async () => {
    const leagueSlug = await routeParam(context, 'league')
    const clanSlug = await routeParam(context, 'clan')
    const { cursor, size } = pageParams(request, PAGE_SIZE.DEFAULT)
    const page = await getLeagueClanPlayers(leagueSlug, clanSlug, cursor, size)
    /* 기록 등급(기본 300초) — 참여 클랜원 명단은 공개 값이다 (D-240) */
    return page ? okPagePublic(page) : notFound('리그 클랜을 찾을 수 없습니다')
  })
}
