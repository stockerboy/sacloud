import { forbidden, guard, ok } from '@/lib/server/respond'
import { requireAdmin } from '@/lib/server/session'
import {
  listClanMasterClaims,
  type ClanMasterClaimAdminStatus,
} from '@/lib/server/queries/clanMasterClaim'

/**
 * GET /api/admin/clan-master-claims — 클랜 마스터 인증 신청 목록 (D-253).
 *
 * 자동 검증이 불가능해 **사람이 사진을 보고 판단한다.** `PlayerLinkClaim`(D-121)과 같은 모양이다.
 *
 * ⚠ 사진 바이트는 여기에 실리지 않는다. 행마다 `image_url` 하나가 실리고,
 * 관리자가 펼친 행만 그 경로로 한 장씩 받는다 — 200건 × 3MB 를 한 번에 보내지 않는다.
 */
export async function GET(request: Request) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden()

    const status = new URL(request.url).searchParams.get('status')
    const valid: ClanMasterClaimAdminStatus[] = [
      'pending',
      'approved',
      'rejected',
      'cancelled',
      'revoked',
    ]
    const filter = valid.includes(status as ClanMasterClaimAdminStatus)
      ? (status as ClanMasterClaimAdminStatus)
      : undefined

    return ok(await listClanMasterClaims(filter))
  })
}
