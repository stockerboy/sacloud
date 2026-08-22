import { prisma } from '@sacloud/db'
import { badRequest, forbidden, guard, ok } from '@/lib/server/respond'
import { jsonBody } from '@/lib/server/request'
import { requireAdmin } from '@/lib/server/session'
import { adminClans } from '@/lib/server/admin/queries'
import { writeAudit } from '@/lib/server/admin/audit'

/** GET /api/admin/clans?query=&category= — 클랜 목록 */
export async function GET(request: Request) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const url = new URL(request.url)
    const rows = await adminClans({
      query: url.searchParams.get('query'),
      category: url.searchParams.get('category'),
    })
    return ok(rows)
  })
}

/**
 * POST /api/admin/clans — 클랜 등록.
 *
 * 이미 있는 slug면 만들지 않는다. **이름이 비슷하다고 기존 클랜에 붙이지 않는다** (D-088).
 */
export async function POST(request: Request) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const body = (await jsonBody(request)) as {
      slug?: string
      name?: string
      category?: string
      tier?: number | null
    }
    const slug = body.slug?.trim()
    const name = body.name?.trim()
    if (!slug || !name) return badRequest('slug와 name이 필요합니다')

    const existing = await prisma.clan.findUnique({ where: { slug }, select: { name: true } })
    if (existing) return badRequest(`이미 있는 slug입니다 (${existing.name})`)

    const created = await prisma.clan.create({
      data: {
        slug,
        name,
        category: body.category === 'independent' ? 'independent' : 'official',
        tier: body.tier ?? null,
      },
      select: { slug: true, name: true, category: true, tier: true, active: true },
    })
    await writeAudit({
      user: admin,
      action: 'clan.create',
      targetType: 'clan',
      targetId: slug,
      after: created,
    })
    return ok(created)
  })
}
