import { fail, guard, ok } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { playerReportCount, reportPlayer } from '@/lib/server/queries/playerReports'

/** 핵의심 신고 수 — 공개 (2026-09-10) */
export async function GET(_request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const playerId = await routeParam(context, 'playerId')
    return ok({ count: await playerReportCount(playerId) })
  })
}

/** 핵의심 신고 — 로그인한 회원만 · 회원당 선수당 하루 한 번 (2026-09-10) */
export async function POST(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const playerId = await routeParam(context, 'playerId')
    const result = await reportPlayer(request, playerId)
    return result.ok ? ok({ count: result.count }) : fail(result.status, result.message)
  })
}
