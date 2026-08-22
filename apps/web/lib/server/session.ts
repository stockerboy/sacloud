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
const REFRESH_COOKIE = 'sacloud_refresh'
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
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000)
  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  })

  /**
   * 리프레시 토큰도 **httpOnly 쿠키로** 내려보낸다.
   *
   * 계약이 응답 본문으로도 주긴 하지만, 브라우저 클라이언트는 그걸 보관할 곳이 마땅치 않다.
   * 쿠키에 두지 않으면 액세스 토큰(1시간)이 만료된 순간 **말없이 로그아웃된다**
   * (실제로 그렇게 됐다). 갱신에 쓸 수 있게 서버가 들고 있는다.
   */
  const store = await cookies()
  store.set(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
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
  store.delete(REFRESH_COOKIE)
}

/** 저장된 리프레시 토큰(쿠키)이 아직 유효하면 사용자 ID를 돌려준다 */
async function userIdFromRefreshCookie(): Promise<string | null> {
  const store = await cookies()
  const token = store.get(REFRESH_COOKIE)?.value
  if (!token) return null

  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) } })
  if (!row || row.revokedAt || row.expiresAt < new Date()) return null
  return row.userId
}

async function tokenFromRequest(request: Request): Promise<string | null> {
  const store = await cookies()
  const fromCookie = store.get(ACCESS_COOKIE)?.value
  if (fromCookie) return fromCookie

  const header = request.headers.get('authorization')
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length)
  return null
}

/**
 * 요청자의 사용자 ID. 로그인하지 않았으면 null.
 *
 * 액세스 토큰이 만료됐으면 **리프레시 쿠키로 조용히 다시 발급한다.**
 * 그렇지 않으면 1시간마다 말없이 로그아웃된다.
 *
 * 이때 리프레시 토큰은 **돌리지 않는다(rotation 안 함).** 한 페이지가 여러 요청을
 * 동시에 보내는데 그중 하나가 돌려버리면 나머지가 무효 토큰을 들고 실패한다.
 * 회전은 명시적인 `POST /auth/token`에서만 한다.
 */
export async function currentUserId(request: Request): Promise<string | null> {
  const token = await tokenFromRequest(request)

  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret())
      if (typeof payload.sub === 'string') return payload.sub
    } catch {
      // 만료·위조 — 아래에서 리프레시로 되살릴 수 있는지 본다
    }
  }

  const userId = await userIdFromRefreshCookie()
  if (!userId) return null

  const renewed = await issueAccessToken(userId)
  await setSessionCookie(renewed.token, renewed.expiresAt)
  return userId
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

/**
 * 운영자 확인 — **서버에서** 판정한다 (Phase 10 · 정책 22).
 *
 * 화면에서 버튼을 감추는 것은 보안이 아니다. 관리자 API는 전부 이 함수를 먼저 부른다.
 * 일반 사용자가 요청을 직접 만들어 보내도 여기서 막힌다.
 *
 * 역할 코드는 `codes.ts` 관측값을 따른다 — `2 = 운영자`.
 */
export const ADMIN_ROLE = 2

export async function requireAdmin(request: Request) {
  const userId = await currentUserId(request)
  if (!userId) return null
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, nickname: true, role: true },
  })
  if (!user || user.role !== ADMIN_ROLE) return null
  return user
}
