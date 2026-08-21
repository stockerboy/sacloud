import { prisma } from '@sacloud/db'
import { compareSync } from 'bcryptjs'
import { LoginInput } from '@sacloud/contract'
import { badRequest, guard, ok, unauthorized } from '@/lib/server/respond'
import { jsonBody } from '@/lib/server/request'
import { startSession } from '@/lib/server/queries/auth'

/**
 * POST /api/auth/login
 *
 * 실패 메시지는 **아이디가 없는지 비밀번호가 틀린지 구분하지 않는다.**
 * 구분해서 알려주면 어떤 이메일이 가입돼 있는지 확인하는 데 쓰일 수 있다.
 */
export async function POST(request: Request) {
  return guard(async () => {
    const parsed = LoginInput.safeParse(await jsonBody(request))
    if (!parsed.success) return badRequest('입력값을 확인해주세요')

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
    if (!user || !compareSync(parsed.data.password, user.passwordHash)) {
      return unauthorized('이메일 또는 비밀번호가 올바르지 않습니다')
    }

    return ok(await startSession(user.id))
  })
}
