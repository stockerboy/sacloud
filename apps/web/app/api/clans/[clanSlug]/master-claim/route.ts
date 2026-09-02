/**
 * 클랜 **마스터 인증** — 신청 (2026-09-01 · D-253).
 *
 * `GET`    이 클랜에 대한 내 신청 상태
 * `POST`   인게임 스크린샷 1장을 내고 심사를 기다린다
 * `DELETE` 심사중인 신청을 접는다
 *
 * ── 전부 **로그인 필요**하다
 *   개인 정보다. `okPublic`(엣지 캐시)을 쓰지 않는다 — 엣지는 쿠키를 구분하지 않아
 *   남의 신청 상태가 섞여 나간다 (`lib/server/respond.ts` 주석).
 *
 * ── 여기서 권한이 생기지 않는다
 *   신청까지만 한다. 클랜 설정 권한은 **관리자가 승인해야** 열린다
 *   (`/api/admin/clan-master-claims/{claimId}`).
 */
import { claimClosed } from '@/lib/server/claimGate'
import { ClanMasterClaimInput } from '@sacloud/contract'
import { badRequest, guard, notFound, ok, tooManyRequests, unauthorized } from '@/lib/server/respond'
import { jsonBody, routeParam } from '@/lib/server/request'
import { currentUserId } from '@/lib/server/session'
import { clientIdentity, consumeQuota, logThrottle } from '@/lib/server/rateLimit'
import {
  cancelClanMasterClaim,
  clanMasterClaimState,
  submitClanMasterClaim,
} from '@/lib/server/queries/clanMasterClaim'

/**
 * 제출 제한 — **계정당 1시간에 10회**.
 *
 * ⚠ 우리가 정한 값이다 [미확인]. 근거는 둘이다.
 *   ① 정상 사용자는 한 번이면 끝난다. 사진을 잘못 골라 다시 내도 서너 번이다
 *   ② 사진은 최대 3MB 이고 **DB 에 그대로 들어간다.** 제한이 없으면 계정 하나로
 *      저장 공간을 밀어 넣을 수 있다. 시간당 10회면 계정당 30MB 를 넘지 않는다
 */
const SUBMIT_QUOTA = { limit: 10, windowSeconds: 60 * 60 }

/** GET /api/clans/{clanSlug}/master-claim */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const userId = await currentUserId(request)
    if (!userId) return unauthorized()

    const clanSlug = await routeParam(context, 'clanSlug')
    const state = await clanMasterClaimState(userId, clanSlug)
    return state ? ok(state) : notFound('클랜을 찾을 수 없습니다')
  })
}

/** POST /api/clans/{clanSlug}/master-claim — 스크린샷 1장 제출 */
export async function POST(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    /* ★신청 창구가 닫혀 있으면 여기서 막는다★ (O-008 ⑥) */
    const closed = claimClosed()
    if (closed) return closed

    const userId = await currentUserId(request)
    if (!userId) return unauthorized()

    const clanSlug = await routeParam(context, 'clanSlug')

    const parsed = ClanMasterClaimInput.safeParse(await jsonBody(request))
    if (!parsed.success) return badRequest('인게임 스크린샷 1장을 첨부해주세요')

    const key = `clan-master:user:${userId}`
    const verdict = await consumeQuota(key, SUBMIT_QUOTA)
    if (!verdict.allowed) {
      logThrottle({
        route: 'clans/master-claim',
        reason: 'account',
        key,
        retryAfterSeconds: verdict.retryAfterSeconds,
        trust: clientIdentity(request).trust,
      })
      return tooManyRequests(
        '신청을 너무 많이 냈습니다. 잠시 후 다시 시도해주세요',
        verdict.retryAfterSeconds,
      )
    }

    const result = await submitClanMasterClaim({
      userId,
      clanSlug,
      image: parsed.data.image,
      note: parsed.data.note ?? null,
    })
    /* 왜 안 됐는지 그대로 돌려준다. 「실패했습니다」만 띄우면 무엇을 고쳐야 할지 모른다 */
    if (!result.ok) return badRequest(result.message)

    const state = await clanMasterClaimState(userId, clanSlug)
    return state ? ok(state) : notFound('클랜을 찾을 수 없습니다')
  })
}

/** DELETE /api/clans/{clanSlug}/master-claim — 접기 */
export async function DELETE(
  request: Request,
  context: { params: Promise<Record<string, string>> },
) {
  return guard(async () => {
    const userId = await currentUserId(request)
    if (!userId) return unauthorized()

    const clanSlug = await routeParam(context, 'clanSlug')
    await cancelClanMasterClaim(userId, clanSlug)

    const state = await clanMasterClaimState(userId, clanSlug)
    return state ? ok(state) : notFound('클랜을 찾을 수 없습니다')
  })
}
