import { prisma } from '@sacloud/db'
import { badRequest, forbidden, guard, ok } from '@/lib/server/respond'
import { jsonBody } from '@/lib/server/request'
import { requireAdmin } from '@/lib/server/session'
import { writeAudit } from '@/lib/server/admin/audit'
import { BETA_OPENED_AT, setSetting } from '@/lib/server/admin/queries'

/** GET /api/admin/settings — 운영 설정 */
export async function GET(request: Request) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')
    const rows = await prisma.appSetting.findMany({ orderBy: { key: 'asc' } })
    return ok(rows)
  })
}

/**
 * PATCH /api/admin/settings — 운영 설정 변경.
 *
 * 지금 쓰는 값은 `betaOpenedAt` 하나다. **코드에 날짜를 박지 않는다** (정책 12) —
 * 베타오픈 시각은 운영자가 정하고, 그 전후 정책이 섞이지 않게 하는 기준이 된다.
 */
export async function PATCH(request: Request) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const body = (await jsonBody(request)) as { key?: string; value?: string }
    const key = body.key?.trim()
    const value = body.value?.trim()
    if (!key || value === undefined) return badRequest('key와 value가 필요합니다')

    if (key === BETA_OPENED_AT && Number.isNaN(new Date(value).getTime())) {
      return badRequest('betaOpenedAt은 날짜여야 합니다 (ISO 8601)')
    }

    const before = await prisma.appSetting.findUnique({ where: { key } })
    await setSetting(key, value, admin.id)
    await writeAudit({
      user: admin,
      action: 'setting.update',
      targetType: 'setting',
      targetId: key,
      before,
      after: { key, value },
    })
    return ok({ key, value })
  })
}
