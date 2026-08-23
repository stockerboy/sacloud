/**
 * 인증 경로 시도 제한 (D-120).
 *
 * ── 무엇을 막는가
 *   로그인 무차별 대입과 대량 가입이다. 둘 다 서버에서만 막을 수 있다.
 *
 * ── 정상 사용자를 막지 않기 위해
 *   로그인은 **실패만** 센다. 비밀번호를 제대로 넣는 사람은 몇 번을 로그인해도 걸리지 않고,
 *   성공하면 그 계정의 실패 기록을 **즉시 지운다**.
 *
 * ── 두 축으로 센다
 *   계정(이메일)별  — 한 계정을 여러 IP에서 두드리는 공격
 *   IP별           — 한 IP에서 여러 계정을 훑는 공격
 *   둘 중 하나라도 한도를 넘으면 429다.
 *
 * ── 저장소
 *   DB의 `RateLimit` 테이블을 쓴다. 메모리 맵이 아니라서 **인스턴스를 늘려도 그대로 동작한다.**
 *   창(window)이 지나면 자동으로 새 창이 열린다.
 *   부하가 커지면 Redis 같은 전용 저장소로 옮기는 것이 낫다 —
 *   지금 규모(공개 Beta)에서는 DB 한 행 갱신이 병목이 되지 않는다.
 *
 * ── 여기서 절대 하지 않는 것
 *   응답이나 로그에 비밀번호·해시·토큰·이메일 원문을 남기지 않는다.
 *   "몇 번 틀렸는지"도 알려주지 않는다 — 계정 존재 여부를 추측하는 단서가 된다.
 */
import { createHash } from 'node:crypto'
import { prisma } from '@sacloud/db'
import type { EnvLike } from './queries/publicScope'

/* -------------------------------------------------------------------------- */
/* 클라이언트 IP                                                                 */
/* -------------------------------------------------------------------------- */

export type IpTrust = 'trusted-header' | 'forwarded' | 'unknown'

export interface ClientIdentity {
  /** 신뢰 수준에 따라 결정된 클라이언트 IP. 판별 불가면 `null` */
  ip: string | null
  trust: IpTrust
}

/**
 * 신뢰할 수 있는 클라이언트 IP.
 *
 * ── 왜 `x-forwarded-for`를 그냥 믿으면 안 되는가
 *   그 헤더는 **클라이언트가 마음대로 넣을 수 있다.** 프록시가 덮어쓴다는 보장이 없으면
 *   공격자가 요청마다 다른 값을 넣어 IP 기반 제한을 통째로 무력화한다.
 *   지금 구조(`next start` + 터널)에서는 소켓 주소가 항상 127.0.0.1이라 그것도 쓸 수 없다.
 *
 * ── 그래서 **명시적으로 설정할 때만** 헤더를 믿는다
 *   `SACLOUD_CLIENT_IP_HEADER` — 프록시가 **덮어쓰는** 헤더 이름
 *     · Cloudflare  → `cf-connecting-ip` (Cloudflare가 항상 자기 값으로 덮어쓴다)
 *     · 그 외 프록시 → 그 프록시가 보장하는 헤더
 *   `SACLOUD_TRUST_FORWARDED_FOR=true` — 위 헤더가 없을 때만, 차선책으로 XFF 첫 항목을 쓴다
 *
 *   아무것도 설정하지 않으면 **IP를 모르는 것으로 취급한다.** 추측하지 않는다.
 */
export function clientIdentity(
  request: Request,
  env: EnvLike = process.env,
): ClientIdentity {
  const headerName = env.SACLOUD_CLIENT_IP_HEADER?.trim().toLowerCase()
  if (headerName) {
    const value = request.headers.get(headerName)?.trim()
    if (value) return { ip: value, trust: 'trusted-header' }
  }

  if (env.SACLOUD_TRUST_FORWARDED_FOR === 'true') {
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    if (forwarded) return { ip: forwarded, trust: 'forwarded' }
  }

  return { ip: null, trust: 'unknown' }
}

/** IP를 원문으로 저장하지 않는다. 키에는 해시만 쓴다 */
function hashed(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32)
}

/* -------------------------------------------------------------------------- */
/* 카운터                                                                       */
/* -------------------------------------------------------------------------- */

export interface Quota {
  /** 창 안에서 허용하는 횟수 */
  limit: number
  /** 창 길이(초) */
  windowSeconds: number
}

export interface QuotaVerdict {
  allowed: boolean
  /** 막혔을 때 몇 초 뒤에 다시 시도할 수 있는가 */
  retryAfterSeconds: number
}

/**
 * 창(window) 판정 — **순수 함수**.
 *
 * 저장소를 몰라야 규칙만 따로 검증할 수 있다.
 *  · 기록이 없거나 창이 지났으면 → 새 창 (`reset`)
 *  · 한도를 채웠으면 → 거부하고 남은 시간
 *  · 그 외 → 증가
 */
export type WindowAction = 'reset' | 'increment' | 'deny'

export function windowVerdict(
  current: { count: number; windowEnd: Date } | null,
  quota: Quota,
  now: Date,
): { action: WindowAction; retryAfterSeconds: number } {
  if (!current || current.windowEnd <= now) return { action: 'reset', retryAfterSeconds: 0 }
  if (current.count >= quota.limit) {
    return {
      action: 'deny',
      retryAfterSeconds: Math.ceil((current.windowEnd.getTime() - now.getTime()) / 1000),
    }
  }
  return { action: 'increment', retryAfterSeconds: 0 }
}

