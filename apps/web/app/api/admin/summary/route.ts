import { forbidden, guard, ok } from '@/lib/server/respond'
import { requireAdmin } from '@/lib/server/session'
import { adminSummary } from '@/lib/server/admin/queries'
import { recentAudit } from '@/lib/server/admin/audit'

/**
 * GET /api/admin/summary — 관리자 대시보드.
 *
 * **권한은 서버에서 판정한다** (정책 22). 화면에서 메뉴를 감추는 것은 보안이 아니다.
 */
export async function GET(request: Request) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const [summary, audit] = await Promise.all([adminSummary(), recentAudit(10)])
    return ok({ summary, audit })
  })
}
