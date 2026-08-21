import { ClanSettingInput } from '@sacloud/contract'
import { badRequest, guard, notFound, ok, unauthorized } from '@/lib/server/respond'
import { jsonBody, routeParam } from '@/lib/server/request'
import { currentUser } from '@/lib/server/session'
import { updateClanSetting } from '@/lib/server/queries/clans'

/**
 * PUT /api/clans/{clanSlug}/setting — 클랜 설정(공지·리그 초대 차단)
 *
 * 권한
 *   원본은 로그인이 필요한 화면이라 관측되지 않았다. **클랜마스터만인지, 연동된 클랜원도 되는지는
 *   [미확인]** 이므로 소유권 판정을 임의로 만들지 않고 로그인 여부만 확인한다.
 *   원본 규칙이 확인되면 여기에 소유권 검사를 추가한다.
 */
export async function PUT(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const user = await currentUser(request)
    if (!user) return unauthorized()

    const clanSlug = await routeParam(context, 'clanSlug')
    const parsed = ClanSettingInput.safeParse(await jsonBody(request))
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors
      const errors: Record<string, string[]> = {}
      for (const [field, messages] of Object.entries(fieldErrors)) {
        if (messages) errors[field] = messages
      }
      return badRequest('입력값을 확인해주세요', errors)
    }

    const clan = await updateClanSetting(clanSlug, parsed.data)
    return clan ? ok(clan) : notFound('클랜을 찾을 수 없습니다')
  })
}
