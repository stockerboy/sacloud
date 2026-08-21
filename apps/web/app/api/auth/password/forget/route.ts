import { prisma } from '@sacloud/db'
import { PasswordForgetInput } from '@sacloud/contract'
import { badRequest, guard, ok } from '@/lib/server/respond'
import { jsonBody } from '@/lib/server/request'
import { issueAuthToken } from '@/lib/server/queries/auth'

/**
 * POST /api/auth/password/forget — 비밀번호 재설정 메일 발송
 *
 * **가입되지 않은 이메일이어도 성공으로 응답한다.** 실패로 답하면 어떤 이메일이
 * 가입돼 있는지 확인하는 수단이 된다.
 *
 * 메일 발송은 아직 없다 (Phase 7 뒷부분). 토큰만 만들어 둔다.
 */
export async function POST(request: Request) {
  return guard(async () => {
    const parsed = PasswordForgetInput.safeParse(await jsonBody(request))
    if (!parsed.success) return badRequest('입력값을 확인해주세요')

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    })
    if (user) await issueAuthToken(user.id, 'password_reset', 60)

    return ok({ ok: true })
  })
}
