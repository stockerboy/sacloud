import { prisma } from '@sacloud/db'
import { EmailVerifyInput } from '@sacloud/contract'
import { badRequest, guard, ok } from '@/lib/server/respond'
import { jsonBody } from '@/lib/server/request'
import { consumeAuthToken } from '@/lib/server/queries/auth'

/** POST /api/auth/email/verify — 이메일 인증 */
export async function POST(request: Request) {
  return guard(async () => {
    const parsed = EmailVerifyInput.safeParse(await jsonBody(request))
    if (!parsed.success) return badRequest('입력값을 확인해주세요')

    const userId = await consumeAuthToken(parsed.data.token, 'email_verify')
    if (!userId) return badRequest('만료되었거나 유효하지 않은 링크입니다')

    await prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    })

    return ok({ ok: true })
  })
}
