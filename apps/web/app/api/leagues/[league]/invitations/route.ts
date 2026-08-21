import { prisma } from '@sacloud/db'
import { randomBytes } from 'node:crypto'
import { ClanInviteInput } from '@sacloud/contract'
import { badRequest, forbidden, guard, notFound, ok, unauthorized } from '@/lib/server/respond'
import { jsonBody, routeParam } from '@/lib/server/request'
import { requireLeagueAdmin } from '@/lib/server/queries/leagueAdmin'
import { CLAN_SUMMARY_SELECT, toClanSummary } from '@/lib/server/mappers'
import { toKstIso, toKstIsoOrNull } from '@/lib/server/format'

/**
 * POST /api/leagues/{leagueSlug}/invitations — 클랜 초대
 *
 * 원본은 초대링크를 만들어 복사할 수 있게 한다.
 * 초대 만료 기간과 수락 절차의 정확한 규칙은 `[미확인]`이다.
 * 여기서는 만료를 두지 않고(null) 링크만 만든다 — 원본과 동일함이 검증되지 않았다.
 */
export async function POST(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const leagueSlug = await routeParam(context, 'league')
    const check = await requireLeagueAdmin(request, leagueSlug)
    if (!check.ok) {
      if (check.reason === 'unauthorized') return unauthorized()
      if (check.reason === 'notFound') return notFound('리그를 찾을 수 없습니다')
      return forbidden('이 리그의 관리자만 초대할 수 있습니다')
    }

    const parsed = ClanInviteInput.safeParse(await jsonBody(request))
    if (!parsed.success) return badRequest('입력값을 확인해주세요')

    const clan = await prisma.clan.findUnique({
      where: { slug: parsed.data.clan_slug },
      select: { ...CLAN_SUMMARY_SELECT, blockInvitation: true },
    })
    if (!clan) return notFound('클랜을 찾을 수 없습니다')
    // 클랜 설정에서 리그 초대를 막아둔 경우 (관측된 설정 항목)
    if (clan.blockInvitation) return forbidden('이 클랜은 리그 초대를 받지 않습니다')

    const already = await prisma.leagueClan.findUnique({
      where: { leagueId_clanId: { leagueId: check.leagueId, clanId: clan.id } },
      select: { id: true },
    })
    if (already) return badRequest('이미 이 리그에 참여 중인 클랜입니다')

    const invitation = await prisma.leagueInvitation.create({
      data: {
        leagueId: check.leagueId,
        clanId: clan.id,
        division: parsed.data.division,
        token: randomBytes(16).toString('base64url'),
      },
    })

    return ok({
      id: invitation.id,
      clan: toClanSummary(clan),
      division: invitation.division,
      invite_url: new URL(`/league/${leagueSlug}/invite/${invitation.token}`, request.url).toString(),
      created_at: toKstIso(invitation.createdAt),
      expires_at: toKstIsoOrNull(invitation.expiresAt),
    })
  })
}
