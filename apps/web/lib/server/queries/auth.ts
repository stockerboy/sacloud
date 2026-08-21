import { prisma } from '@sacloud/db'
import { SIGNUP_ALLOWED_EMAIL_DOMAINS, type AuthSession } from '@sacloud/contract'
import { randomBytes, createHash } from 'node:crypto'
import { toKstIso } from '../format'
import { toUser } from '../mappers'
import { issueAccessToken, issueRefreshToken, setSessionCookie } from '../session'

/**
 * 인증 공통 로직.
 *
 * 원본의 실제 요청/응답 본문은 관측 범위 밖이라 계약(`entities/user.ts`)에서 우리가 확정했다.
 * 관측된 것은 화면 제약뿐이다 — **네이버 메일만 가입 가능**, 가입 시 이메일 인증 진행.
 */

/** 사용자 조회 시 항상 같은 관계를 함께 읽어 `toUser`에 넘긴다 */
export const USER_INCLUDE = {
  playerLink: { include: { player: { include: { clan: true } } } },
} as const

/** 가입 가능한 이메일 도메인인지 (관측: 네이버 메일만) */
export function isAllowedSignupEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase()
  return domain !== undefined && SIGNUP_ALLOWED_EMAIL_DOMAINS.includes(domain as 'naver.com')
}

/** 로그인 성공 후 세션을 발급하고 계약 형태로 돌려준다 */
export async function startSession(userId: string): Promise<AuthSession> {
  const [{ token, expiresAt }, refreshToken, user] = await Promise.all([
    issueAccessToken(userId),
    issueRefreshToken(userId),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, include: USER_INCLUDE }),
  ])

  await setSessionCookie(token, expiresAt)

  return {
    access_token: token,
    refresh_token: refreshToken,
    expires_at: toKstIso(expiresAt),
    user: toUser(user),
  }
}

/**
 * 일회용 토큰 발급 (이메일 인증 / 비밀번호 재설정).
 *
 * 평문은 **응답이나 로그에 남기지 않고** 메일로만 보낸다. DB에는 해시만 저장한다.
 * 메일 발송은 아직 없다 — Phase 7 뒷부분에서 붙인다.
 */
export async function issueAuthToken(
  userId: string,
  kind: 'email_verify' | 'password_reset',
  ttlMinutes: number,
): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  await prisma.authToken.create({
    data: {
      userId,
      kind,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
    },
  })
  return token
}

/** 일회용 토큰을 소모한다. 유효하지 않으면 null. */
export async function consumeAuthToken(
  token: string,
  kind: 'email_verify' | 'password_reset',
): Promise<string | null> {
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const row = await prisma.authToken.findUnique({ where: { tokenHash } })
  if (!row || row.kind !== kind || row.usedAt || row.expiresAt < new Date()) return null
  await prisma.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } })
  return row.userId
}
