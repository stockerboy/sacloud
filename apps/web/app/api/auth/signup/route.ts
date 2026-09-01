import { prisma } from '@sacloud/db'
import { hashSync } from 'bcryptjs'
import { normalizeUsername, SignupInput } from '@sacloud/contract'
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
 * ⚠ **바뀌었다 (2026-09-01 · D-252).** 옛 서술은 아래 상자에 남긴다.
 *
 * 가입에 필요한 것은 **아이디 · 비밀번호 · 닉네임**이다.
 *
 * - **이메일 인증을 강제하지 않는다.** 애초에 메일 발송 코드가 없다. 요구하면 아무도 못 쓴다
 * - 이메일은 **선택 입력**이다. 넣었으면 저장하고 인증 토큰을 만들어 둔다 —
 *   나중에 메일이 붙으면 그 토큰 흐름을 그대로 쓴다
 * - **인증한 계정과 안 한 계정은 `emailVerifiedAt` 으로 여전히 구분된다.**
 *   이 값이 `null` 이어도 사이트는 다 쓸 수 있다. 구분만 남긴 것이다
 *
 * <details>옛 서술 (2026-09-01 이전)
 *   관측된 제약: **네이버 메일로만 가입할 수 있다.** 가입 과정에서 이메일 인증이 진행된다.
 *   → 메일 발송이 없는 상태에서 이 제약은 「가입 불가」와 같은 뜻이었다.
 * </details>
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
    if (!parsed.success) {
      /* 「Validation failed」 같은 기계어를 그대로 내보내지 않는다.
         칸마다 사람이 읽을 수 있는 문장을 만들어 준다 */
      const errors: Record<string, string[]> = {}
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? 'form')
        ;(errors[field] ??= []).push(signupFieldMessage(field, issue.message))
      }
      const first = Object.values(errors)[0]?.[0] ?? '입력값을 확인해주세요'
      return badRequest(first, errors)
    }

    const { password, nickname, email } = parsed.data
    const username = normalizeUsername(parsed.data.username)

    const taken = await prisma.user.findUnique({ where: { username }, select: { id: true } })
    if (taken) {
      return badRequest('이미 사용 중인 아이디입니다', {
        username: ['이미 사용 중인 아이디입니다'],
      })
    }

    if (email) {
      if (!isAllowedSignupEmail(email)) {
        return badRequest('사용할 수 없는 이메일 주소입니다', {
          email: ['사용할 수 없는 이메일 주소입니다'],
        })
      }
      const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
      if (existing) {
        return badRequest('이미 가입된 이메일입니다', { email: ['이미 가입된 이메일입니다'] })
      }
    }

    const user = await prisma.user
      .create({
        data: {
          username,
          email: email ?? null,
          passwordHash: hashSync(password, 10),
          nickname: nickname.trim(),
        },
      })
      .catch((error: unknown) => {
        /* 같은 아이디를 동시에 두 번 보내면 위 조회를 둘 다 통과할 수 있다.
           최종 판정은 **DB 의 유일 제약**이다 — 그 실패를 사람 말로 바꿔 준다 */
        if (isUniqueViolation(error)) return null
        throw error
      })

    if (!user) {
      return badRequest('이미 사용 중인 아이디입니다', {
        username: ['이미 사용 중인 아이디입니다'],
      })
    }

    /* 이메일을 넣은 사람에게만 인증 토큰을 만들어 둔다. 메일 발송은 아직 없다.
       **가입을 막지는 않는다** — 토큰은 나중에 메일이 붙었을 때 쓰려고 남기는 것이다 */
    if (email) await issueAuthToken(user.id, 'email_verify', 60 * 24)

    return ok(await startSession(user.id))
  })
}

/** Prisma 유일 제약 위반인지 (P2002) */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  )
}

/** Zod 의 영어 기본 문구를 사람이 읽는 문장으로 바꾼다 */
function signupFieldMessage(field: string, raw: string): string {
  if (field === 'username') {
    return raw.startsWith('아이디')
      ? raw
      : '아이디는 영문으로 시작하는 4~16자의 영문·숫자·밑줄이어야 합니다'
  }
  if (field === 'password') return '비밀번호는 8자 이상이어야 합니다'
  if (field === 'nickname') return '닉네임은 2~16자여야 합니다'
  if (field === 'email') return '이메일 주소 형식이 올바르지 않습니다'
  return '입력값을 확인해주세요'
}
