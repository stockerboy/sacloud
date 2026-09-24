import { badRequest, forbidden, guard, ok } from '@/lib/server/respond'
import { requireAdmin } from '@/lib/server/session'
import { routeParam } from '@/lib/server/request'
import { dbTablePage, isTableKey } from '@/lib/server/admin/dbBrowser'

export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const table = await routeParam(context, 'table')
    if (!isTableKey(table)) return badRequest('모르는 표입니다')

    const url = new URL(request.url)
    const q = url.searchParams.get('q') ?? ''
    const cursor = Number(url.searchParams.get('cursor') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')

    const page = await dbTablePage(table, q, Number.isFinite(cursor) ? cursor : 0, Number.isFinite(size) ? size : 20)
    return ok(page)
  })
}
