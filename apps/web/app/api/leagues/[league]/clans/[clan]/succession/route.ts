import { prisma } from '@sacloud/db'
import { ClanSuccessionInput } from '@sacloud/contract'
import { badRequest, forbidden, guard, notFound, ok, unauthorized } from '@/lib/server/respond'
import { jsonBody, routeParam } from '@/lib/server/request'
import { audit, requireLeagueAdmin } from '@/lib/server/queries/leagueAdmin'

/**
 * POST /api/leagues/{leagueSlug}/clans/{leagueClanId}/succession — 클랜변경(승계)
 *
 * 관측된 동작: 전적을 **새 클랜이 그대로 승계**하고, 새 클랜 마스터의 **수락이 필요**하다.
 *
 * 수락 절차(알림·대기 상태·만료)의 구체적인 규칙은 `[미확인]`이다.
 * 여기서는 승계 요청만 기록하고 **바로 넘기지 않는다.**
 * 수락 없이 전적을 옮기면 되돌릴 수 없는 조치를 상대 동의 없이 실행하는 셈이 된다.
 * 수락 화면·흐름은 원본 확인 후 구현한다.
 */
export async function POST(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const leagueSlug = await routeParam(context, 'league')
    const leagueClanId = await routeParam(context, 'clan')

    const check = await requireLeagueAdmin(request, leagueSlug)
    if (!check.ok) {
      if (check.reason === 'unauthorized') return unauthorized()
      if (check.reason === 'notFound') return notFound('리그를 찾을 수 없습니다')
      return forbidden('이 리그의 관리자만 요청할 수 있습니다')
    }

    const parsed = ClanSuccessionInput.safeParse(await jsonBody(request))
    if (!parsed.success) return badRequest('입력값을 확인해주세요')

    const leagueClan = await prisma.leagueClan.findFirst({
      where: { id: leagueClanId, leagueId: check.leagueId },
      select: { id: true, clanId: true },
    })
    if (!leagueClan) return notFound('참여 클랜을 찾을 수 없습니다')

    const target = await prisma.clan.findUnique({
      where: { slug: parsed.data.clan_slug },
      select: { id: true },
    })
    if (!target) return notFound('승계할 클랜을 찾을 수 없습니다')
    if (target.id === leagueClan.clanId) return badRequest('같은 클랜입니다')

    await audit(check.userId, 'league_clan.succession_request', 'league_clan', leagueClan.id, {
      fromClanId: leagueClan.clanId,
      toClanId: target.id,
    })

    return ok({ ok: true })
  })
}
