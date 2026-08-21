import { prisma } from '@sacloud/db'
import { ClanLookupInput } from '@sacloud/contract'
import { badRequest, forbidden, guard, notFound, ok, unauthorized } from '@/lib/server/respond'
import { jsonBody, routeParam } from '@/lib/server/request'
import { clanSlugFromBarracksUrl, requireLeagueAdmin } from '@/lib/server/queries/leagueAdmin'
import { CLAN_SUMMARY_SELECT, toClanSummary } from '@/lib/server/mappers'

/**
 * POST /api/leagues/{leagueSlug}/clan_lookup — 초대할 클랜 조회
 *
 * 원본은 넥슨 병영수첩 클랜 주소를 붙여넣으면 클랜 정보를 보여준다.
 *
 * **지금은 우리 DB에 이미 있는 클랜만 찾는다.** 넥슨 API로 새 클랜을 가져오는 것은
 * Phase 8(전적 수집)의 일이고, 아직 API 키도 없다.
 * 없는 클랜을 "찾았다"고 꾸며내지 않는다 — 못 찾으면 못 찾았다고 답한다.
 */
export async function POST(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const leagueSlug = await routeParam(context, 'league')
    const check = await requireLeagueAdmin(request, leagueSlug)
    if (!check.ok) {
      if (check.reason === 'unauthorized') return unauthorized()
      if (check.reason === 'notFound') return notFound('리그를 찾을 수 없습니다')
      return forbidden('이 리그의 관리자만 사용할 수 있습니다')
    }

    const parsed = ClanLookupInput.safeParse(await jsonBody(request))
    if (!parsed.success) return badRequest('입력값을 확인해주세요')

    const slug = clanSlugFromBarracksUrl(parsed.data.url)
    if (!slug) return badRequest('병영수첩 클랜 주소가 아닙니다')

    const clan = await prisma.clan.findUnique({
      where: { slug },
      select: CLAN_SUMMARY_SELECT,
    })
    if (!clan) {
      return notFound('아직 등록되지 않은 클랜입니다 (전적 수집 연동 전)')
    }

    return ok(toClanSummary(clan))
  })
}
