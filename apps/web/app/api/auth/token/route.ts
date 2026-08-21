import { prisma } from '@sacloud/db'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { badRequest, guard, ok, unauthorized } from '@/lib/server/respond'
import { jsonBody } from '@/lib/server/request'
import { hashToken } from '@/lib/server/session'
import { startSession } from '@/lib/server/queries/auth'

/**
 * POST /api/auth/token — 토큰 갱신
 *
 * 쓴 리프레시 토큰은 **즉시 폐기한다**(rotation). 탈취된 토큰이 계속 쓰이는 것을 막는다.
 * 원본의 갱신 규칙은 `[미확인]` — 우리 계약으로 확정한 동작이다.
 */
const RefreshInput = z.object({ refresh_token: z.string().min(1) })

export async function POST(request: Request) {
  return guard(async () => {
    // 본문에 없으면 httpOnly 쿠키에서 찾는다. 브라우저 클라이언트는 토큰을 들고 있지 않다.
    const parsed = RefreshInput.safeParse(await jsonBody(request))
    const fromCookie = (await cookies()).get('sacloud_refresh')?.value
    const refreshToken = parsed.success ? parsed.data.refresh_token : fromCookie
    if (!refreshToken) return badRequest('입력값을 확인해주세요')

    const row = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
    })
    if (!row || row.revokedAt || row.expiresAt < new Date()) {
      return unauthorized('다시 로그인해주세요')
    }

    await prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    })

    return ok(await startSession(row.userId))
  })
}
