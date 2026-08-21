import { prisma } from '@sacloud/db'
import { guard, ok } from '@/lib/server/respond'
import { clearSessionCookie, currentUserId } from '@/lib/server/session'

/**
 * POST /api/auth/logout
 *
 * 세션을 httpOnly 쿠키로 두기 때문에 **서버가 지워야 한다.** 스크립트로는 못 지운다.
 * 남아 있는 리프레시 토큰도 함께 폐기한다.
 *
 * 로그인하지 않은 상태로 호출해도 성공으로 답한다 — 실패로 답할 이유가 없다.
 */
export async function POST(request: Request) {
  return guard(async () => {
    const userId = await currentUserId(request)
    if (userId) {
      await prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    }
    await clearSessionCookie()
    return ok({ ok: true })
  })
}
