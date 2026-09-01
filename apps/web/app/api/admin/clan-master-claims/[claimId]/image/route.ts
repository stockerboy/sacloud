/**
 * GET /api/admin/clan-master-claims/{claimId}/image — 심사할 스크린샷 한 장 (D-253).
 *
 * **이 인증의 판정 근거는 이 사진 하나뿐이다.** 그래서 가공하지 않고 원본 바이트를 그대로 준다.
 *
 * ── ⚠ 왜 계약(`packages/contract`)에 없나
 *   응답이 JSON 이 아니라 바이트라 `apiResponse(...)` 로 감쌀 수 없다. 관리자 API 는
 *   원래 계약 레지스트리를 쓰지 않으므로(`app/admin/lib.ts` 의 `adminFetch`) 결이 어긋나지 않는다.
 *
 * ── 캐시하지 않는다. 개인 정보다
 */
import { forbidden, guard, notFound } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { requireAdmin } from '@/lib/server/session'
import { clanMasterClaimImage } from '@/lib/server/queries/clanMasterClaim'

export async function GET(request: Request, context: { params: Promise<{ claimId: string }> }) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden()

    const claimId = await routeParam(context, 'claimId')
    const image = await clanMasterClaimImage(claimId)
    if (!image) return notFound('사진을 찾을 수 없습니다')

    return new Response(Buffer.from(image.data), {
      headers: {
        'content-type': image.mimeType,
        'content-length': String(image.byteSize),
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    })
  })
}