/**
 * 한도를 확인하고 **한 번 소비한다.**
 *
 * 창이 지났으면 새 창을 연다. 이미 한도를 채웠으면 소비하지 않고 남은 시간을 알려준다.
 * `RateLimit` 행 하나를 트랜잭션 안에서 갱신하므로 동시 요청에도 초과 카운트가 새지 않는다.
 */
export async function consumeQuota(
  key: string,
  quota: Quota,
  now: Date = new Date(),
): Promise<QuotaVerdict> {
  const windowEnd = new Date(now.getTime() + quota.windowSeconds * 1000)

  return prisma.$transaction(async (tx) => {
    const current = await tx.rateLimit.findUnique({ where: { key } })
    const verdict = windowVerdict(current, quota, now)

    if (verdict.action === 'reset') {
      await tx.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, windowEnd },
        update: { count: 1, windowEnd },
      })
      return { allowed: true, retryAfterSeconds: 0 }
    }
    if (verdict.action === 'deny') {
      return { allowed: false, retryAfterSeconds: verdict.retryAfterSeconds }
    }

    await tx.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } })
    return { allowed: true, retryAfterSeconds: 0 }
  })
}

/** 소비하지 않고 상태만 본다 (실패했을 때만 세고 싶을 때 쓴다) */
export async function peekQuota(
  key: string,
  quota: Quota,
  now: Date = new Date(),
): Promise<QuotaVerdict> {
  const current = await prisma.rateLimit.findUnique({ where: { key } })
  const verdict = windowVerdict(current, quota, now)
  return verdict.action === 'deny'
    ? { allowed: false, retryAfterSeconds: verdict.retryAfterSeconds }
    : { allowed: true, retryAfterSeconds: 0 }
}

/** 성공했을 때 그 계정의 실패 기록을 지운다 — 정상 사용자가 누적 때문에 막히지 않게 */
export async function clearQuota(key: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key } })
}

/* -------------------------------------------------------------------------- */
/* 정책                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * 로그인 — 계정별.
 *
 * 15분에 실패 5회. 사람이 비밀번호를 잊어 몇 번 틀리는 것은 통과하고,
 * 사전 공격은 사실상 불가능해진다.
 */
export const LOGIN_ACCOUNT_QUOTA: Quota = { limit: 5, windowSeconds: 15 * 60 }

/** 로그인 — IP별. 한 IP에서 계정을 갈아 가며 두드리는 공격을 막는다 */
export const LOGIN_IP_QUOTA: Quota = { limit: 20, windowSeconds: 15 * 60 }

/**
 * 로그인 — IP를 모를 때의 전체 한도.
 *
 * 헤더 설정이 없으면 모든 요청이 한 바구니에 들어간다. 그래서 **훨씬 느슨하게** 잡는다.
 * 정상 사용자를 막지 않으면서 폭주만 끊는 회로차단기다.
 * 제대로 된 IP 기반 제한을 원하면 `SACLOUD_CLIENT_IP_HEADER`를 설정해야 한다.
 */
export const LOGIN_UNKNOWN_IP_QUOTA: Quota = { limit: 300, windowSeconds: 15 * 60 }

/** 가입 — IP별. 1시간에 3개 */
export const SIGNUP_IP_QUOTA: Quota = { limit: 3, windowSeconds: 60 * 60 }

/** 가입 — IP를 모를 때의 전체 한도 */
export const SIGNUP_UNKNOWN_IP_QUOTA: Quota = { limit: 60, windowSeconds: 60 * 60 }

export function loginAccountKey(email: string): string {
  // 이메일 원문을 키에 넣지 않는다
  return `login:acct:${hashed(email.trim().toLowerCase())}`
}

export function loginIpKey(identity: ClientIdentity): string {
  return identity.ip ? `login:ip:${hashed(identity.ip)}` : 'login:ip:unknown'
}

export function signupIpKey(identity: ClientIdentity): string {
  return identity.ip ? `signup:ip:${hashed(identity.ip)}` : 'signup:ip:unknown'
}

/** IP 신뢰 수준에 맞는 한도를 고른다 */
export function ipQuotaFor(identity: ClientIdentity, kind: 'login' | 'signup'): Quota {
  if (identity.ip === null) {
    return kind === 'login' ? LOGIN_UNKNOWN_IP_QUOTA : SIGNUP_UNKNOWN_IP_QUOTA
  }
  return kind === 'login' ? LOGIN_IP_QUOTA : SIGNUP_IP_QUOTA
}

/* -------------------------------------------------------------------------- */
/* 감사 로그                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * 서버 로그에 남긴다. **식별 가능한 값을 원문으로 남기지 않는다** —
 * 이메일·IP는 해시된 키 안에만 있고, 비밀번호·토큰은 애초에 여기까지 오지 않는다.
 */
export function logThrottle(input: {
  route: string
  reason: 'account' | 'ip'
  key: string
  retryAfterSeconds: number
  trust: IpTrust
}): void {
  console.warn(
    `[rate-limit] ${input.route} blocked reason=${input.reason} key=${input.key} ` +
      `retry_after=${input.retryAfterSeconds}s ip_trust=${input.trust}`,
  )
}
