import { badRequest, forbidden, guard, ok } from '@/lib/server/respond'
import { requireAdmin } from '@/lib/server/session'
import { routeParam } from '@/lib/server/request'
import { adminSetApplicationStatus } from '@/lib/server/queries/leagueApplication'

/**
 * PATCH /api/admin/applications/{id}/status — 신청을 승인·반려한다 (2026-09-14).
 *
 * 신청을 ★지우지 않는다.★ `status` 만 움직인다 (0 대기 · 1 승인 · 2 반려).
 * 메모를 안 보내면 있던 메모를 지우지 않는다 — 안 보낸 것과 «지워라» 는 다르다.
 */
export async function PATCH(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const id = await routeParam(context, 'id')
    const body = (await request.json().catch(() => null)) as
      | { status?: unknown; admin_note?: unknown }
      | null
    if (body === null || typeof body.status !== 'number') return badRequest('상태를 보내 주세요')

    const result = await adminSetApplicationStatus({
      id,
      status: body.status,
      ...(body.admin_note === undefined
        ? {}
        : { adminNote: typeof body.admin_note === 'string' ? body.admin_note : null }),
      by: admin.id,
    })
    if (!result.ok) return badRequest(result.message)
    return ok({ id, status: body.status })
  })
}
