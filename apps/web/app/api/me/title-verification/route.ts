/**
 * 서든어택 계정 **소유권 증명** — 게임 칭호 `[용병]` (2026-09-01).
 *
 * `GET`    지금 내 증명 상태
 * `POST`   닉네임을 넣고 지금 칭호를 확인한다  ← 넥슨을 부르는 유일한 자리
 * `DELETE` 진행 중인 증명을 접는다
 *
 * ── 전부 **로그인 필요**하다
 *   개인 정보다. `okPublic`(엣지 캐시)을 쓰지 않는다 — 엣지는 쿠키를 구분하지 않아
 *   남의 인증 상태가 섞여 나간다 (`lib/server/respond.ts` 주석).
 *
 * ── 회원가입을 막지 않는다
 *   인증은 **가입 후 선택**이다. 인증하지 않은 회원도 사이트를 다 쓸 수 있다.
 *   여기서 실패해도 계정에는 아무 일도 일어나지 않는다.
 */
import { TitleVerificationInput } from '@sacloud/contract'
import { badRequest, guard, ok, tooManyRequests, unauthorized } from '@/lib/server/respond'
import { jsonBody } from '@/lib/server/request'
import { currentUserId } from '@/lib/server/session'
import { clientIdentity, consumeQuota, logThrottle } from '@/lib/server/rateLimit'
import {
  cancelTitleVerification,
  checkTitleVerification,
  titleVerificationState,
} from '@/lib/server/queries/titleVerification'

/**
 * 시도 제한 — **계정당 1시간에 30회**.
 *
 * ⚠ SPEC 에 이 값이 없어 우리가 정했다. 근거는 둘이다.
 *   ① 정상 사용자는 몇 번이면 끝난다 — 칭호를 바꾸고 한 번 누르면 된다.
 *      게임을 껐다 켜며 서너 번 눌러도 30회에는 닿지 않는다
 *   ② 이걸 안 걸면 **남의 닉네임을 계속 찔러볼 수 있다.** 고정 칭호 방식이라
 *      「어쩌다 `[용병]` 을 단 사람」을 훑는 공격이 성립한다. 시간당 30회면
 *      의미 있는 훑기가 안 되고, 넥슨 호출도 계정당 시간당 60건을 넘지 않는다
 *
 * 도전 하나당 확인 횟수(`TITLE_CHALLENGE_MAX_ATTEMPTS`)와는 **다른 축**이다.
 * 그쪽은 한 계정을 오래 두드리는 것을, 이쪽은 여러 닉네임을 훑는 것을 막는다.
 */
const CHECK_QUOTA = { limit: 30, windowSeconds: 60 * 60 }

/** GET /api/me/title-verification */
export async function GET(request: Request) {
  return guard(async () => {
    const userId = await currentUserId(request)
    if (!userId) return unauthorized()
    return ok(await titleVerificationState(userId))
  })
}

/** POST /api/me/title-verification — 「확인」 */
export async function POST(request: Request) {
  return guard(async () => {
    const userId = await currentUserId(request)
    if (!userId) return unauthorized()

    const parsed = TitleVerificationInput.safeParse(await jsonBody(request))
    if (!parsed.success) return badRequest('서든어택 닉네임을 입력해주세요')

    const key = `title-verify:user:${userId}`
    const verdict = await consumeQuota(key, CHECK_QUOTA)
    if (!verdict.allowed) {
      logThrottle({
        route: 'me/title-verification',
        reason: 'account',
        key,
        retryAfterSeconds: verdict.retryAfterSeconds,
        trust: clientIdentity(request).trust,
      })
      return tooManyRequests(
        '확인을 너무 많이 눌렀습니다. 잠시 후 다시 시도해주세요',
        verdict.retryAfterSeconds,
      )
    }

    const result = await checkTitleVerification({ userId, nickname: parsed.data.nickname })

    /* 연타는 429 로 돌려준다. 화면이 몇 초 뒤에 다시 되는지 알 수 있어야 한다 */
    if (result.retryAfterSeconds !== undefined) {
      return tooManyRequests('잠시 후 다시 눌러주세요', result.retryAfterSeconds)
    }

    return ok(await titleVerificationState(userId, result.outcome))
  })
}

/** DELETE /api/me/title-verification — 접기 */
export async function DELETE(request: Request) {
  return guard(async () => {
    const userId = await currentUserId(request)
    if (!userId) return unauthorized()
    await cancelTitleVerification(userId)
    return ok(await titleVerificationState(userId))
  })
}
