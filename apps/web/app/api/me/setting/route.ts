import { prisma } from '@sacloud/db'
import { MeSettingInput } from '@sacloud/contract'
import { badRequest, guard, ok, unauthorized } from '@/lib/server/respond'
import { jsonBody } from '@/lib/server/request'
import { currentUserId } from '@/lib/server/session'
import { toUser } from '@/lib/server/mappers'
import { USER_INCLUDE } from '@/lib/server/queries/auth'

/** PUT /api/me/setting — 내 정보 수정 (닉네임·아바타) */
export async function PUT(request: Request) {
  return guard(async () => {
    const userId = await currentUserId(request)
    if (!userId) return unauthorized()

    const parsed = MeSettingInput.safeParse(await jsonBody(request))
    if (!parsed.success) return badRequest('입력값을 확인해주세요')

    const user = await prisma.user.update({
      where: { id: userId },
      data: { nickname: parsed.data.nickname.trim(), avatarUrl: parsed.data.avatar_url },
      include: USER_INCLUDE,
    })

    return ok(toUser(user))
  })
}
