import { forbidden, guard, ok } from '@/lib/server/respond'
import { requireAdmin } from '@/lib/server/session'
import { listDbTables } from '@/lib/server/admin/dbBrowser'

export async function GET(request: Request) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    return ok({ tables: await listDbTables() })
  })
}
