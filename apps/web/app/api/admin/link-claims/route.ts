import { forbidden, guard, ok } from '@/lib/server/respond'
import { requireAdmin } from '@/lib/server/session'
import { listPlayerLinkClaims, type ClaimStatus } from '@/lib/server/queries/playerLink'

/**
 * GET /api/admin/link-claims — 계정 연동 신청 목록 (D-121).
 *
 * 자동 검증이 불가능해 사람이 판단한다. 여기서 근거를 보고 승인·거부한다.
 */
export async function GET(request: Request) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden()

    const status = new URL(request.url).searchParams.get('status')
    const valid: ClaimStatus[] = ['pending', 'approved', 'rejected', 'cancelled']
    const filter = valid.includes(status as ClaimStatus) ? (status as ClaimStatus) : undefined

    return ok(await listPlayerLinkClaims(filter))
  })
}
