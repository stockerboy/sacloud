import { prisma } from '@sacloud/db'
import { hashSync } from 'bcryptjs'
import { SignupInput } from '@sacloud/contract'
import { badRequest, guard, ok, tooManyRequests } from '@/lib/server/respond'
import { jsonBody } from '@/lib/server/request'
import { isAllowedSignupEmail, issueAuthToken, startSession } from '@/lib/server/queries/auth'
import {
  clientIdentity,
  consumeQuota,
  ipQuotaFor,
  logThrottle,
  signupIpKey,
} from '@/lib/server/rateLimit'

/**
 * POST /api/auth/signup — 회원가입
 *
 * 관측된 제약
 * - **네이버 메일로만 가입할 수 있다.**
 * - 가입 과정에서 이메일 인증이 진행된다.
 *
 * 캡차(`captcha_token`)는 계약대로 받지만 아직 실연동하지 않았다.
 * 메일 발송도 아직 없다 — 둘 다 Phase 7 뒷부분에서 붙인다.
 *
 * ── 시도 제한 (D-120)
 *   캡차가 없는 동안 대량 가입을 막는 것은 서버 제한뿐이다. IP당 1시간에 3개로 잡았다.
 *   **입력 검증보다 먼저** 센다 — 검증에서 걸리는 요청도 시도 자체는 시도다.
 */
export async function POST(request: Request) {
  return guard(async () => {
    const identity = clientIdentity(request)
    const ipKey = signupIpKey(identity)
    const quota = ipQuotaFor(identity, 'signup')

    const verdict = await consumeQuota(ipKey, quota)
    if (!verdict.allowed) {
      logThrottle({
        route: 'auth/signup',
        reason: 'ip',
        key: ipKey,
        retryAfterSeconds: verdict.retryAfterSeconds,
        trust: identity.trust,
      })
      return tooManyRequests(
        '가입 시도가 너무 많습니다. 잠시 후 다시 시도해주세요',
        verdict.retryAfterSeconds,
      )
    }

    const parsed = SignupInput.safeParse(await jsonBody(request))
    if (!parsed.success) return badRequest('입력값을 확인해주세요')

    const { email, password, nickname } = parsed.data

    if (!isAllowedSignupEmail(email)) {
      return badRequest('네이버 메일 주소만 사용할 수 있습니다', {
        email: ['네이버 메일 주소만 사용할 수 있습니다'],
      })
    }

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (existing) {
      return badRequest('이미 가입된 이메일입니다', { email: ['이미 가입된 이메일입니다'] })
    }

    const user = await prisma.user.create({
      data: { email, passwordHash: hashSync(password, 10), nickname: nickname.trim() },
    })

    // 인증 메일 발송은 아직 없다. 토큰만 만들어 둔다.
    await issueAuthToken(user.id, 'email_verify', 60 * 24)

    return ok(await startSession(user.id))
  })
}
