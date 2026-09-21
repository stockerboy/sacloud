import { badRequest, forbidden, guard, ok } from '@/lib/server/respond'
import { jsonBody } from '@/lib/server/request'
import { requireAdmin } from '@/lib/server/session'
import { writeAudit } from '@/lib/server/admin/audit'
import { listSiteTexts, resetSiteText, saveSiteText } from '@/lib/server/queries/siteText'

/**
 * ★★화면 글 고치기 — 관리자 전용★★ (2026-09-21 사장님)
 *
 * > 「이거 ★내가 관리자 권한으로 수정 할 수 있게 해줘★ 글」
 *
 * ⚠ ★화면에서 단추를 감추는 것은 보안이 아니다★ — 여기서 `requireAdmin` 이 막는다.
 */

/** GET /api/admin/texts — 지금 DB 에 든 글 전부 */
export async function GET(request: Request) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')
    return ok(await listSiteTexts())
  })
}

/**
 * PUT /api/admin/texts — 글 하나를 저장한다.
 *
 * `body` 가 빈 글이면 ★줄을 지운다★ — 그러면 코드에 박힌 기본 글이 다시 나온다.
 * 되돌릴 길을 남겨 두는 것이다.
 */
export async function PUT(request: Request) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const body = (await jsonBody(request)) as {
      key?: string
      title?: string | null
      body?: string
      hidden?: boolean
    }
    const key = body.key?.trim()
    if (!key) return badRequest('key 가 필요합니다')
    const text = (body.body ?? '').trim()

    if (text === '') {
      await resetSiteText(key)
      await writeAudit({
        user: admin,
        action: 'site-text.reset',
        targetType: 'siteText',
        targetId: key,
        note: '코드에 박힌 기본 글로 되돌림',
      })
      return ok({ key, reset: true })
    }

    await saveSiteText({
      key,
      title: (body.title ?? '').trim() || null,
      body: text,
      hidden: body.hidden === true,
      userId: admin.id,
    })
    await writeAudit({
      user: admin,
      action: 'site-text.save',
      targetType: 'siteText',
      targetId: key,
      after: { title: body.title ?? null, hidden: body.hidden === true },
    })
    return ok({ key, reset: false })
  })
}
