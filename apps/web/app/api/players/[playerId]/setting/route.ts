import { PlayerSettingInput } from '@sacloud/contract'
import { badRequest, guard, notFound, ok } from '@/lib/server/respond'
import { jsonBody, routeParam } from '@/lib/server/request'
import { ownershipDenied, requirePlayerOwner } from '@/lib/server/ownership'
import { updatePlayerSetting } from '@/lib/server/queries/players'

/**
 * PUT /api/players/{playerId}/setting — 플레이어 설정(소개·포지션)
 *
 * 권한 — **2026-09-01 에 잠갔다. 그 전에는 뚫려 있었다**
 *
 *   ⚠ 그때는 이랬다 (아래 옛 주석 원문)
 *     > 원본은 로그인이 필요한 화면이라 관측되지 않았다. **어떤 조건에서 남의 플레이어를
 *     > 고칠 수 있는지(연동된 본인만인지, 클랜마스터도 가능한지)는 [미확인]** 이므로
 *     > 소유권 판정을 임의로 만들지 않고 로그인 여부만 확인한다.
 *
 *     그 결과 **계정 하나만 만들면 남의 선수 프로필(한줄소개·포지션)을 덮어쓸 수 있었다.**
 *
 *   지금은 이렇다 — 기준이 확정됐다
 *     > "회원가입은 아디 비번 만들고 서든 계정인증만 하면 된다.
 *     >  칭호 [용병] 으로 바꾸면 바로 승인되고 자기 프로필 관리 할 수 있다" — 사용자
 *
 *     즉 **자기 선수임을 증명한 계정만** 고친다. 판정은 `lib/server/ownership.ts` 한 곳에 있다.
 *     지금 통과하는 것은 **운영자**와 **운영자가 승인한 계정 연동(`UserPlayerLink`, D-121)** 이고,
 *     **칭호 인증 판정은 다른 팀이 만드는 중**이라 그 자리를 주석으로 비워 두었다.
 *
 *   ⚠ 읽기는 막지 않았다. `GET /api/players/{playerId}` 은 그대로 누구나 본다.
 */
export async function PUT(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const playerId = await routeParam(context, 'playerId')

    const owner = await requirePlayerOwner(request, playerId)
    if (!owner.ok) return ownershipDenied(owner)

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
