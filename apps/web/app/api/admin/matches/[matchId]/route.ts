import { prisma } from '@sacloud/db'
import { badRequest, forbidden, guard, notFound, ok } from '@/lib/server/respond'
import { jsonBody, routeParam } from '@/lib/server/request'
import { requireAdmin } from '@/lib/server/session'
import { adminMatchDetail } from '@/lib/server/admin/queries'
import { writeAudit } from '@/lib/server/admin/audit'

/** GET /api/admin/matches/{matchId} — 경기 상세 (참가자·역할·래더 적용 상태) */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const matchId = await routeParam(context, 'matchId')
    const match = await adminMatchDetail(matchId)
    return match ? ok(match) : notFound('경기를 찾을 수 없습니다')
  })
}

/**
 * PATCH /api/admin/matches/{matchId} — 공식/비공식 상태 수정.
 *
 * 잘못 인식된 경기를 운영자가 바로잡기 위한 것이다 (정책 18).
 *
 * **공식 → 비공식**은 바로 된다(통계에서 빼는 방향이라 안전하다).
 * **비공식 → 공식**은 `reason`을 반드시 적어야 한다 — 근거 없이 통계에 넣지 않기 위해서다.
 * 어느 쪽이든 바꾸면 `nexon:rate`를 다시 돌려야 래더에 반영된다.
 */
export async function PATCH(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const matchId = await routeParam(context, 'matchId')
    const body = (await jsonBody(request)) as { official?: boolean; reason?: string }
    if (body.official === undefined) return badRequest('official 값이 필요합니다')

    const before = await prisma.match.findUnique({
      where: { id: matchId },
      select: { id: true, official: true, origin: true, sourceMatchId: true },
    })
    if (!before) return notFound('경기를 찾을 수 없습니다')

    if (body.official === true && !body.reason?.trim()) {
      return badRequest('비공식 경기를 공식으로 바꾸려면 근거(reason)를 적어야 합니다')
    }

    const after = await prisma.match.update({
      where: { id: matchId },
      data: { official: body.official },
      select: { id: true, official: true },
    })
    await writeAudit({
      user: admin,
      action: 'match.official',
      targetType: 'match',
      targetId: matchId,
      before,
      after,
      note: body.reason?.trim(),
    })
    return ok(after)
  })
}
