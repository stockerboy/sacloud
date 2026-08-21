import { prisma } from '@sacloud/db'
import { DivisionChangeInput } from '@sacloud/contract'
import { badRequest, forbidden, guard, notFound, ok, unauthorized } from '@/lib/server/respond'
import { jsonBody, routeParam } from '@/lib/server/request'
import { audit, requireLeagueAdmin } from '@/lib/server/queries/leagueAdmin'
import { CLAN_SUMMARY_SELECT, toClanSummary } from '@/lib/server/mappers'
import { toKstIso } from '@/lib/server/format'
import { winRate } from '@sacloud/contract'

/**
 * PUT /api/leagues/{leagueSlug}/clans/{leagueClanId}/division — 부리그 변경
 *
 * `[clan]`은 계약상 **league_clan ID**다.
 *
 * 중요: **과거 경기의 division은 건드리지 않는다.**
 * 경기마다 당시 division을 스냅샷으로 저장해 두었고(`Match.redDivisionAtMatch` 등),
 * 승격·강등 후에 과거 기록을 다시 계산하면 데이터가 오염된다
 * (docs/LADDER_IMPLEMENTATION_SPEC.md 4장).
 */
export async function PUT(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const leagueSlug = await routeParam(context, 'league')
    const leagueClanId = await routeParam(context, 'clan')

    const check = await requireLeagueAdmin(request, leagueSlug)
    if (!check.ok) {
      if (check.reason === 'unauthorized') return unauthorized()
      if (check.reason === 'notFound') return notFound('리그를 찾을 수 없습니다')
      return forbidden('이 리그의 관리자만 변경할 수 있습니다')
    }

    const parsed = DivisionChangeInput.safeParse(await jsonBody(request))
    if (!parsed.success) return badRequest('입력값을 확인해주세요')

    const league = await prisma.league.findUnique({
      where: { id: check.leagueId },
      select: { divisionCount: true },
    })
    if (!league) return notFound('리그를 찾을 수 없습니다')
    if (parsed.data.division > league.divisionCount) {
      return badRequest(`이 리그는 ${league.divisionCount}부리그까지 있습니다`)
    }

    const existing = await prisma.leagueClan.findFirst({
      where: { id: leagueClanId, leagueId: check.leagueId },
      select: { id: true, division: true },
    })
    if (!existing) return notFound('참여 클랜을 찾을 수 없습니다')

    const updated = await prisma.leagueClan.update({
      where: { id: existing.id },
      data: { division: parsed.data.division },
      select: {
        id: true,
        leagueId: true,
        rating: true,
        division: true,
        win: true,
        lose: true,
        placement: true,
        status: true,
        joinedAt: true,
        clan: { select: CLAN_SUMMARY_SELECT },
      },
    })
    await audit(check.userId, 'league_clan.division_change', 'league_clan', existing.id, {
      from: existing.division,
      to: parsed.data.division,
    })

    return ok({
      id: updated.id,
      league_id: updated.leagueId,
      clan: toClanSummary(updated.clan),
      rating: updated.rating,
      division: updated.division,
      win: updated.win,
      lose: updated.lose,
      win_rate: winRate(updated.win, updated.lose),
      placement: updated.placement,
      status: updated.status,
      joined_at: toKstIso(updated.joinedAt),
    })
  })
}
