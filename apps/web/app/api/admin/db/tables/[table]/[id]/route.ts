import { badRequest, forbidden, guard, notFound, ok } from '@/lib/server/respond'
import { requireAdmin } from '@/lib/server/session'
import { routeParam } from '@/lib/server/request'
import { dbRow, isTableKey } from '@/lib/server/admin/dbBrowser'

export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const table = await routeParam(context, 'table')
    if (!isTableKey(table)) return badRequest('모르는 표입니다')
    const id = await routeParam(context, 'id')

    const detail = await dbRow(table, id)
    if (!detail.row) return notFound('그 줄을 찾을 수 없습니다')
    return ok(detail)
  })
}
