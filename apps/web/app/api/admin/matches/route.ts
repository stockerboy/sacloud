import { forbidden, guard, ok } from '@/lib/server/respond'
import { requireAdmin } from '@/lib/server/session'
import { adminMatches } from '@/lib/server/admin/queries'

/** GET /api/admin/matches?official=&sourceMatchId=&clan=&player= — 경기 검색 */
export async function GET(request: Request) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const url = new URL(request.url)
    const official = url.searchParams.get('official')
    const rows = await adminMatches({
      official: official === null || official === '' ? null : official === 'true',
      sourceMatchId: url.searchParams.get('sourceMatchId'),
      clanSlug: url.searchParams.get('clan'),
      playerId: url.searchParams.get('player'),
      limit: 50,
    })
    return ok(rows)
  })
}
