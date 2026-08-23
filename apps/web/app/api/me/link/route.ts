import { prisma } from '@sacloud/db'
import { AccountLinkInput, type AccountLinkState } from '@sacloud/contract'
import { badRequest, guard, ok, unauthorized } from '@/lib/server/respond'
import { jsonBody } from '@/lib/server/request'
import { currentUserId } from '@/lib/server/session'
import { toKstIsoOrNull } from '@/lib/server/format'
import { toPlayerSummaryOrNull } from '@/lib/server/mappers'
import { cancelPlayerLinkClaim, requestPlayerLink } from '@/lib/server/queries/playerLink'

/**
 * 서든어택 계정 연동 (D-121).
 *
 * ── 예전 구조의 문제
 *   닉네임만 넣으면 그 선수가 곧바로 계정에 붙었다. 닉네임은 공개 정보이므로
 *   **먼저 입력한 사람이 임자**였고, 랭킹 상위 선수의 신원을 아무나 선점할 수 있었다.
 *
 * ── 지금
 *   `PUT`은 **신청만** 받는다. 연결은 운영자가 승인할 때 생긴다.
 *   넥슨 Open API에는 사용자가 계정 소유를 증명할 수단이 없다(전부 공개 조회다).
 *   확인할 수 없는 것을 확인한 척하지 않기 위해, 자동 검증 대신 사람이 판단한다.
 */

async function linkState(userId: string): Promise<AccountLinkState> {
  const link = await prisma.userPlayerLink.findUnique({
    where: { userId },
    include: { player: true },
  })
  return {
    linked: link !== null,
    player: toPlayerSummaryOrNull(link?.player),
    linked_at: toKstIsoOrNull(link?.verifiedAt),
  }
}

/** GET /api/me/link — 연동 상태 */
export async function GET(request: Request) {
  return guard(async () => {
    const userId = await currentUserId(request)
    if (!userId) return unauthorized()
    return ok(await linkState(userId))
  })
}

/**
 * PUT /api/me/link — 연동 **신청**
 *
 * 성공해도 `linked`는 아직 `false`다. 운영자 승인 전까지 연결되지 않는다.
 */
export async function PUT(request: Request) {
  return guard(async () => {
    const userId = await currentUserId(request)
    if (!userId) return unauthorized()

    const body = await jsonBody(request)
    const parsed = AccountLinkInput.safeParse(body)
    if (!parsed.success) return badRequest('입력값을 확인해주세요')

    const evidence =
      body !== null && typeof body === 'object' && 'evidence' in body
        ? String((body as { evidence?: unknown }).evidence ?? '')
        : null

    const result = await requestPlayerLink({
      userId,
      playerName: parsed.data.player_name,
      evidence,
    })
    if (!result.ok) return badRequest(result.message)

    return ok({ ...(await linkState(userId)), pending: true, message: result.message })
  })
}

/**
 * DELETE /api/me/link — 연동 해제 / 신청 취소
 *
 * 연결돼 있으면 해제하고, 대기 중인 신청만 있으면 그 신청을 취소한다.
 */
export async function DELETE(request: Request) {
  return guard(async () => {
    const userId = await currentUserId(request)
    if (!userId) return unauthorized()
    await prisma.userPlayerLink.deleteMany({ where: { userId } })
    await cancelPlayerLinkClaim(userId)
    return ok(await linkState(userId))
  })
}
