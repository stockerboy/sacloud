import { badRequest, forbidden, guard, ok } from '@/lib/server/respond'
import { requireAdmin } from '@/lib/server/session'
import { adminSetUserRole } from '@/lib/server/admin/users'

/**
 * PATCH /api/admin/users/{userId}/role — 운영자 권한 올리기·내리기 (2026-09-13).
 *
 * 본문은 `{ role: 0 | 2 }`. 그 외 값은 400 이다 — `codes.ts` 에 다른 값의 뜻이 [미확인]이라
 * 지어내지 않는다.
 *
 * 자기 자신을 내리는 것과 마지막 운영자를 내리는 것은 `adminSetUserRole` 이 막는다.
 * 변경은 전부 `AdminAuditLog` 에 남는다 (정책 23).
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const { userId } = await context.params
    const body = (await request.json().catch(() => null)) as { role?: unknown } | null
    const role = typeof body?.role === 'number' ? body.role : Number.NaN
    if (!Number.isFinite(role)) return badRequest('role 이 필요합니다')

    const result = await adminSetUserRole({ actor: admin, userId, role })
    if (!result.ok) return badRequest(result.message)
    return ok({ role: result.role })
  })
}
