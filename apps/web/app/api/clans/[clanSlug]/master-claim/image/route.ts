/**
 * 내가 낸 마스터 인증 스크린샷을 **나만** 다시 본다 (2026-09-01 · D-253).
 *
 * ── ⚠ 왜 계약(`packages/contract`)에 없나
 *   응답이 JSON 이 아니라 **바이트**라 `apiResponse(...)` 로 감쌀 수 없다.
 *   화면은 이 경로를 `<img src>` 에 그대로 물린다 (같은 출처라 쿠키가 함께 간다).
 *
 * ── 남의 사진은 나오지 않는다
 *   질의가 `claim.userId` 로 좁혀져 있다. 경로에 클랜 slug 만 있고 신청 id 가 없으므로
 *   **주소를 바꿔서 남의 것을 부를 수 없다.**
 *
 * ── 캐시하지 않는다
 *   개인 정보다. 엣지·브라우저 어디에도 남기지 않는다.
 */
import { guard, notFound, unauthorized } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { currentUserId } from '@/lib/server/session'
import { myClanMasterClaimImage } from '@/lib/server/queries/clanMasterClaim'

export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const userId = await currentUserId(request)
    if (!userId) return unauthorized()

    const clanSlug = await routeParam(context, 'clanSlug')
    const image = await myClanMasterClaimImage(userId, clanSlug)
    if (!image) return notFound('사진을 찾을 수 없습니다')

    return new Response(Buffer.from(image.data), {
      headers: {
        'content-type': image.mimeType,
        'content-length': String(image.byteSize),
        'cache-control': 'private, no-store',
        /* 브라우저가 형식을 다시 추측하지 못하게 막는다 */
        'x-content-type-options': 'nosniff',
      },
    })
  })
}
