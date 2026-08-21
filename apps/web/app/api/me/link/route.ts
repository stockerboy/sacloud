import { prisma } from '@sacloud/db'
import { AccountLinkInput, type AccountLinkState } from '@sacloud/contract'
import { badRequest, guard, ok, unauthorized } from '@/lib/server/respond'
import { jsonBody } from '@/lib/server/request'
import { currentUserId } from '@/lib/server/session'
import { toKstIsoOrNull } from '@/lib/server/format'
import { toPlayerSummaryOrNull } from '@/lib/server/mappers'

/**
 * 서든어택 계정 연동.
 *
 * **원본의 실제 소유권 인증 방식은 `[미확인]`이다.**
 * (닉네임 입력 후 검증 코드 방식으로 추정되나 확인되지 않았다.)
 * 여기서는 닉네임으로 플레이어를 찾아 연결만 한다 — **소유권을 증명하지 않는다.**
 * 실제 소유권 인증은 `docs/POST_V1_REQUIREMENTS.md`의 소유권 인증 항목에서 다룬다.
 * 그때까지 이 엔드포인트를 운영에 노출하면 안 된다.
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

/** PUT /api/me/link — 연동 */
export async function PUT(request: Request) {
  return guard(async () => {
    const userId = await currentUserId(request)
    if (!userId) return unauthorized()

    const parsed = AccountLinkInput.safeParse(await jsonBody(request))
    if (!parsed.success) return badRequest('입력값을 확인해주세요')

    const player = await prisma.player.findFirst({
      where: { name: parsed.data.player_name },
      select: { id: true },
    })
    if (!player) return badRequest('해당 닉네임의 플레이어를 찾을 수 없습니다')

    // 한 플레이어는 한 계정에만 연결된다 (스키마의 유니크 제약)
    const taken = await prisma.userPlayerLink.findUnique({
      where: { playerId: player.id },
      select: { userId: true },
    })
    if (taken && taken.userId !== userId) {
      return badRequest('이미 다른 계정에 연동된 플레이어입니다')
    }

    await prisma.userPlayerLink.upsert({
      where: { userId },
      create: { userId, playerId: player.id },
      update: { playerId: player.id, verifiedAt: new Date() },
    })

    return ok(await linkState(userId))
  })
}

/**
 * DELETE /api/me/link — 연동 해제
 *
 * 계약에는 없다. 원본에 해제 기능이 있는지 `[미확인]`.
 * 연동 실수를 되돌릴 수단이 없으면 곤란해서 넣어 두되, **화면에서는 아직 쓰지 않는다.**
 */
export async function DELETE(request: Request) {
  return guard(async () => {
    const userId = await currentUserId(request)
    if (!userId) return unauthorized()
    await prisma.userPlayerLink.deleteMany({ where: { userId } })
    return ok(await linkState(userId))
  })
}
