import { forbidden, guard, ok } from '@/lib/server/respond'
import { requireAdmin } from '@/lib/server/session'
import { adminUserList, ADMIN_USER_PAGE_SIZE } from '@/lib/server/admin/users'

/**
 * GET /api/admin/users — 회원 목록 (2026-09-13).
 *
 * **권한은 서버에서 판정한다** (정책 22). 화면에서 메뉴를 감추는 것은 보안이 아니다.
 *
 * `?q=` 검색 · `?offset=` 쪽 넘기기. 비밀번호 해시는 조회 자체를 하지 않는다.
 */
export async function GET(request: Request) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const url = new URL(request.url)
    const offsetRaw = Number(url.searchParams.get('offset') ?? '0')
    const data = await adminUserList({
      q: url.searchParams.get('q'),
      offset: Number.isFinite(offsetRaw) ? offsetRaw : 0,
      limit: ADMIN_USER_PAGE_SIZE,
    })
    return ok(data)
  })
}
