import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '@sacloud/db'

/**
 * 세션 — 액세스 토큰(JWT) + 리프레시 토큰(불투명 문자열).
 *
 * **계획 문서(IMPLEMENTATION_PLAN 1장)는 Auth.js(NextAuth v5)를 적었지만 쓰지 않는다.**
 * Phase 0에서 확정한 계약이 `/auth/login` → `{ access_token, refresh_token, expires_at, user }`
 * 라는 자체 토큰 흐름을 정의하고 있어서, NextAuth의 세션 모델과 맞지 않는다.
 * 계약이 상위 기준이므로 계약에 맞춰 직접 구현한다 (docs/DECISIONS.md D-025).
 *
 * 토큰 전달 방식
 * - 액세스 토큰은 **httpOnly 쿠키**로도 내려보낸다. 스크립트로 읽을 수 없어 XSS에 덜 취약하다.
 * - 계약이 응답 본문에도 토큰을 요구하므로 본문에도 넣는다.
 * - 요청은 쿠키 → `Authorization: Bearer` 순으로 본다.
 *
 * 리프레시 토큰은 **평문을 저장하지 않는다.** 해시만 DB에 둔다.
 */

const ACCESS_COOKIE = 'sacloud_session'
const ACCESS_TTL_SECONDS = 60 * 60
const REFRESH_TTL_DAYS = 30

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET
  if (!value || value.length < 32) {
    // 비밀키를 코드에 넣지 않는다. 없으면 조용히 넘어가지 않고 즉시 실패시킨다.
    throw new Error('AUTH_SECRET 환경변수가 없거나 너무 짧습니다 (32자 이상)')
  }
  return new TextEncoder().encode(value)
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function issueAccessToken(userId: string): Promise<{
  token: string
  expiresAt: Date
}> {
  const expiresAt = new Date(Date.now() + ACCESS_TTL_SECONDS * 1000)
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret())
  return { token, expiresAt }
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  })
  return token
}

/** 로그인 성공 시 세션 쿠키를 심는다 */
export async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies()
  store.set(ACCESS_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
}

export async function clearSessionCookie() {
  const store = await cookies()
  store.delete(ACCESS_COOKIE)
}

async function tokenFromRequest(request: Request): Promise<string | null> {
  const store = await cookies()
  const fromCookie = store.get(ACCESS_COOKIE)?.value
  if (fromCookie) return fromCookie

  const header = request.headers.get('authorization')
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length)
  return null
}

/** 요청자의 사용자 ID. 로그인하지 않았으면 null. */
export async function currentUserId(request: Request): Promise<string | null> {
  const token = await tokenFromRequest(request)
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret())
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    // 만료·위조 토큰은 비로그인으로 취급한다
    return null
  }
}

/** 요청자 사용자 레코드 (연동된 플레이어·클랜 포함) */
export async function currentUser(request: Request) {
  const userId = await currentUserId(request)
  if (!userId) return null
  return prisma.user.findUnique({
    where: { id: userId },
    include: { playerLink: { include: { player: { include: { clan: true } } } } },
  })
}

/**
 * 비로그인 사용자를 구분하기 위한 키.
 *
 * 추천/비추천 중복 방지와 rate limit에 쓴다. IP를 **그대로 저장하지 않고** 해시한다
 * (개인정보를 원문으로 남기지 않기 위해서다).
 * 프록시 뒤에서는 `x-forwarded-for`가 신뢰 가능한지 확인이 필요하다 — 배포 시 재검토 [미확인].
 */
export function anonymousKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = forwarded || request.headers.get('x-real-ip') || 'unknown'
  return hashToken(`anon:${ip}`)
}

/** 투표자 식별 키 — 로그인 사용자는 userId, 아니면 익명 키 */
export async function voterKey(request: Request): Promise<string> {
  const userId = await currentUserId(request)
  return userId ? `user:${userId}` : `anon:${anonymousKey(request)}`
}
