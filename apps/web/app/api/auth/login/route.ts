import { compareSync } from 'bcryptjs'
import { LoginInput, normalizeUsername } from '@sacloud/contract'
import { badRequest, guard, ok, tooManyRequests, unauthorized } from '@/lib/server/respond'
import { jsonBody } from '@/lib/server/request'
import { findUserForLogin, startSession } from '@/lib/server/queries/auth'
import {
  clearQuota,
  clientIdentity,
  consumeQuota,
  ipQuotaFor,
  LOGIN_ACCOUNT_QUOTA,
  loginAccountKey,
  loginIpKey,
  logThrottle,
  peekQuota,
} from '@/lib/server/rateLimit'

/**
 * POST /api/auth/login
 *
 * 실패 메시지는 **아이디가 없는지 비밀번호가 틀린지 구분하지 않는다.**
 * 구분해서 알려주면 어떤 계정이 가입돼 있는지 확인하는 데 쓰일 수 있다.
 *
 * ⚠ **아이디 로그인 (2026-09-01 · D-252).** `username` 으로 찾는다.
 * `email` 도 계속 받는다 — 이메일로 가입한 옛 계정이 그대로 로그인돼야 한다.
 *
 * ── 시도 제한 (D-120)
 *   **실패만 센다.** 비밀번호를 제대로 넣는 사람은 몇 번을 로그인해도 걸리지 않는다.
 *   계정별(15분 5회)과 IP별(15분 20회)을 함께 보고, 성공하면 그 계정의 기록을 지운다.
 *   막혔을 때도 그 이메일이 존재하는지는 알려주지 않는다 — 남은 시간만 준다.
 */
export async function POST(request: Request) {
  return guard(async () => {
    const parsed = LoginInput.safeParse(await jsonBody(request))
    if (!parsed.success) return badRequest('입력값을 확인해주세요')

    /* 시도 제한 키는 「사람이 입력한 그 값」 하나로 센다. 아이디든 이메일이든
       같은 계정을 두 이름으로 두드려 한도를 두 배로 쓰는 일이 없게 정규화한다 */
    const identifier = normalizeUsername(parsed.data.username ?? parsed.data.email ?? '')

    const identity = clientIdentity(request)
    const accountKey = loginAccountKey(identifier)
    const ipKey = loginIpKey(identity)
    const ipQuota = ipQuotaFor(identity, 'login')

    /* 이미 한도를 넘었으면 비밀번호를 **검사하기 전에** 끊는다.
       검사까지 가면 bcrypt 비용이 그대로 공격자의 무기가 된다. */
    const accountState = await peekQuota(accountKey, LOGIN_ACCOUNT_QUOTA)
    if (!accountState.allowed) {
      logThrottle({
        route: 'auth/login',
        reason: 'account',
        key: accountKey,
        retryAfterSeconds: accountState.retryAfterSeconds,
        trust: identity.trust,
      })
      /* 「잠시 후」라고 쓰지 않는다 — **얼마나 잠시인지는 `Retry-After` 가 정확히 안다.**
         화면이 그 값을 읽어 「약 15분 뒤에 다시 시도할 수 있습니다」로 붙인다 (O-029).
         여기서 「잠시 후」까지 쓰면 두 문장이 같은 말을 두 번 하게 된다 */
      return tooManyRequests('로그인 시도가 너무 많습니다.', accountState.retryAfterSeconds)
    }

    const ipState = await peekQuota(ipKey, ipQuota)
    if (!ipState.allowed) {
      logThrottle({
        route: 'auth/login',
        reason: 'ip',
        key: ipKey,
        retryAfterSeconds: ipState.retryAfterSeconds,
        trust: identity.trust,
      })
      return tooManyRequests('로그인 시도가 너무 많습니다.', ipState.retryAfterSeconds)
    }

    const user = await findUserForLogin({
      username: parsed.data.username,
      email: parsed.data.email,
    })
    if (!user || !compareSync(parsed.data.password, user.passwordHash)) {
      // 실패한 시도만 카운터를 올린다
      await consumeQuota(accountKey, LOGIN_ACCOUNT_QUOTA)
      await consumeQuota(ipKey, ipQuota)
      return unauthorized('아이디 또는 비밀번호가 올바르지 않습니다')
    }

    // 성공했으면 그 계정의 실패 기록을 지운다 (정상 사용자가 누적으로 막히지 않게)
    await clearQuota(accountKey)

    return ok(await startSession(user.id))
  })
}
