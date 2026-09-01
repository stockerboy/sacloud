import { ClanSettingInput } from '@sacloud/contract'
import { badRequest, guard, notFound, ok } from '@/lib/server/respond'
import { jsonBody, routeParam } from '@/lib/server/request'
import { ownershipDenied, requireClanOwner } from '@/lib/server/ownership'
import { updateClanSetting } from '@/lib/server/queries/clans'

/**
 * PUT /api/clans/{clanSlug}/setting — 클랜 설정(공지·리그 초대 차단)
 *
 * 권한 — **2026-09-01 에 잠갔다. 그 전에는 뚫려 있었다**
 *
 *   ⚠ 그때는 이랬다 (아래 옛 주석 원문)
 *     > 원본은 로그인이 필요한 화면이라 관측되지 않았다. **클랜마스터만인지, 연동된 클랜원도
 *     > 되는지는 [미확인]** 이므로 소유권 판정을 임의로 만들지 않고 로그인 여부만 확인한다.
 *     > 원본 규칙이 확인되면 여기에 소유권 검사를 추가한다.
 *
 *     그 결과 **계정 하나만 만들면 남의 클랜 공지를 덮어쓸 수 있었다.**
 *     규칙을 지어내지 않은 것은 옳았지만, 모른다는 이유로 문을 열어 둔 것은 틀렸다.
 *
 *   지금은 이렇다
 *     판정을 `lib/server/ownership.ts` 한 곳에 모으고 **가장 안전한 쪽으로 잠갔다** —
 *     지금 통과하는 것은 **운영자뿐**이다. 클랜 설정을 누가 고쳐야 하는지(클랜 마스터? 클랜원?)는
 *     아직 사용자에게 확인되지 않았다 [미확인]. 확정되면 `requireClanOwner` 한 곳만 고친다.
 *
 *   ⚠ 읽기는 막지 않았다. `GET /api/clans/{clanSlug}` 은 그대로 누구나 본다.
 */
export async function PUT(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const clanSlug = await routeParam(context, 'clanSlug')

    const owner = await requireClanOwner(request, clanSlug)
    if (!owner.ok) return ownershipDenied(owner)

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
