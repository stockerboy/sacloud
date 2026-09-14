import { LeagueApplicationInput } from '@sacloud/contract'
import { badRequest, guard, ok } from '@/lib/server/respond'
import { submitLeagueApplication } from '@/lib/server/queries/leagueApplication'

/**
 * POST /api/league-applications — ★리그 참가 신청★ (2026-09-14 사장님).
 *
 *   «★로그인 회원가입 없이★ 신청 할 수 있게 해줘»
 *
 * ── 로그인이 없으니 자물쇠를 다른 데 건다
 *   막는 것은 계정이 아니라 ★(리그 + 클랜명)★ 이다 — 같은 클랜이 또 내면
 *   새 줄이 생기지 않고 그 줄이 고쳐진다. 그래서 백 번 눌러도 줄은 하나다.
 *   양식 검사는 계약(`LeagueApplicationInput`)이 한다 — 병영수첩 주소가 아니면 받지 않는다.
 *
 * ⚠ ★여기서 캐시를 쓰지 않는다.★ 쓰는 요청이다.
 */
export async function POST(request: Request) {
  return guard(async () => {
    const body: unknown = await request.json().catch(() => null)
    const parsed = LeagueApplicationInput.safeParse(body)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      return badRequest(first?.message ?? '신청서를 다시 확인해 주세요')
    }

    const result = await submitLeagueApplication(parsed.data, {
      userAgent: request.headers.get('user-agent'),
    })
    if (!result.ok) return badRequest(result.message)
    return ok({ id: result.id, updated: result.updated })
  })
}
