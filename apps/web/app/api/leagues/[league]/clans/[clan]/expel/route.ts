import { prisma } from '@sacloud/db'
import { ExpelInput } from '@sacloud/contract'
import { badRequest, forbidden, guard, notFound, ok, unauthorized } from '@/lib/server/respond'
import { jsonBody, routeParam } from '@/lib/server/request'
import { audit, requireLeagueAdmin } from '@/lib/server/queries/leagueAdmin'

/**
 * POST /api/leagues/{leagueSlug}/clans/{leagueClanId}/expel — 추방
 *
 * 관측된 동작: **되돌릴 수 없고 재가입도 불가**하다. 그래서 화면에서 `추방합니다`를
 * 그대로 입력해야 버튼이 활성화된다. 서버도 같은 문자열을 다시 확인한다 —
 * 화면 검증만 믿으면 API를 직접 호출해 우회할 수 있다.
 *
 * 기록은 지우지 않는다. `expelledAt`만 남긴다.
 * 과거 경기 기록을 물리 삭제하면 상대 클랜의 전적까지 깨진다.
 */
export async function POST(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const leagueSlug = await routeParam(context, 'league')
    const leagueClanId = await routeParam(context, 'clan')

    const check = await requireLeagueAdmin(request, leagueSlug)
    if (!check.ok) {
      if (check.reason === 'unauthorized') return unauthorized()
      if (check.reason === 'notFound') return notFound('리그를 찾을 수 없습니다')
      return forbidden('이 리그의 관리자만 추방할 수 있습니다')
    }

    const parsed = ExpelInput.safeParse(await jsonBody(request))
    if (!parsed.success) return badRequest('확인 문구가 일치하지 않습니다')

    const leagueClan = await prisma.leagueClan.findFirst({
      where: { id: leagueClanId, leagueId: check.leagueId },
      select: { id: true, expelledAt: true },
    })
    if (!leagueClan) return notFound('참여 클랜을 찾을 수 없습니다')
    if (leagueClan.expelledAt) return badRequest('이미 추방된 클랜입니다')

    await prisma.leagueClan.update({
      where: { id: leagueClan.id },
      data: { expelledAt: new Date() },
    })
    await audit(check.userId, 'league_clan.expel', 'league_clan', leagueClan.id)

    return ok({ ok: true })
  })
}
