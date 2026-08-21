import { prisma } from '@sacloud/db'
import { forbidden, guard, notFound, ok, unauthorized } from '@/lib/server/respond'
import { routeParam } from '@/lib/server/request'
import { audit, requireLeagueAdmin } from '@/lib/server/queries/leagueAdmin'
import { toKstIso } from '@/lib/server/format'

/**
 * DELETE /api/leagues/{leagueSlug}/clans/{leagueClanId} — 클랜삭제
 *
 * 여기서 `[clan]`은 계약상 **league_clan ID**다 (클랜 슬러그가 아니다).
 * 같은 자리에 슬러그를 쓰는 경로(`.../clans/{clanSlug}/show`)가 있어서
 * Next의 제약상 세그먼트 이름을 `[clan]` 하나로 통일했다.
 *
 * 관측된 동작: **바로 지우지 않는다.** 삭제대기 상태로 두고 1주일 뒤 자동 삭제한다.
 * 그래서 여기서는 시각만 기록하고 행을 지우지 않는다.
 * 실제 자동 삭제는 배치의 일이다 (Phase 9).
 */
const DELETE_DELAY_DAYS = 7

export async function DELETE(
  request: Request,
  context: { params: Promise<Record<string, string>> },
) {
  return guard(async () => {
    const leagueSlug = await routeParam(context, 'league')
    const leagueClanId = await routeParam(context, 'clan')

    const check = await requireLeagueAdmin(request, leagueSlug)
    if (!check.ok) {
      if (check.reason === 'unauthorized') return unauthorized()
      if (check.reason === 'notFound') return notFound('리그를 찾을 수 없습니다')
      return forbidden('이 리그의 관리자만 삭제할 수 있습니다')
    }

    const leagueClan = await prisma.leagueClan.findFirst({
      where: { id: leagueClanId, leagueId: check.leagueId },
      select: { id: true },
    })
    if (!leagueClan) return notFound('참여 클랜을 찾을 수 없습니다')

    const requestedAt = new Date()
    const deletesAt = new Date(requestedAt.getTime() + DELETE_DELAY_DAYS * 24 * 60 * 60 * 1000)

    await prisma.leagueClan.update({
      where: { id: leagueClan.id },
      data: { deleteRequestedAt: requestedAt, deletesAt },
    })
    await audit(check.userId, 'league_clan.delete_request', 'league_clan', leagueClan.id, {
      deletesAt: deletesAt.toISOString(),
    })

    return ok({
      league_clan_id: leagueClan.id,
      delete_requested_at: toKstIso(requestedAt),
      deletes_at: toKstIso(deletesAt),
    })
  })
}
