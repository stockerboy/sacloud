import { PlayerSettingInput } from '@sacloud/contract'
import { badRequest, guard, notFound, ok, unauthorized } from '@/lib/server/respond'
import { jsonBody, routeParam } from '@/lib/server/request'
import { currentUser } from '@/lib/server/session'
import { updatePlayerSetting } from '@/lib/server/queries/players'

/**
 * PUT /api/players/{playerId}/setting — 플레이어 설정(소개·포지션)
 *
 * 권한
 *   원본은 로그인이 필요한 화면이라 관측되지 않았다. **어떤 조건에서 남의 플레이어를 고칠 수 있는지
 *   (연동된 본인만인지, 클랜마스터도 가능한지)는 [미확인]** 이므로 소유권 판정을 임의로 만들지 않고
 *   로그인 여부만 확인한다. 원본 규칙이 확인되면 여기에 소유권 검사를 추가한다.
 */
export async function PUT(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const user = await currentUser(request)
    if (!user) return unauthorized()

    const playerId = await routeParam(context, 'playerId')
    const parsed = PlayerSettingInput.safeParse(await jsonBody(request))
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors
      const errors: Record<string, string[]> = {}
      for (const [field, messages] of Object.entries(fieldErrors)) {
        if (messages) errors[field] = messages
      }
      return badRequest('입력값을 확인해주세요', errors)
    }

    const player = await updatePlayerSetting(playerId, parsed.data)
    return player ? ok(player) : notFound('플레이어를 찾을 수 없습니다')
  })
}
