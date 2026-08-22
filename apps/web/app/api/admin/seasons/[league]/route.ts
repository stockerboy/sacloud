import { forbidden, guard, notFound, ok } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { requireAdmin } from '@/lib/server/session'
import { seasonOverview } from '@sacloud/db/ops'

/** GET /api/admin/seasons/{league} — 시즌 현황 (활성 시즌·부리그 구성·스냅샷 여부) */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const league = await routeParam(context, 'league')
    const overview = await seasonOverview(league)
    return overview ? ok(overview) : notFound('리그를 찾을 수 없습니다')
  })
}
