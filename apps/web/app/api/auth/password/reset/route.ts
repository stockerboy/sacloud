import { prisma } from '@sacloud/db'
import { hashSync } from 'bcryptjs'
import { PasswordResetInput } from '@sacloud/contract'
import { badRequest, guard, ok } from '@/lib/server/respond'
import { jsonBody } from '@/lib/server/request'
import { consumeAuthToken } from '@/lib/server/queries/auth'

/**
 * POST /api/auth/password/reset — 비밀번호 재설정
 *
 * 재설정에 성공하면 **기존 리프레시 토큰을 전부 폐기한다.**
 * 비밀번호를 바꾸는 상황은 계정이 털렸을 가능성을 포함하므로, 남아 있는 세션을 끊는다.
 */
export async function POST(request: Request) {
  return guard(async () => {
    const parsed = PasswordResetInput.safeParse(await jsonBody(request))
    if (!parsed.success) return badRequest('입력값을 확인해주세요')

    const userId = await consumeAuthToken(parsed.data.token, 'password_reset')
    if (!userId) return badRequest('만료되었거나 유효하지 않은 링크입니다')

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { passwordHash: hashSync(parsed.data.password, 10) },
      }),
      prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ])

    return ok({ ok: true })
  })
}
