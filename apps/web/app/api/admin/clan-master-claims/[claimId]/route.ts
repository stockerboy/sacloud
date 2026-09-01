import { badRequest, forbidden, guard, ok } from '@/lib/server/respond'
import { jsonBody, routeParam } from '@/lib/server/request'
import { requireAdmin } from '@/lib/server/session'
import {
  approveClanMasterClaim,
  rejectClanMasterClaim,
  revokeClanMasterClaim,
} from '@/lib/server/queries/clanMasterClaim'

/**
 * PATCH /api/admin/clan-master-claims/{claimId} — 승인 / 거부 / 되돌리기 (D-253).
 *
 * **클랜 설정 권한은 여기서만 생긴다.** 사용자 쪽 경로는 신청까지만 할 수 있다.
 * 세 동작 모두 `AdminAuditLog` 에 남는다.
 *
 * ── `revoke` 는 지우기가 아니다
 *   승인됐던 행을 `revoked` 로 바꾼다. 행을 지우면 **왜 권한이 있었는지**를 설명할 수 없다.
 */
export async function PATCH(request: Request, context: { params: Promise<{ claimId: string }> }) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden()

    const claimId = await routeParam(context, 'claimId')
    const body = (await jsonBody(request)) as { action?: unknown; note?: unknown } | null
    const action = typeof body?.action === 'string' ? body.action : ''
    const note = typeof body?.note === 'string' ? body.note : null

    if (action !== 'approve' && action !== 'reject' && action !== 'revoke') {
      return badRequest('action은 approve · reject · revoke 중 하나여야 합니다')
    }

    const input = { claimId, adminUserId: admin.id, adminEmail: admin.email, note }
    const result =
      action === 'approve'
        ? await approveClanMasterClaim(input)
        : action === 'reject'
          ? await rejectClanMasterClaim(input)
          : await revokeClanMasterClaim(input)

    if (!result.ok) return badRequest(result.message)
    return ok({ id: claimId, action, message: result.message })
  })
}
