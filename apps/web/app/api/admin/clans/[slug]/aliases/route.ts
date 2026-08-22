import { badRequest, forbidden, guard, notFound, ok } from '@/lib/server/respond'
import { jsonBody, routeParam } from '@/lib/server/request'
import { requireAdmin } from '@/lib/server/session'
import { writeAudit } from '@/lib/server/admin/audit'
import { addAlias, removeAlias } from '@sacloud/db/ops'

/**
 * POST /api/admin/clans/{slug}/aliases — 넥슨 `guild_name` 별칭 등록.
 *
 * 자동으로 만들지 않는다. 운영자가 "이 표기는 이 클랜이다"라고 말할 때만 생긴다 (D-088).
 */
export async function POST(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const slug = await routeParam(context, 'slug')
    const body = (await jsonBody(request)) as { alias?: string; source?: string }
    const alias = body.alias?.trim()
    if (!alias) return badRequest('alias가 필요합니다')

    try {
      const created = await addAlias({ clanSlug: slug, alias, source: body.source })
      if (!created) return notFound('클랜을 찾을 수 없습니다')
      await writeAudit({
        user: admin,
        action: 'clan.alias.add',
        targetType: 'clan',
        targetId: slug,
        after: created,
      })
      return ok(created)
    } catch {
      return badRequest('이미 등록된 별칭입니다')
    }
  })
}

/** DELETE /api/admin/clans/{slug}/aliases?id= — 별칭 삭제 */
export async function DELETE(
  request: Request,
  context: { params: Promise<Record<string, string>> },
) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const slug = await routeParam(context, 'slug')
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return badRequest('id가 필요합니다')

    const removed = await removeAlias(id)
    await writeAudit({
      user: admin,
      action: 'clan.alias.remove',
      targetType: 'clan',
      targetId: slug,
      before: removed,
    })
    return ok(removed)
  })
}
