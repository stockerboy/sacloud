import { guard, notFound, ok } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { getLeaguePlayerDetail } from '@/lib/server/queries/records'

/**
 * GET /api/leagues/{leagueSlug}/players/{playerId} — 리그 내 플레이어 상세 (기록실 상단 요약 포함)
 *
 * 여기서 `[league]`는 계약상 **리그 슬러그**다.
 * (바로 아래 `matches`는 계약상 `:leagueId`라 해석이 다르다 — 핸들러마다 계약대로 읽는다.)
 */
export async function GET(_request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const leagueSlug = await routeParam(context, 'league')
    const playerId = await routeParam(context, 'playerId')
    const detail = await getLeaguePlayerDetail(leagueSlug, playerId)
    return detail ? ok(detail) : notFound('리그 플레이어를 찾을 수 없습니다')
  })
}
