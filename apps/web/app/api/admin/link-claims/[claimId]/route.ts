import { badRequest, forbidden, guard, ok } from '@/lib/server/respond'
import { jsonBody } from '@/lib/server/request'
import { requireAdmin } from '@/lib/server/session'
import { routeParam } from '@/lib/server/request'
import {
  approvePlayerLinkClaim,
  rejectPlayerLinkClaim,
} from '@/lib/server/queries/playerLink'

/**
 * PATCH /api/admin/link-claims/{claimId} — 승인 / 거부 (D-121).
 *
 * 연결은 **여기서만** 생긴다. 사용자 쪽 경로는 신청까지만 할 수 있다.
 * 승인·거부는 전부 `AdminAuditLog`에 남는다.
 */
export async function PATCH(request: Request, context: { params: Promise<{ claimId: string }> }) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden()

    const claimId = await routeParam(context, 'claimId')
    const body = (await jsonBody(request)) as { action?: unknown; note?: unknown } | null
    const action = typeof body?.action === 'string' ? body.action : ''
    const note = typeof body?.note === 'string' ? body.note : null

    if (action !== 'approve' && action !== 'reject') {
      return badRequest('action은 approve 또는 reject여야 합니다')
    }

    const result =
      action === 'approve'
        ? await approvePlayerLinkClaim({
            claimId,
            adminUserId: admin.id,
            adminEmail: admin.email,
            note,
          })
        : await rejectPlayerLinkClaim({
            claimId,
            adminUserId: admin.id,
            adminEmail: admin.email,
            note,
          })

    if (!result.ok) return badRequest(result.message)
    return ok({ id: claimId, action, message: result.message })
  })
}
