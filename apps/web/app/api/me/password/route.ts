import { prisma } from '@sacloud/db'
import { compareSync, hashSync } from 'bcryptjs'
import { MePasswordInput } from '@sacloud/contract'
import { badRequest, guard, ok, unauthorized } from '@/lib/server/respond'
import { jsonBody } from '@/lib/server/request'
import { currentUserId } from '@/lib/server/session'

/**
 * PUT /api/me/password — 비밀번호 변경
 *
 * 현재 비밀번호를 다시 확인한다. 세션만 가지고 바꿀 수 있으면,
 * 잠깐 자리를 비운 사이 계정을 빼앗길 수 있다.
 */
export async function PUT(request: Request) {
  return guard(async () => {
    const userId = await currentUserId(request)
    if (!userId) return unauthorized()

    const parsed = MePasswordInput.safeParse(await jsonBody(request))
    if (!parsed.success) return badRequest('입력값을 확인해주세요')

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user || !compareSync(parsed.data.current_password, user.passwordHash)) {
      return badRequest('현재 비밀번호가 올바르지 않습니다', {
        current_password: ['현재 비밀번호가 올바르지 않습니다'],
      })
    }

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hashSync(parsed.data.password, 10) },
    })

    return ok({ ok: true })
  })
}
