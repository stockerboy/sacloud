import { prisma } from '@sacloud/db'
import { LeagueContentInput } from '@sacloud/contract'
import { sanitizeLeagueDescription } from '@sacloud/ui/sanitize'
import { badRequest, forbidden, guard, notFound, ok, unauthorized } from '@/lib/server/respond'
import { jsonBody, routeParam } from '@/lib/server/request'
import { requireLeagueAdmin } from '@/lib/server/queries/leagueAdmin'
import { getLeague } from '@/lib/server/queries/leagues'

/**
 * PUT /api/leagues/{leagueSlug}/content — 리그소개 수정
 *
 * **저장 전에 서버에서 새니타이즈한다.** 화면 렌더 시에도 한 번 더 거르지만,
 * 클라이언트 검증만 믿으면 API를 직접 호출해 스크립트를 심을 수 있다.
 */
export async function PUT(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const leagueSlug = await routeParam(context, 'league')
    const check = await requireLeagueAdmin(request, leagueSlug)
    if (!check.ok) {
      if (check.reason === 'unauthorized') return unauthorized()
      if (check.reason === 'notFound') return notFound('리그를 찾을 수 없습니다')
      return forbidden('이 리그의 관리자만 수정할 수 있습니다')
    }

    const parsed = LeagueContentInput.safeParse(await jsonBody(request))
    if (!parsed.success) return badRequest('입력값을 확인해주세요')

    await prisma.league.update({
      where: { id: check.leagueId },
      data: { description: sanitizeLeagueDescription(parsed.data.description) },
    })

    const league = await getLeague(leagueSlug)
    return league ? ok(league) : notFound('리그를 찾을 수 없습니다')
  })
}
