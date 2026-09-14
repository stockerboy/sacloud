import { forbidden, guard, ok } from '@/lib/server/respond'
import { requireAdmin } from '@/lib/server/session'
import { adminApplicationList } from '@/lib/server/queries/leagueApplication'

/**
 * GET /api/admin/applications — 참가 신청 목록 (2026-09-14 사장님:
 * «신청방식은 내가 관리자 대시보드에서 볼 수 있게 해줘»).
 *
 * **권한은 서버에서 판정한다** (정책 22). `?status=` 로 거를 수 있고, 없으면 전부다.
 * 차례는 ★대기가 맨 위★ 다 — 관리자가 볼 것은 처리할 것이지 처리한 것이 아니다.
 */
export async function GET(request: Request) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const url = new URL(request.url)
    const statusRaw = url.searchParams.get('status')
    const offsetRaw = Number(url.searchParams.get('offset') ?? '0')
    return ok(
      await adminApplicationList({
        status: statusRaw === null || statusRaw === '' ? null : Number(statusRaw),
        offset: Number.isFinite(offsetRaw) ? offsetRaw : 0,
      }),
    )
  })
}
